/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { APIConnectionError, APIConnectionTimeoutError, APIError, OpenAIError } from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ERROR_CODES, ERROR_MESSAGES, MAX_FEED_GENERATION_COUNT } from "./constants";
import { completionUsage, dailyCaps, DEFAULT_DAILY_BUDGET_USD, DEFAULT_DAILY_HARD_CAP_USD, FALLBACK_COST_PER_CALL_USD, spendDay, worstCaseCallCostUsd } from "./lib/aiSpend";
import { billedFailure, keepAiReservation, keptAiReservation } from "./lib/aiSpendGuard";
import * as aiRateLimitLib from "./lib/aiRateLimit";
import { ensureAiRateLimit, ensureAiUnansweredLeft, holdAiUnanswered, isAiStopError, releaseAiUnanswered } from "./lib/aiRateLimit";
import { convexErrorData } from "./lib/errorData";
import { GENERATION_MODEL, maxOutputTokens, openRouterClient } from "./lib/generationRunner";
import { clampBatchSize, DEFAULT_BLUEPRINT_SLUG } from "./lib/promptArchitecture";

// The model call is the only network edge: stub it on the shared client so the rest
// of the pipeline (budget check, run bookkeeping, spend ledger) runs for real.
const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
const ADMIN = { subject: "admin-clerk", tokenIdentifier: "test|admin-clerk", email: "admin@example.com", metadata: { isAdmin: "true" } };
const ENV_KEYS = ["AI_DAILY_BUDGET_USD", "AI_DAILY_HARD_CAP_USD", "OPENROUTER_MAX_ATTEMPTS"] as const;
const PAUSED = /paused for today/;
const RATE_LIMITED = /a lot of AI requests/;
const MATRIX_LIMITED = /used its matrix fills/;
const TIMED_OUT = new APIConnectionTimeoutError().message;
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Scheduled embedding jobs stay queued instead of running against a real provider.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // Midday Pacific, so a test can't straddle the spend-day boundary.
  vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
  for (const key of ENV_KEYS) delete process.env[key];
  create = vi.spyOn(openRouterClient.chat.completions, "create");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

function completion(content: string, usage?: Record<string, unknown>) {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    created: 0,
    model: "anthropic/claude-haiku-5",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage,
  };
}

/** A refusal from the provider with this HTTP status, as the SDK reports it. */
function refused(status: number, message: string, headers: Record<string, string> = {}) {
  return APIError.generate(status, undefined, message, headers);
}

/**
 * Awaits an action that backs off between provider attempts, moving the faked clock through
 * each wait, so the test neither sleeps nor leaves the pinned spend day.
 */
async function throughBackoff<T>(action: Promise<T>): Promise<T> {
  let settled = false;
  const outcome = action.finally(() => {
    settled = true;
  });
  outcome.catch(() => {});
  const startedAt = performance.now();
  while (!settled) {
    // An action that never settles would otherwise keep this loop, and the faked clock, running
    // into the tests after it.
    if (performance.now() - startedAt > 3000) throw new Error("throughBackoff: the action didn't settle within 3 seconds");
    await vi.advanceTimersByTimeAsync(100);
  }
  return await outcome;
}

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("promptBlueprints", {
      slug: DEFAULT_BLUEPRINT_SLUG,
      version: 1,
      status: "active",
      systemInstruction: "",
      safetyChecklist: [],
      qualityChecklist: [],
      outputFormatInstruction: "",
      createdAt: 0,
      updatedAt: 0,
    });
    const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
    const styleId = await ctx.db.insert("styles", {
      id: "reflective",
      name: "Reflective",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
    });
    const toneId = await ctx.db.insert("tones", {
      id: "warm",
      name: "Warm",
      promptGuidanceForAI: "Be warm",
      color: "#222222",
      icon: "sun",
    });
    const questionId = await ctx.db.insert("questions", {
      text: "What is your favorite breakfast?",
      status: "public",
      ...counters,
    });
    return { meId, styleId, toneId, questionId };
  });
  return { t, ...ids };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

const remix = (t: T, questionId: Awaited<ReturnType<typeof setup>>["questionId"]) =>
  t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });
// One layer below `create`, at the client's network send, so the SDK's own retry and response
// handling run for real. `fetch` is a private field of the SDK client (openai 4.x).
const stubSend = () => {
  create.mockRestore();
  return vi.spyOn(openRouterClient as unknown as { fetch: typeof fetch }, "fetch");
};

async function seedSpend(t: T, spent: { user?: number; system?: number }) {
  await t.run(async (ctx) => {
    for (const spendClass of ["user", "system"] as const) {
      const costUsd = spent[spendClass];
      if (costUsd !== undefined) {
        await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass, costUsd, calls: 1 });
      }
    }
  });
}

/** The prompt's size as the reservation counts it: UTF-8 bytes, not characters. */
function promptBytesOf(call: unknown[]) {
  const { messages } = call[0] as { messages: Array<{ content: string }> };
  return messages.reduce((total, message) => total + new TextEncoder().encode(message.content).length, 0);
}

/**
 * What the last call sent set aside: its upper estimate at the default model's prices. A call
 * that gets no usable answer keeps exactly this as its charge.
 */
function lastSetAside(send?: { mock: { calls: unknown[][] } }): number {
  // With the network send stubbed (stubSend), the request is read from the body that was sent.
  const params = send
    ? JSON.parse((send.mock.calls[send.mock.calls.length - 1][1] as { body: string }).body)
    : create.mock.calls[create.mock.calls.length - 1][0];
  const { max_tokens } = params as { max_tokens: number };
  return worstCaseCallCostUsd(promptBytesOf([params]), max_tokens, { input: 4, output: 20 });
}

async function ledger(t: T) {
  const rows = await t.run(async (ctx) => await ctx.db.query("aiSpendDays").collect());
  return rows.map((row) => [row.day, row.spendClass, row.costUsd, row.calls]).sort();
}

// As many questions as the largest batch holds, so a test can tell how many a call kept.
const TEN_QUESTIONS = JSON.stringify({
  questions: [
    "What small win are you proud of this week?",
    "Which smell takes you straight back to childhood?",
    "What habit would you keep if you moved abroad?",
    "Which song do you skip every single time?",
    "What chore do you secretly enjoy doing?",
    "Which meal would you cook to impress a stranger?",
    "What did you collect when you were ten?",
    "Which street in your town do you like best?",
    "What gift have you kept the longest?",
    "Which board game brings out your worst side?",
  ].map((text) => ({ text })),
});

/** What each call asked the provider for: its output cap, and the number of questions its prompt names. */
function askedFor() {
  return create.mock.calls.map((call: unknown[]) => {
    const { max_tokens, messages } = call[0] as { max_tokens: number; messages: Array<{ content: string }> };
    const asked = /Generate (\S+) ice-breaker questions/.exec(messages[1].content);
    if (!asked) throw new Error("askedFor: the user prompt no longer says \"Generate N ice-breaker questions\"");
    return [max_tokens, asked[1]];
  });
}

describe("recording what a completion cost", () => {
  test("a user's remix charges its reported cost to user spend and stores the usage on its run", async () => {
    const { t, questionId } = await setup();
    create.mockResolvedValue(
      completion("What breakfast would you happily eat every day?", { cost: 0.0042, prompt_tokens: 120, completion_tokens: 18 }) as never,
    );

    const text = await t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });

    expect(text).toBe("What breakfast would you happily eat every day?");
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.0042, 1]]);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      purpose: "remix",
      status: "succeeded",
      costUsd: 0.0042,
      resolvedModel: "anthropic/claude-haiku-5",
      promptTokens: 120,
      completionTokens: 18,
    });
  });

  test("a completion the provider refuses records no spend, fails the run and refunds the quota", async () => {
    const { t, meId, questionId } = await setup();
    create.mockRejectedValue(refused(400, "invalid request") as never);

    await expect(
      t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow("400 invalid request");

    // The reservation made before the call is released: nothing is charged.
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0, 0]]);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([["failed", undefined]]);
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("usage for a run that no longer exists still lands in the ledger", async () => {
    const { t } = await setup();
    const runId = await t.run(async (ctx) => {
      const blueprint = await ctx.db.query("promptBlueprints").first();
      const id = await ctx.db.insert("generationRuns", {
        status: "running",
        purpose: "feed",
        blueprintId: blueprint!._id,
        batchSize: 1,
        model: "@preset/break-the-ice-berg-default",
        temperature: 0.9,
        assembledPrompt: "",
        resultQuestionIds: [],
        createdAt: 0,
      });
      await ctx.db.delete(id);
      return id;
    });

    await t.mutation(internal.internal.aiSpend.settleAiSpend, {
      spendClass: "user",
      day: spendDay(Date.now()),
      reservedUsd: 0,
      costUsd: 0.3,
      runId,
    });

    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.3, 1]]);
  });
});

describe("which spend class a call is charged to", () => {
  test("an admin remix still runs once user AI is paused, and is charged to system spend", async () => {
    const { t, questionId } = await setup();
    await seedSpend(t, { user: 1 });
    create.mockResolvedValue(completion("Which breakfast could you eat forever?", { cost: 0.01 }) as never);

    await expect(t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId })).resolves.toBe(
      "Which breakfast could you eat forever?",
    );

    const today = spendDay(Date.now());
    expect(await ledger(t)).toEqual([
      [today, "system", 0.01, 1],
      [today, "user", 1, 1],
    ]);
  });

  test("admin question previews run once user AI is paused, and are charged to system spend", async () => {
    const { t, styleId, toneId } = await setup();
    await seedSpend(t, { user: 1 });
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small win are you proud of this week?" }] }), { cost: 0.02 }) as never,
    );

    const preview = await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, {
      selectedTags: [],
      styleId,
      toneId,
    });

    expect(preview.text).toBe("What small win are you proud of this week?");
    expect(await ledger(t)).toContainEqual([spendDay(Date.now()), "system", 0.02, 1]);
  });

  test("the daily email keeps generating once user AI is paused, and is charged to system spend", async () => {
    const { t, meId, styleId, toneId } = await setup();
    await seedSpend(t, { user: 1 });
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small win are you proud of this week?" }] }), { cost: 0.03 }) as never,
    );

    const questions = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId: meId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleId,
      anchoredToneId: toneId,
    });

    expect(questions.map((question) => question?.text)).toEqual(["What small win are you proud of this week?"]);
    expect(await ledger(t)).toContainEqual([spendDay(Date.now()), "system", 0.03, 1]);
  });

  test("feed generation is refused once user AI is paused: no model call, no run, and the quota is never charged", async () => {
    const { t, meId, styleId, toneId } = await setup();
    await seedSpend(t, { user: 1 });

    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, {
        count: 1,
        anchoredStyleId: styleId,
        anchoredToneId: toneId,
      }),
    ).rejects.toThrow(PAUSED);

    expect(create).not.toHaveBeenCalled();
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs).toEqual([]);
    expect(usage).toEqual([]);
  });
});

describe("matrix fill", () => {
  async function paidOrgMember() {
    const ctx = await setup();
    const orgId = await ctx.t.run(async (db) => {
      const orgId = await db.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await db.db.insert("organization_members", { userId: ctx.meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    return { ...ctx, orgId };
  }

  test("a single-cell fill is refused once the organization's cells are used, and frees the cell", async () => {
    const { t, orgId } = await paidOrgMember();
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "matrixFillCell", key: orgId, count: 50 });

    await expect(
      t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, {
        organizationId: orgId,
        styleSlug: "reflective",
        toneSlug: "warm",
        topicSlug: "any-topic",
      }),
    ).rejects.toThrow(MATRIX_LIMITED);

    expect(create).not.toHaveBeenCalled();
    const locks = await t.run(async (ctx) => await ctx.db.query("matrixFillCellLocks").collect());
    expect(locks).toEqual([]);
  });

  /** A paid organization with one empty cell to fill: an active style, tone and topic. */
  async function fillableCell() {
    const ctx = await paidOrgMember();
    await ctx.t.run(async (db) => {
      await db.db.insert("styles", { id: "s1", slug: "s1", status: "active", version: 1, name: "s1", structure: "x", color: "#111111", icon: "sparkles" });
      await db.db.insert("tones", { id: "t1", slug: "t1", status: "active", version: 1, name: "t1", promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
      await db.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
    });
    return ctx;
  }
  type Cell = Awaited<ReturnType<typeof fillableCell>>;
  // Both fills, each asked for `count` questions in that cell (or given no count) and returning
  // how many it saved.
  const FILLS = {
    "a single-cell fill": async ({ t, orgId }: Cell, count?: number) =>
      (await t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, { organizationId: orgId, styleSlug: "s1", toneSlug: "t1", topicSlug: "any-topic", count })).count,
    "a batch fill": async ({ t, orgId }: Cell, count?: number) =>
      (
        await t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
          organizationId: orgId,
          axisY: "style",
          axisX: "tone",
          topicSlug: "any-topic",
          cells: [{ ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" }],
          countPerCell: count,
        })
      ).totalQuestionsGenerated,
  };
  const BOTH_FILLS = ["a single-cell fill", "a batch fill"] as const;

  test.each(BOTH_FILLS.flatMap((which) => [Number.NaN, Infinity, -Infinity].map((count) => [which, count] as const)))(
    "%s refuses a count of %s: no cell is claimed, nothing is sent and nothing is charged",
    async (which, count) => {
      const cell = await fillableCell();
      // Only reached if the fill isn't refused.
      create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

      const error = await FILLS[which](cell, count).catch((e: unknown) => e);

      // NaN and the infinities are numbers to the argument check, so the fill has to refuse them.
      expect(error).toBeInstanceOf(ConvexError);
      expect(convexErrorData(error)).toEqual({ code: ERROR_CODES.AI_COUNT_INVALID, message: ERROR_MESSAGES.AI_COUNT_INVALID });
      expect(create).not.toHaveBeenCalled();
      const { runs, locks, limits } = await cell.t.run(async (ctx) => ({
        runs: await ctx.db.query("generationRuns").collect(),
        locks: await ctx.db.query("matrixFillCellLocks").collect(),
        limits: await ctx.db.query("rateLimits").collect(),
      }));
      expect(runs).toEqual([]);
      expect(locks).toEqual([]);
      // None of the team's fills or the person's own requests were used.
      expect(limits).toEqual([]);
      expect(await ledger(cell.t)).toEqual([]);
    },
  );

  // The schedule page asks for one question per cell, and a fill generates one whatever
  // count it is given.
  test.each(BOTH_FILLS.flatMap((which) => [1, -3, 2.7, 10, 50].map((count) => [which, count] as const)))(
    "%s asked for %s questions generates one, under a cap of 2500 tokens",
    async (which, count) => {
      const cell = await fillableCell();
      vi.spyOn(console, "log").mockImplementation(() => {});
      create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

      const saved = await FILLS[which](cell, count);

      expect(saved).toBe(1);
      expect(askedFor()).toEqual([[2500, "1"]]);
      expect(await ledger(cell.t)).toEqual([[spendDay(Date.now()), "user", 0.01, 1]]);
    },
  );

  test.each(BOTH_FILLS)("%s given no count generates one question, under a cap of 2500 tokens", async (which) => {
    const cell = await fillableCell();
    vi.spyOn(console, "log").mockImplementation(() => {});
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

    const saved = await FILLS[which](cell);

    expect(saved).toBe(1);
    expect(askedFor()).toEqual([[2500, "1"]]);
    expect(await ledger(cell.t)).toEqual([[spendDay(Date.now()), "user", 0.01, 1]]);
  });

  test("a single-cell fill refuses a count that isn't a number before it picks a topic", async () => {
    // No topic is named, and the catalog has none to pick from.
    const { t, orgId } = await paidOrgMember();
    // Only reached if the fill isn't refused.
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);
    const fill = (count?: number) =>
      t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, { organizationId: orgId, styleSlug: "reflective", toneSlug: "warm", count });

    // With a count it can use, the fill gets as far as the missing topic.
    await expect(fill()).rejects.toThrow(/No active topics/);
    for (const count of [Number.NaN, Infinity, -Infinity]) {
      const error = await fill(count).catch((e: unknown) => e);
      expect(convexErrorData(error)).toMatchObject({ code: ERROR_CODES.AI_COUNT_INVALID });
    }
    expect(create).not.toHaveBeenCalled();
  });

  test("a single-cell fill refuses a count that isn't a number while another fill holds the cell, and leaves that claim in place", async () => {
    const { t, orgId } = await paidOrgMember();
    await t.run(async (ctx) => {
      await ctx.db.insert("matrixFillCellLocks", { organizationId: orgId, cellKey: "s1|t1|any-topic" });
    });
    // Only reached if the fill isn't refused.
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);
    const fill = (count: number) =>
      t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, { organizationId: orgId, styleSlug: "s1", toneSlug: "t1", topicSlug: "any-topic", count });

    // With a count it can use, a fill that finds the cell held has nothing to do.
    expect(await fill(1)).toEqual({ count: 0, questionIds: [] });
    for (const count of [Number.NaN, Infinity, -Infinity]) {
      const error = await fill(count).catch((e: unknown) => e);
      expect(convexErrorData(error)).toMatchObject({ code: ERROR_CODES.AI_COUNT_INVALID });
    }
    expect(create).not.toHaveBeenCalled();
    const locks = await t.run(async (ctx) => await ctx.db.query("matrixFillCellLocks").collect());
    expect(locks.map((lock) => lock.cellKey)).toEqual(["s1|t1|any-topic"]);
  });

  test("an ordinary per-cell failure still skips that cell and keeps filling the rest", async () => {
    const { t, orgId } = await paidOrgMember();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
      organizationId: orgId,
      axisY: "style",
      axisX: "tone",
      topicSlug: "any-topic",
      cells: [
        { ySlug: "gone-1", xSlug: "warm", styleSlug: "gone-1", toneSlug: "warm" },
        { ySlug: "gone-2", xSlug: "warm", styleSlug: "gone-2", toneSlug: "warm" },
      ],
    });

    expect(result).toMatchObject({ totalCells: 2, filledCells: 0, skippedInvalidTaxonomy: 2 });
    expect(create).not.toHaveBeenCalled();
    const locks = await t.run(async (ctx) => await ctx.db.query("matrixFillCellLocks").collect());
    expect(locks).toEqual([]);
  });
});

describe("a question count that isn't a whole number from one to ten", () => {
  // The count asked for, the questions generated and the output cap. A count that isn't a
  // number is one question, never the largest batch.
  const COUNTS = [
    [Number.NaN, 1, 2500],
    [Infinity, 1, 2500],
    [-Infinity, 1, 2500],
    [-3, 1, 2500],
    [2.7, 2, 2700],
  ] as const;

  test.each(COUNTS)("an admin preview asked for %s questions generates %i, under a cap of %i tokens", async (count, questions, maxTokens) => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

    await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId, count });

    expect(askedFor()).toEqual([[maxTokens, String(questions)]]);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => run.batchSize)).toEqual([questions]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.01, 1]]);
  });

  test.each(COUNTS)("the feed asked for %s questions generates %i, under a cap of %i tokens", async (count, questions, maxTokens) => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

    const generated = await t
      .withIdentity(ME)
      .action(api.core.ai.generateAIQuestionForFeed, { count, anchoredStyleId: styleId, anchoredToneId: toneId });

    expect(generated).toHaveLength(questions);
    expect(askedFor()).toEqual([[maxTokens, String(questions)]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.01, 1]]);
  });

  test.each<[string, { count?: number }]>([
    ["no particular number of", {}],
    ["0", { count: 0 }],
  ])("the feed asked for %s questions generates one, under a cap of 2500 tokens", async (_asked, count) => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

    const generated = await t
      .withIdentity(ME)
      .action(api.core.ai.generateAIQuestionForFeed, { ...count, anchoredStyleId: styleId, anchoredToneId: toneId });

    expect(generated).toHaveLength(1);
    expect(askedFor()).toEqual([[2500, "1"]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.01, 1]]);
  });

});

describe("how many questions one feed request generates", () => {
  // Written from the shared limit, so a feed action that stops reading it fails here when the
  // limit changes. An admin preview can still ask for the ten-question batch limit.
  test.each([MAX_FEED_GENERATION_COUNT, MAX_FEED_GENERATION_COUNT + 1, 10, 50])(
    "the feed asked for %i questions generates no more than the feed page asks for, as one charge",
    async (count) => {
      const { t, styleId, toneId } = await setup();
      create.mockResolvedValue(completion(TEN_QUESTIONS, { cost: 0.01 }) as never);

      const generated = await t
        .withIdentity(ME)
        .action(api.core.ai.generateAIQuestionForFeed, { count, anchoredStyleId: styleId, anchoredToneId: toneId });

      expect(generated).toHaveLength(MAX_FEED_GENERATION_COUNT);
      expect(askedFor()).toEqual([[maxOutputTokens(MAX_FEED_GENERATION_COUNT), String(MAX_FEED_GENERATION_COUNT)]]);
      expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.01, 1]]);
    },
  );
});

describe("helpers", () => {
  test("a batch size that isn't a number is one question, and any other is held to a whole number from one to ten", () => {
    expect([Number.NaN, Infinity, -Infinity].map((value) => clampBatchSize(value))).toEqual([1, 1, 1]);
    expect([-3, 0, 0.4, 1, 2.7, 10, 10.9, 50].map((value) => clampBatchSize(value))).toEqual([1, 1, 1, 1, 2, 10, 10, 10]);
  });

  test("isAiStopError is true only for a paused budget or a rate limit", () => {
    const convexError = (code: string) => new ConvexError({ code, message: "x" });

    expect(isAiStopError(convexError(ERROR_CODES.AI_BUDGET_PAUSED))).toBe(true);
    expect(isAiStopError(convexError(ERROR_CODES.AI_RATE_LIMITED))).toBe(true);
    expect(isAiStopError(convexError(ERROR_CODES.AI_LIMIT_REACHED))).toBe(false);
    expect(isAiStopError(new ConvexError('No active styles entry found for slug "x".'))).toBe(false);
    expect(isAiStopError(new Error(ERROR_CODES.AI_RATE_LIMITED))).toBe(false);
    expect(isAiStopError(undefined)).toBe(false);
  });

  test("a refused token carries the code, the readable message and when to retry", async () => {
    const ctx = { runMutation: vi.fn().mockResolvedValue({ ok: false, retryAt: 1234 }) };

    const error = await ensureAiRateLimit(ctx as never, { name: "matrixFillCell", key: "org-1" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConvexError);
    // The matrix bucket refills over a day, so its message says so.
    expect((error as ConvexError<{ code: string; message: string; retryAt: number }>).data).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_MATRIX_FILL_LIMITED,
      retryAt: 1234,
    });
    expect(ctx.runMutation).toHaveBeenCalledWith(internal.internal.aiRateLimit.consumeAiRateLimit, {
      name: "matrixFillCell",
      key: "org-1",
    });
  });

  test("a free call costs nothing, an unreadable cost is charged the fallback, and bad caps fall back", () => {
    expect(completionUsage({ cost: 0 }, FALLBACK_COST_PER_CALL_USD).costUsd).toBe(0);
    expect(completionUsage({ cost: "0.01" }, FALLBACK_COST_PER_CALL_USD).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);
    expect(completionUsage(null, FALLBACK_COST_PER_CALL_USD).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);

    process.env.AI_DAILY_BUDGET_USD = "-1";
    process.env.AI_DAILY_HARD_CAP_USD = "   ";
    expect(dailyCaps()).toEqual({ budgetUsd: DEFAULT_DAILY_BUDGET_USD, hardCapUsd: DEFAULT_DAILY_HARD_CAP_USD });

    process.env.AI_DAILY_BUDGET_USD = " 2.5 ";
    expect(dailyCaps().budgetUsd).toBe(2.5);
  });
});

describe("review follow-ups", () => {
  test("a completion that comes back unusable was still paid for: it is charged, keeps its quota use and the run keeps its cost", async () => {
    const { t, meId, questionId } = await setup();
    create.mockResolvedValue(completion("", { cost: 0.007, prompt_tokens: 50, completion_tokens: 0 }) as never);

    await expect(
      t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow(/couldn't use/);

    // An empty answer gets one retry, and each attempt is charged on its own run.
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.014, 2]]);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([
      ["failed", 0.007],
      ["failed", 0.007],
    ]);
    // Paid for, so the quota isn't refunded.
    expect(usage.map((row) => row.count)).toEqual([1]);
  });

  test("team previews are user spend: refused once user AI is paused, with no model call or run", async () => {
    const { t, meId, styleId, toneId } = await setup();
    const orgId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    await seedSpend(t, { user: 1 });

    await expect(
      t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId: orgId,
        name: "Recovery",
        guidance: "Talk about rest days",
        styleId,
        toneId,
      }),
    ).rejects.toThrow(PAUSED);

    expect(create).not.toHaveBeenCalled();
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs).toEqual([]);
  });

  test("a fill that runs out of cells mid-batch keeps the cell it generated, stops calling the model and frees every cell", async () => {
    const { t, meId } = await setup();
    const orgId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      for (const slug of ["s1", "s2"]) {
        await ctx.db.insert("styles", { id: slug, slug, status: "active", version: 1, name: slug, structure: "x", color: "#111111", icon: "sparkles" });
      }
      await ctx.db.insert("tones", { id: "t1", slug: "t1", status: "active", version: 1, name: "t1", promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
      await ctx.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
      return orgId;
    });
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "matrixFillCell", key: orgId, count: 49 });
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small thing made you smile today?" }] }), { cost: 0.01 }) as never,
    );

    await expect(
      t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [
          { ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" },
          { ySlug: "s2", xSlug: "t1", styleSlug: "s2", toneSlug: "t1" },
        ],
      }),
    ).rejects.toThrow(/used its matrix fills/);

    expect(create).toHaveBeenCalledTimes(1);
    const { runs, locks } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    // The first cell's generation completed and was recorded; the second never started.
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([["succeeded", 0.01]]);
    expect(locks).toEqual([]);
  });

  test("a negative, fractional or NaN count can't mint tokens or disable a bucket", async () => {
    const { t } = await setup();
    for (const count of [-5, 1.5, Number.NaN]) {
      await expect(
        t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequest", key: ME.subject, count }),
      ).rejects.toThrow(/positive integer/);
    }
  });
});

describe("prompt size", () => {
  test("a remix of an overlong question is refused before the quota charge or any model call", async () => {
    const { t, meId } = await setup();
    // Saved before question text had a length limit.
    const questionId = await t.run(async (ctx) =>
      ctx.db.insert("questions", {
        authorId: meId,
        customText: `${"why ".repeat(300)}?`,
        status: "private",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      }),
    );

    await expect(
      t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow(/too long to remix/);

    expect(create).not.toHaveBeenCalled();
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage).toEqual([]);
  });

  test("any prompt over the size ceiling is refused before the model is called", async () => {
    const { t, styleId, toneId } = await setup();

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, {
        selectedTags: [],
        styleId,
        toneId,
        excludedQuestions: ["x".repeat(50_000)],
      }),
    ).rejects.toThrow(/too large to send to the AI/);

    expect(create).not.toHaveBeenCalled();
  });
});

describe("adversarial review follow-ups", () => {
  test("reservations refuse at the cap even before any call settles, so a burst can't all pass", async () => {
    const { t } = await setup();
    const reserve = () =>
      t.mutation(internal.internal.aiSpend.reserveAiSpend, {
        spendClass: "user",
        day: spendDay(Date.now()),
        budgetUsd: 0.05,
        hardCapUsd: 5,
        reserveUsd: 0.02,
      });

    // $0.00, $0.02 and $0.04 are under $0.05; the fourth sees $0.06 reserved.
    expect([await reserve(), await reserve(), await reserve(), await reserve()]).toEqual([true, true, true, false]);
  });

  test("generation asks the provider for a bounded number of output tokens", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small win are you proud of?" }] }), { cost: 0.01 }) as never,
    );

    await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId });

    // One question: 2,000 for a thinking model's reasoning, then 300 + 200 per question.
    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 2500 });
  });

  test("an admin preview generates with the default model: only the eval harness picks another", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small win are you proud of?" }] }), { cost: 0.01 }) as never,
    );

    await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId });

    expect(create.mock.calls[0][0]).toMatchObject({ model: GENERATION_MODEL });
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => run.model)).toEqual([GENERATION_MODEL]);
  });

  test("a call sets aside an upper estimate of its cost, and a completion with no reported cost keeps it", async () => {
    const { t, styleId, toneId } = await setup();
    let duringCall: unknown[] = [];
    create.mockImplementation((async () => {
      duringCall = await ledger(t);
      return completion(JSON.stringify({ questions: [{ text: "What small win are you proud of?" }] }));
    }) as never);

    await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId });

    // The prompt at 2 bytes a token plus the whole 2,500-token cap, at $4 in and $20 out per
    // million tokens.
    expect(worstCaseCallCostUsd(3000, 2500, { input: 4, output: 20 })).toBeCloseTo(0.056);
    const worstCase = worstCaseCallCostUsd(promptBytesOf(create.mock.calls[0]), 2500, { input: 4, output: 20 });
    expect(worstCase).toBeGreaterThan(0.05);
    expect(duringCall).toEqual([[spendDay(Date.now()), "system", worstCase, 0]]);
    // No cost came back, so the call is charged everything that was set aside for it.
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", worstCase, 1]]);
  });

  test("a remix leaves room for a thinking model's reasoning", async () => {
    const { t, questionId } = await setup();
    create.mockResolvedValue(completion("What breakfast would you happily eat every day?", { cost: 0.0042 }) as never);

    await t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });

    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 2150 });
  });

  test("an oversized prompt leaves no run row behind", async () => {
    const { t, styleId, toneId } = await setup();

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, {
        selectedTags: [],
        styleId,
        toneId,
        excludedQuestions: ["x".repeat(50_000)],
      }),
    ).rejects.toThrow(/too large to send to the AI/);

    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs).toEqual([]);
  });

  test("error data is read whether it arrives as an object or as a JSON string", () => {
    expect(convexErrorData(new ConvexError({ code: "X", billed: true }))).toEqual({ code: "X", billed: true });
    expect(convexErrorData(new ConvexError(JSON.stringify({ code: "Y" })))).toEqual({ code: "Y" });
    expect(convexErrorData(new ConvexError("not json"))).toBeUndefined();
    expect(convexErrorData(new Error("plain"))).toBeUndefined();
  });
});

describe("delta review follow-ups", () => {
  test("a settle retried after it already committed doesn't adjust the ledger twice", async () => {
    const { t } = await setup();
    const day = spendDay(Date.now());
    const runId = await t.run(async (ctx) => {
      const blueprintId = (await ctx.db.query("promptBlueprints").first())!._id;
      return await ctx.db.insert("generationRuns", {
        status: "running",
        purpose: "remix",
        blueprintId,
        batchSize: 1,
        model: "@preset/break-the-ice-berg-default",
        temperature: 0.9,
        assembledPrompt: "",
        resultQuestionIds: [],
        createdAt: 0,
      });
    });
    await t.mutation(internal.internal.aiSpend.reserveAiSpend, {
      spendClass: "user",
      day,
      budgetUsd: 1,
      hardCapUsd: 5,
      reserveUsd: 0.02,
    });
    const settle = () =>
      t.mutation(internal.internal.aiSpend.settleAiSpend, {
        spendClass: "user",
        day,
        reservedUsd: 0.02,
        costUsd: 0.005,
        runId,
      });

    await settle();
    await settle();

    expect(await ledger(t)).toEqual([[day, "user", 0.005, 1]]);
  });

  test("a response cut off by our own output cap is recorded as spend but refunds the user's quota", async () => {
    const { t, meId, questionId } = await setup();
    const truncated = completion("", { cost: 0.006 });
    truncated.choices[0].finish_reason = "length";
    create.mockResolvedValue(truncated as never);

    await expect(
      t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow();

    // Cut off by our own cap, so it isn't retried.
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.006, 1]]);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);
  });
});

describe("room for a thinking model's reasoning", () => {
  const questionsJson = (...texts: string[]) => JSON.stringify({ questions: texts.map((text) => ({ text })) });
  const cutOff = (content: string, cost: number) => {
    const truncated = completion(content, { cost });
    truncated.choices[0].finish_reason = "length";
    return truncated;
  };

  test("a five-question feed batch asks for the reasoning allowance plus room for every question", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(
      completion(
        questionsJson(
          "What small win are you proud of this week?",
          "Which smell takes you straight back to childhood?",
          "What habit would you keep if you moved abroad?",
          "Which song do you skip every single time?",
          "What chore do you secretly enjoy doing?",
        ),
        { cost: 0.01 },
      ) as never,
    );

    const questions = await t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, {
      count: 5,
      anchoredStyleId: styleId,
      anchoredToneId: toneId,
    });

    expect(questions).toHaveLength(5);
    // 2,000 for the reasoning, then 300 + 200 per question.
    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 3300 });
  });

  test("a team's three-question topic preview asks for room for all three", async () => {
    const { t, meId, styleId, toneId } = await setup();
    const organizationId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    create.mockResolvedValue(
      completion(
        questionsJson(
          "What does a good rest day look like for you?",
          "Which recovery habit have you stuck with longest?",
          "When did skipping a rest day cost you?",
        ),
        { cost: 0.01 },
      ) as never,
    );

    const preview = await t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
      organizationId,
      name: "Recovery",
      guidance: "Talk about rest days",
      styleId,
      toneId,
    });

    expect(preview.questions).toHaveLength(3);
    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 2900 });
  });

  test("the cap follows the batch size the prompt was built for, from one question up to the ten-question limit", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(completion(questionsJson("What small win are you proud of?"), { cost: 0.01 }) as never);

    for (const count of [0, 10, 50]) {
      await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId, count });
    }

    // A count of 0 builds a one-question prompt, and 50 is held to the ten-question batch limit.
    expect(create.mock.calls.map((call: unknown[]) => (call[0] as { max_tokens: number }).max_tokens)).toEqual([2500, 4300, 4300]);
  });

  test("a batch cut off mid-JSON isn't retried: the run keeps the partial answer, the cost is recorded and the quota is refunded", async () => {
    const { t, meId, styleId, toneId } = await setup();
    const partial = '{"questions":[{"text":"What small win are you pro';
    create.mockResolvedValue(cutOff(partial, 0.006) as never);

    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleId, anchoredToneId: toneId }),
    ).rejects.toThrow(/could not be read/);

    // The same request under the same cap would be cut off again.
    expect(create).toHaveBeenCalledTimes(1);
    const { runs, usage, questions } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
      questions: await ctx.db.query("questions").collect(),
    }));
    expect(runs.map((run) => [run.purpose, run.status, run.rawResponse, run.costUsd])).toEqual([
      ["feed", "failed", partial, 0.006],
    ]);
    expect(runs[0].error).toMatch(/could not be read/);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.006, 1]]);
    expect(usage.map((row) => row.count)).toEqual([0]);
    // Only the question the setup made: nothing from the cut-off answer was saved.
    expect(questions.map((question) => question.text)).toEqual(["What is your favorite breakfast?"]);
  });

  test("a remix cut off partway through fails instead of returning half a question", async () => {
    const { t, meId, questionId } = await setup();
    create.mockResolvedValue(cutOff("What breakfast would you happ", 0.004) as never);

    await expect(t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId })).rejects.toThrow(
      /cut off/,
    );

    expect(create).toHaveBeenCalledTimes(1);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.purpose, run.status, run.rawResponse, run.costUsd])).toEqual([
      ["remix", "failed", "What breakfast would you happ", 0.004],
    ]);
    expect(runs[0].error).toMatch(/cut off/);
    expect(runs[0].previewText).toBeUndefined();
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.004, 1]]);
    // Our cap cut it off, so the person keeps their quota.
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("a paid-for unusable remix keeps the quota use even when its retry was cut off", async () => {
    const { t, meId, questionId } = await setup();
    create
      .mockResolvedValueOnce(completion('""', { cost: 0.004 }) as never)
      .mockResolvedValueOnce(cutOff("What breakfast would you happ", 0.004) as never);

    await expect(t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId })).rejects.toThrow(
      /couldn't use/,
    );

    expect(create).toHaveBeenCalledTimes(2);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.status, run.rawResponse])).toEqual([
      ["failed", '""'],
      ["failed", "What breakfast would you happ"],
    ]);
    // The first answer was paid for in full, so the use counts.
    expect(usage.map((row) => row.count)).toEqual([1]);
  });

  test("an admin preview cut off by the cap isn't retried, fails its run and is charged to system spend", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(cutOff("", 0.005) as never);

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId }),
    ).rejects.toThrow(/empty completion.*finish_reason=length/);

    expect(create).toHaveBeenCalledTimes(1);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => [run.purpose, run.status, run.costUsd])).toEqual([["admin_preview", "failed", 0.005]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.005, 1]]);
  });
});

describe("what a call in flight sets aside", () => {
  const opus = { input: 4, output: 20 };

  test("a remix sets aside its own smaller worst case as user spend, then gives back all but what it cost", async () => {
    const { t, questionId } = await setup();
    let duringCall: unknown[] = [];
    create.mockImplementation((async () => {
      duringCall = await ledger(t);
      return completion("What breakfast would you happily eat every day?", { cost: 0.0042 });
    }) as never);

    await t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });

    // A remix is capped at 2,150 output tokens, so less is set aside than for a batch of questions.
    const worstCase = worstCaseCallCostUsd(promptBytesOf(create.mock.calls[0]), 2150, opus);
    expect(worstCase).toBeGreaterThan(0.043);
    expect(worstCase).toBeLessThan(worstCaseCallCostUsd(0, 2500, opus));
    expect(duringCall).toEqual([[spendDay(Date.now()), "user", worstCase, 0]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.0042, 1]]);
  });

  test("a prompt outside Latin script is counted by its bytes, about a token a character", async () => {
    const { t, meId } = await setup();
    const questionId = await t.run((ctx) =>
      ctx.db.insert("questions", { authorId: meId, customText: `${"朝".repeat(900)}？`, status: "private", ...counters }),
    );
    let duringCall: unknown[][] = [];
    create.mockImplementation((async () => {
      duringCall = await ledger(t);
      return completion("朝ごはんは何が好きですか？", { cost: 0.004 });
    }) as never);

    await t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });

    // Each of these characters is one token or more and three bytes. Counted as characters, 900
    // of them would be set aside as fewer tokens than they are.
    const { messages } = create.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const promptChars = messages.reduce((total, message) => total + message.content.length, 0);
    const promptBytes = promptBytesOf(create.mock.calls[0]);
    expect(promptBytes).toBeGreaterThan(promptChars + 1800);
    expect(duringCall).toEqual([[spendDay(Date.now()), "user", worstCaseCallCostUsd(promptBytes, 2150, opus), 0]]);
    expect(duringCall[0][2]).toBeGreaterThan(worstCaseCallCostUsd(0, 2150, opus) + (900 * 4) / 1_000_000);
  });

  test("a five-question feed batch sets aside more than a single question does", async () => {
    const { t, styleId, toneId } = await setup();
    let duringCall: unknown[] = [];
    create.mockImplementation((async () => {
      duringCall = await ledger(t);
      return completion(
        JSON.stringify({
          questions: [
            { text: "What small win are you proud of this week?" },
            { text: "Which smell takes you straight back to childhood?" },
            { text: "What habit would you keep if you moved abroad?" },
            { text: "Which song do you skip every single time?" },
            { text: "What chore do you secretly enjoy doing?" },
          ],
        }),
        { cost: 0.011 },
      );
    }) as never);

    await t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { count: 5, anchoredStyleId: styleId, anchoredToneId: toneId });

    // The cap for five questions is 3,300 tokens: $0.066 of output before the prompt is counted.
    const worstCase = worstCaseCallCostUsd(promptBytesOf(create.mock.calls[0]), 3300, opus);
    expect(worstCase).toBeGreaterThan(0.066);
    expect(duringCall).toEqual([[spendDay(Date.now()), "user", worstCase, 0]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.011, 1]]);
  });

  test("a call in flight counts at its worst case, so a second is refused until the first settles to what it cost", async () => {
    // Above the old flat $0.02 a call, below what a remix can cost.
    process.env.AI_DAILY_BUDGET_USD = "0.04";
    const { t, meId, questionId } = await setup();
    const remix = () => t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });
    let second: unknown;
    // Only reached if the second call gets through to the provider.
    create.mockResolvedValue(completion("Should never be asked for?", { cost: 0.004 }) as never);
    create.mockImplementationOnce((async () => {
      // Asked for while the first call is still waiting on the provider.
      second = await remix().catch((error: unknown) => error);
      return completion("What breakfast would you happily eat every day?", { cost: 0.004 });
    }) as never);

    await expect(remix()).resolves.toBe("What breakfast would you happily eat every day?");

    expect(convexErrorData(second)).toMatchObject({ code: ERROR_CODES.AI_BUDGET_PAUSED });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.004, 1]]);
    // The refused call made no run and used none of the person's quota.
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => run.status)).toEqual(["succeeded"]);
    expect(usage.map((row) => row.count)).toEqual([1]);

    // Settled to $0.004, the budget has room again.
    create.mockResolvedValueOnce(completion("Which breakfast could you eat forever?", { cost: 0.004 }) as never);
    await expect(remix()).resolves.toBe("Which breakfast could you eat forever?");
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.008, 2]]);
  });

  test("a failed call gives back everything it set aside, however much that was", async () => {
    const { t, styleId, toneId } = await setup();
    let duringCall: unknown[] = [];
    create.mockImplementation((async () => {
      duringCall = await ledger(t);
      throw refused(400, "invalid request");
    }) as never);

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId, count: 10 }),
    ).rejects.toThrow("400 invalid request");

    // Ten questions: 4,300 tokens of output, $0.086, before the prompt is counted.
    const worstCase = worstCaseCallCostUsd(promptBytesOf(create.mock.calls[0]), 4300, opus);
    expect(worstCase).toBeGreaterThan(0.086);
    expect(duringCall).toEqual([[spendDay(Date.now()), "system", worstCase, 0]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0, 0]]);
  });

  test("the feed and a remix ask for the named default model and record it on their runs", async () => {
    // A model's own name, not an OpenRouter preset that can be repointed without a diff. The
    // prices in this file are this model's: a change of model means new ones.
    expect(GENERATION_MODEL).toBe("anthropic/claude-opus-5.5");
    const { t, styleId, toneId, questionId } = await setup();
    create
      .mockResolvedValueOnce(completion(JSON.stringify({ questions: [{ text: "What small win are you proud of this week?" }] }), { cost: 0.01 }) as never)
      .mockResolvedValueOnce(completion("What breakfast would you happily eat every day?", { cost: 0.004 }) as never);

    await t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { count: 1, anchoredStyleId: styleId, anchoredToneId: toneId });
    await t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId });

    expect(create.mock.calls.map((call: unknown[]) => (call[0] as { model: string }).model)).toEqual([GENERATION_MODEL, GENERATION_MODEL]);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => [run.purpose, run.model])).toEqual([
      ["feed", GENERATION_MODEL],
      ["remix", GENERATION_MODEL],
    ]);
  });
});

describe("provider retries", () => {
  // The backoff between attempts uses setTimeout: throughBackoff moves the faked clock through it.

  test("a refused attempt releases its reservation; the successful retry is settled once", async () => {
    const { t, questionId } = await setup();
    create
      .mockRejectedValueOnce(refused(429, "Too Many Requests") as never)
      .mockResolvedValueOnce(completion("A quicker take on breakfast?", { cost: 0.004 }) as never);

    await throughBackoff(remix(t, questionId));

    expect(create).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.004, 1]]);
  });

  test("each retry is checked against the budget again", async () => {
    const { t, questionId } = await setup();
    create.mockImplementationOnce((async () => {
      // Other spend uses up the budget while this attempt is failing.
      await t.run(async (ctx) => {
        await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 5, calls: 1 });
      });
      throw refused(503, "Service Unavailable");
    }) as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(PAUSED);

    expect(create).toHaveBeenCalledTimes(1);
  });

  test("a dropped connection is retried and gives its reservation back", async () => {
    const { t, questionId } = await setup();
    create
      .mockRejectedValueOnce(new APIConnectionError({ message: "Connection error." }) as never)
      .mockResolvedValueOnce(completion("A quicker take on breakfast?", { cost: 0.004 }) as never);

    await throughBackoff(remix(t, questionId));

    expect(create).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.004, 1]]);
  });

  test("the SDK's own retries are off, so every send goes through createChatCompletionWithRetry with its own reservation", () => {
    expect(openRouterClient.maxRetries).toBe(0);
  });

  test("a 503 response reaches the provider once per attempt and gives each reservation back", async () => {
    process.env.OPENROUTER_MAX_ATTEMPTS = "2";
    const { t, questionId } = await setup();
    const send = stubSend().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "upstream down" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/503/);

    // Two attempts, two sends: the SDK adds none of its own.
    expect(send).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0, 0]]);
  });

  test("a short Retry-After from the provider is waited out before the retry", async () => {
    const { t, questionId } = await setup();
    const sentAt: number[] = [];
    create.mockImplementation((async () => {
      sentAt.push(Date.now());
      if (sentAt.length === 1) throw refused(429, "Too Many Requests", { "retry-after": "2" });
      return completion("A quicker take on breakfast?", { cost: 0.004 });
    }) as never);

    await throughBackoff(remix(t, questionId));

    // The provider asked for 2 seconds; the loop's own backoff would have been 300ms.
    expect(sentAt).toHaveLength(2);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(2000);
  });

  test("a Retry-After of exactly 20 seconds is still waited out", async () => {
    const { t, questionId } = await setup();
    const sentAt: number[] = [];
    create.mockImplementation((async () => {
      sentAt.push(Date.now());
      if (sentAt.length === 1) throw refused(429, "Too Many Requests", { "retry-after": "20" });
      return completion("A quicker take on breakfast?", { cost: 0.004 });
    }) as never);

    await throughBackoff(remix(t, questionId));

    expect(sentAt).toHaveLength(2);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(20_000);
  });

  test("a Retry-After over 20 seconds ends the retries: the request fails at once instead of holding the action", async () => {
    const { t, questionId } = await setup();
    create.mockRejectedValue(refused(429, "Too Many Requests", { "retry-after": "21" }) as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/429/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0, 0]]);
  });

  test("a Retry-After given as a date is waited out, and one over 20 seconds away ends the retries", async () => {
    const { t, questionId } = await setup();
    const sentAt: number[] = [];
    create.mockImplementation((async () => {
      sentAt.push(Date.now());
      if (sentAt.length === 1) {
        throw refused(429, "Too Many Requests", { "retry-after": new Date(Date.now() + 5000).toUTCString() });
      }
      if (sentAt.length === 2) {
        throw refused(429, "Too Many Requests", { "retry-after": new Date(Date.now() + 60_000).toUTCString() });
      }
      return completion("A quicker take on breakfast?", { cost: 0.004 });
    }) as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/429/);

    // The first date was 5 seconds off (an HTTP date drops the milliseconds); the second was too far.
    expect(sentAt).toHaveLength(2);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(4000);
  });

  test("a 408 from the provider is retried and gives its reservation back", async () => {
    const { t, questionId } = await setup();
    create
      .mockRejectedValueOnce(refused(408, "Request Timeout") as never)
      .mockResolvedValueOnce(completion("A quicker take on breakfast?", { cost: 0.004 }) as never);

    await throughBackoff(remix(t, questionId));

    expect(create).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.004, 1]]);
  });

  test("an error the SDK raises before sending anything gives its reservation back and isn't retried", async () => {
    const { t, questionId } = await setup();
    create.mockRejectedValue(new OpenAIError("timeout must be an integer") as never);

    await expect(remix(t, questionId)).rejects.toThrow(/must be an integer/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0, 0]]);
  });
});

describe("calls that may have been billed without an answer", () => {

  test("a timed-out call isn't sent again: it keeps its one reservation, fails its run and refunds the quota", async () => {
    const { t, meId, questionId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);

    // The provider may still have run and billed the abandoned send, so what was set aside stays.
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    // The person got nothing, so they keep their use; the run has no reported cost to show.
    expect(runs.map((run) => [run.status, run.costUsd, run.error])).toEqual([["failed", undefined, TIMED_OUT]]);
    expect(usage.map((row) => row.count)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Keeping the user spend reservation for run /));
  });

  test("a request abandoned at the timeout reaches the provider once", async () => {
    const { t, questionId } = await setup();
    // An aborted send is what the SDK's own timeout produces.
    const send = stubSend().mockRejectedValue(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(TIMED_OUT);

    // One request, one send: neither the SDK nor the retry loop sends it again.
    expect(send).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(send), 1]]);
  });

  test("a timed-out call counts toward the cap: the next request is refused once the budget is used", async () => {
    process.env.AI_DAILY_BUDGET_USD = "0.02";
    const { t, questionId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).rejects.toThrow(PAUSED);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
  });

  test("a refused attempt followed by a timeout gives back the first reservation and keeps only the second", async () => {
    const { t, meId, questionId } = await setup();
    create
      .mockRejectedValueOnce(refused(429, "Too Many Requests") as never)
      .mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(TIMED_OUT);

    // The timeout ends the request: there is no third attempt.
    expect(create).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("a response that arrived but couldn't be parsed keeps its reservation and isn't sent again", async () => {
    const { t, meId, questionId } = await setup();
    const send = stubSend().mockImplementation(
      async () =>
        new Response('{"id":"gen-1","choices":[{"message":{"content":"What bre', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow();

    // The provider answered, so it billed: what was set aside stays although no cost was reported.
    expect(send).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(send), 1]]);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([["failed", undefined]]);
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("an empty reply from the provider keeps its reservation and isn't sent again", async () => {
    const { t, questionId } = await setup();
    // A body of `null` (or a 204) parses, but to no completion at all.
    const send = stubSend().mockImplementation(
      async () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/no completion/);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(send), 1]]);
  });

  test.each([
    ["an HTML page", "<html>Bad gateway</html>", { "content-type": "text/html" }],
    ["an empty body", null, {}],
    ["a JSON string", '"oops"', { "content-type": "application/json" }],
    ["a JSON list", "[]", { "content-type": "application/json" }],
  ] as const)("a 200 reply that is %s, not a completion, keeps its reservation and isn't sent again", async (_what, body, headers) => {
    const { t, meId, questionId } = await setup();
    const send = stubSend().mockImplementation(async () => new Response(body, { status: 200, headers }));

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/no completion/);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(send), 1]]);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("an unparseable response isn't taken for a refusal because its error mentions a number like 502", async () => {
    const { t, questionId } = await setup();
    create.mockRejectedValue(new SyntaxError("Unexpected token < in JSON at position 502") as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/position 502/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
  });

  test("feed generation that times out fails its run, saves nothing and refunds the quota", async () => {
    const { t, meId, styleId, toneId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleId, anchoredToneId: toneId }),
    ).rejects.toThrow(TIMED_OUT);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
    const { runs, usage, questions } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
      questions: await ctx.db.query("questions").collect(),
    }));
    expect(runs.map((run) => [run.purpose, run.status, run.costUsd, run.error])).toEqual([
      ["feed", "failed", undefined, TIMED_OUT],
    ]);
    expect(usage.map((row) => row.count)).toEqual([0]);
    // Only the question the setup made.
    expect(questions.map((question) => question.text)).toEqual(["What is your favorite breakfast?"]);
  });

  test("a daily-email generation that times out stays charged to system spend, not user spend", async () => {
    const { t, meId, styleId, toneId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(
      t.action(internal.internal.ai.generateAIQuestionForUser, {
        userId: meId,
        bypassAIUsage: true,
        purpose: "newsletter",
        anchoredStyleId: styleId,
        anchoredToneId: toneId,
      }),
    ).rejects.toThrow(TIMED_OUT);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", lastSetAside(), 1]]);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => [run.purpose, run.status, run.costUsd])).toEqual([["newsletter", "failed", undefined]]);
  });

  test("an admin preview that times out fails its run and stays charged to system spend", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId }),
    ).rejects.toThrow(TIMED_OUT);

    expect(create).toHaveBeenCalledTimes(1);
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => [run.purpose, run.status, run.costUsd])).toEqual([["admin_preview", "failed", undefined]]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", lastSetAside(), 1]]);
  });

  test("a team topic preview that times out keeps its reservation on user spend and refunds the preview use", async () => {
    const { t, meId, styleId, toneId } = await setup();
    const organizationId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(
      t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId,
        name: "Recovery",
        guidance: "Talk about rest days",
        styleId,
        toneId,
      }),
    ).rejects.toThrow(TIMED_OUT);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("a paid-for unusable remix keeps the quota use even when its retry timed out", async () => {
    const { t, meId, questionId } = await setup();
    create
      .mockResolvedValueOnce(completion('""', { cost: 0.004 }) as never)
      .mockRejectedValueOnce(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(/couldn't use/);

    expect(create).toHaveBeenCalledTimes(2);
    // The answered call settles to its real $0.004; the timed-out one keeps what it set aside.
    const [[, , spent, calls]] = await ledger(t);
    expect(spent).toBeCloseTo(0.004 + lastSetAside(), 9);
    expect(calls).toBe(2);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([
      ["failed", 0.004],
      ["failed", undefined],
    ]);
    // The first answer was paid for in full, so the use counts.
    expect(usage.map((row) => row.count)).toEqual([1]);
  });

  test("a matrix cell that times out stops the fill and says how far it got: later cells aren't tried, one reservation is kept and the lock is freed", async () => {
    const { t, meId } = await setup();
    const orgId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      for (const slug of ["s1", "s2"]) {
        await ctx.db.insert("styles", { id: slug, slug, status: "active", version: 1, name: slug, structure: "x", color: "#111111", icon: "sparkles" });
      }
      await ctx.db.insert("tones", { id: "t1", slug: "t1", status: "active", version: 1, name: "t1", promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
      await ctx.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
      return orgId;
    });
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const stopped = await t
      .withIdentity(ME)
      .action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [
          { ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" },
          { ySlug: "s2", xSlug: "t1", styleSlug: "s2", toneSlug: "t1" },
        ],
      })
      .catch((error: unknown) => error);

    // The manager is told how far the fill got; the provider's error goes to the log.
    expect(convexErrorData(stopped)).toEqual({
      code: ERROR_CODES.AI_GENERATION_FAILED,
      message: "Filled 0 cells, then stopped because the AI didn't finish an answer. The filled cells are saved. Try the rest again later.",
      filledCells: 0,
      totalCells: 2,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/Stopped the matrix fill at \(style=s1, tone=t1\)/),
      expect.objectContaining({ message: TIMED_OUT }),
    );

    // The second cell would very likely time out too, and keep a reservation of its own.
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", lastSetAside(), 1]]);
    const { runs, locks } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    expect(runs.map((run) => [run.status, run.costUsd])).toEqual([["failed", undefined]]);
    expect(locks).toEqual([]);
  });

  test("the nightly pool stops at a combination that times out and reports it", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      // The pool only runs when a daily-email subscriber is close to running out of unseen questions.
      await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk", newsletterSubscriptionStatus: "subscribed" });
      await ctx.db.insert("styles", { id: "playful", name: "Playful", structure: "Ask something playful", color: "#333333", icon: "sparkles" });
    });
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    const result = await t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 1, maxCombinations: 2 });

    // Two style and tone combinations were due; the second isn't tried.
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ questionsGenerated: 0, combinationsProcessed: 1 });
    expect(result.errors).toEqual([expect.stringContaining(TIMED_OUT)]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", lastSetAside(), 1]]);
  });

  test("the nightly pool carries on past a combination the provider refuses", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk", newsletterSubscriptionStatus: "subscribed" });
      await ctx.db.insert("styles", { id: "playful", name: "Playful", structure: "Ask something playful", color: "#333333", icon: "sparkles" });
    });
    create
      .mockRejectedValueOnce(refused(400, "invalid request") as never)
      .mockResolvedValueOnce(
        completion(JSON.stringify({ questions: [{ text: "What small win are you proud of this week?" }] }), { cost: 0.01 }) as never,
      );

    const result = await t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 1, maxCombinations: 2 });

    // A refusal gave its reservation back, so the next combination is still tried.
    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ questionsGenerated: 1, combinationsProcessed: 2 });
    expect(result.errors).toEqual([expect.stringContaining("400 invalid request")]);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.01, 1]]);
  });

  test("a failure to count a kept reservation is logged, never thrown, and isn't retried in the background", async () => {
    const ctx = {
      runMutation: vi.fn().mockRejectedValue(new Error("write conflict")),
      scheduler: { runAfter: vi.fn() },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reservation = { spendClass: "user" as const, day: "2026-09-29", reservedUsd: 0.02 };

    const timedOut = new APIConnectionTimeoutError();

    await expect(keepAiReservation(ctx as never, reservation, timedOut)).resolves.toBeUndefined();

    // The reservation is still on the ledger, so a batch must still stop here.
    expect(keptAiReservation(timedOut)).toBe(true);
    // Settled to the amount already reserved, on the reservation's own day, with no run named.
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe("internal/aiSpend:settleAiSpend");
    expect(ctx.runMutation.mock.calls[0][1]).toEqual({ ...reservation, costUsd: 0.02 });
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  test("a failure that kept its reservation is still recognised once it is marked billed", async () => {
    const ctx = { runMutation: vi.fn().mockResolvedValue(null), scheduler: { runAfter: vi.fn() } };
    const reservation = { spendClass: "user" as const, day: "2026-09-29", reservedUsd: 0.02 };
    const timedOut = new APIConnectionTimeoutError();

    await keepAiReservation(ctx as never, reservation, timedOut);

    expect(keptAiReservation(timedOut)).toBe(true);
    // A paid-for first answer followed by a timed-out retry is rethrown as a billed failure.
    expect(keptAiReservation(billedFailure(timedOut))).toBe(true);
    expect(keptAiReservation(billedFailure(new Error("400 invalid request")))).toBe(false);
    expect(keptAiReservation(refused(429, "Too Many Requests"))).toBe(false);
  });
});

describe("calls a person may have unanswered in one day", () => {
  const UNANSWERED = /still running or got no answer/;

  /** What is left of a person's five slots, as their row holds it. No row: none was ever held. */
  async function slotsLeft(t: T, key = ME.subject) {
    const rows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
    return rows.find((row) => row.name === "aiUnanswered" && row.key === key)?.value;
  }

  /** Holds all five of a person's slots for today, as five calls that got no answer would. */
  async function holdEverySlot(t: T, key = ME.subject) {
    for (let i = 0; i < 5; i++) {
      expect(await t.mutation(internal.internal.aiRateLimit.holdAiUnanswered, { key })).toMatchObject({ ok: true });
    }
  }

  async function matrixOrg(t: T, meId: Awaited<ReturnType<typeof setup>>["meId"]) {
    return await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      for (const slug of ["s1", "s2"]) {
        await ctx.db.insert("styles", { id: slug, slug, status: "active", version: 1, name: slug, structure: "x", color: "#111111", icon: "sparkles" });
      }
      await ctx.db.insert("tones", { id: "t1", slug: "t1", status: "active", version: 1, name: "t1", promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
      await ctx.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
      return orgId;
    });
  }

  /** What is left of an organization's matrix fills, as its row holds it. No row: none was taken. */
  async function matrixFillsLeft(t: T, orgId: string) {
    const rows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
    return rows.filter((row) => row.name === "matrixFillCell" && row.key === orgId).map((row) => row.value);
  }

  test("after five calls that got no answer the next request is refused before any model call, until the next day", async () => {
    const { t, meId, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    for (let i = 0; i < 5; i++) await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    const refusal = await remix(t, questionId).catch((error: unknown) => error);

    // Refused like any other per-person limit, and told when the next spend day starts.
    expect(convexErrorData(refusal)).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
      retryAt: Date.UTC(2026, 8, 30, 7, 0),
    });
    expect(create).toHaveBeenCalledTimes(5);
    const [[day, spendClass, spent, calls]] = await ledger(t);
    expect([day, spendClass, calls]).toEqual([spendDay(Date.now()), "user", 5]);
    expect(spent).toBeCloseTo(5 * lastSetAside(), 9);
    // The refusal made no run, and none of the six requests cost the person a plan use.
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(runs.map((run) => run.status)).toEqual(["failed", "failed", "failed", "failed", "failed"]);
    expect(usage.map((row) => row.count)).toEqual([0]);

    // 11:59pm in Los Angeles is still that day; 12:01am is the next.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 6, 59));
    await expect(remix(t, questionId)).rejects.toThrow(UNANSWERED);
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 1));
    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    expect(create).toHaveBeenCalledTimes(6);
  });

  test("a remix, feed generation, a team preview and a matrix fill count against the same five", async () => {
    const { t, meId, styleId, toneId, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const organizationId = await matrixOrg(t, meId);
    const fill = () =>
      t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, {
        organizationId,
        styleSlug: "s1",
        toneSlug: "t1",
        topicSlug: "any-topic",
      });
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleId, anchoredToneId: toneId }),
    ).rejects.toThrow(TIMED_OUT);
    await expect(
      t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId,
        name: "Recovery",
        guidance: "Talk about rest days",
        styleId,
        toneId,
      }),
    ).rejects.toThrow(TIMED_OUT);
    await expect(fill()).rejects.toThrow(TIMED_OUT);
    expect(create).toHaveBeenCalledTimes(5);
    expect(await slotsLeft(t)).toBe(0);
    // The fill that reached the provider took one of the organization's 50.
    expect(await matrixFillsLeft(t, organizationId)).toEqual([49]);

    await expect(remix(t, questionId)).rejects.toThrow(UNANSWERED);
    // A matrix fill is refused the same way, with an error a batch stops on, before it takes
    // one of the organization's fills or starts a run, and the cell it claimed is freed.
    const refusedFill = await fill().catch((error: unknown) => error);
    expect(convexErrorData(refusedFill)).toMatchObject({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
    });
    expect(isAiStopError(refusedFill)).toBe(true);
    expect(create).toHaveBeenCalledTimes(5);
    expect(await matrixFillsLeft(t, organizationId)).toEqual([49]);
    const { runs, locks } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    expect(runs).toHaveLength(5);
    expect(locks).toEqual([]);
  });

  test("a call that is answered, or that the provider refused, gives its slot back", async () => {
    process.env.OPENROUTER_MAX_ATTEMPTS = "1";
    const { t, questionId } = await setup();
    create
      .mockResolvedValueOnce(completion("What breakfast would you happily eat every day?", { cost: 0.004 }) as never)
      .mockRejectedValueOnce(refused(400, "invalid request") as never)
      .mockRejectedValueOnce(refused(429, "Too Many Requests") as never)
      .mockRejectedValueOnce(new APIConnectionError({ message: "Connection error." }) as never)
      // An answer that can't be used was still an answer; so was its retry.
      .mockResolvedValue(completion('""', { cost: 0.004 }) as never);

    await expect(remix(t, questionId)).resolves.toBe("What breakfast would you happily eat every day?");
    await expect(remix(t, questionId)).rejects.toThrow("400 invalid request");
    await expect(remix(t, questionId)).rejects.toThrow(/429/);
    await expect(remix(t, questionId)).rejects.toThrow(/Connection error/);
    await expect(remix(t, questionId)).rejects.toThrow(/couldn't use/);

    expect(create).toHaveBeenCalledTimes(6);
    expect(await slotsLeft(t)).toBe(5);
  });

  test("a slot kept by a call that got no answer stays kept when later calls are answered or refused", async () => {
    const { t, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create
      .mockRejectedValueOnce(new APIConnectionTimeoutError() as never)
      .mockResolvedValueOnce(completion("What breakfast would you happily eat every day?", { cost: 0.004 }) as never)
      .mockRejectedValueOnce(refused(400, "invalid request") as never)
      .mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).resolves.toBe("What breakfast would you happily eat every day?");
    await expect(remix(t, questionId)).rejects.toThrow("400 invalid request");
    // The answered and the refused call each gave back only their own slot.
    expect(await slotsLeft(t)).toBe(4);

    for (let i = 0; i < 4; i++) await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).rejects.toThrow(UNANSWERED);
    expect(create).toHaveBeenCalledTimes(7);
  });

  test("an answer cut off by the output cap keeps its slot: it is charged while the person's use is given back", async () => {
    const { t, meId, questionId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const truncated = completion("", { cost: 0.006 });
    truncated.choices[0].finish_reason = "length";
    create.mockResolvedValue(truncated as never);

    await expect(remix(t, questionId)).rejects.toThrow(/finish_reason=length/);

    expect(await slotsLeft(t)).toBe(4);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Keeping an unanswered-call slot \(rateLimits row .+\) for run .+: the answer was cut off/),
    );
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.006, 1]]);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);

    // Four more, and the next request is refused before it reaches the model.
    for (let i = 0; i < 4; i++) await expect(remix(t, questionId)).rejects.toThrow(/finish_reason=length/);
    await expect(remix(t, questionId)).rejects.toThrow(UNANSWERED);
    expect(create).toHaveBeenCalledTimes(5);
  });

  test("a retry the budget refuses gives its slot back too", async () => {
    const { t, questionId } = await setup();
    create.mockImplementationOnce((async () => {
      // Other spend uses up the budget while this attempt is failing. It is added to the day's
      // row, which this attempt's reservation has already made.
      await t.run(async (ctx) => {
        const [today] = await ctx.db.query("aiSpendDays").collect();
        await ctx.db.patch(today._id, { costUsd: today.costUsd + 5 });
      });
      throw refused(503, "Service Unavailable");
    }) as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(PAUSED);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await slotsLeft(t)).toBe(5);
  });

  test("calls still waiting on the provider count: a sixth at once is refused, and there is room again once they are answered", async () => {
    const { t, questionId } = await setup();
    let waiting = 0;
    let sixth: unknown;
    let leftWhileWaiting: number | undefined;
    create.mockImplementation((async () => {
      waiting += 1;
      // Each call starts the next while it is still waiting on the provider.
      if (waiting < 5) {
        await remix(t, questionId);
      } else if (waiting === 5) {
        leftWhileWaiting = await slotsLeft(t);
        sixth = await remix(t, questionId).catch((error: unknown) => error);
      }
      return completion("What breakfast would you happily eat every day?", { cost: 0.004 });
    }) as never);

    await expect(remix(t, questionId)).resolves.toBe("What breakfast would you happily eat every day?");

    expect(leftWhileWaiting).toBe(0);
    expect(convexErrorData(sixth)).toMatchObject({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
    });
    expect(create).toHaveBeenCalledTimes(5);
    expect(await slotsLeft(t)).toBe(5);
    await expect(remix(t, questionId)).resolves.toBe("What breakfast would you happily eat every day?");
  });

  test("two requests started together for the last slot: one is answered, the other is refused where its call would be made and is given its plan use back", async () => {
    const { t, meId, questionId } = await setup();
    let waiting = 0;
    let together: PromiseSettledResult<string>[] = [];
    create.mockImplementation((async () => {
      waiting += 1;
      if (waiting < 4) {
        await remix(t, questionId);
      } else if (waiting === 4) {
        // Four calls are waiting on the provider, so one slot is left for the two started here.
        together = await Promise.allSettled([remix(t, questionId), remix(t, questionId)]);
      }
      return completion("What breakfast would you happily eat every day?", { cost: 0.004 });
    }) as never);

    await expect(remix(t, questionId)).resolves.toBe("What breakfast would you happily eat every day?");

    expect(together.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refusal = together.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(convexErrorData(refusal.reason)).toMatchObject({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
    });
    expect(create).toHaveBeenCalledTimes(5);
    expect(await slotsLeft(t)).toBe(5);
    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    // Both passed the request limits; the one refused had made its run, which is closed as failed.
    expect(runs.map((run) => run.status).sort()).toEqual(["failed", "succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]);
    // Only the five answered requests count as plan use.
    expect(usage.map((row) => row.count)).toEqual([5]);
  });

  test("each person has their own five", async () => {
    const { t, questionId } = await setup();
    const YOU = { subject: "you-clerk", tokenIdentifier: "test|you-clerk", email: "you@example.com" };
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: YOU.email, clerkId: YOU.subject });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    for (let i = 0; i < 5; i++) await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).rejects.toThrow(UNANSWERED);

    await expect(
      t.withIdentity(YOU).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow(TIMED_OUT);
    expect(await slotsLeft(t, YOU.subject)).toBe(4);
  });

  test("system spend holds no slot: an admin remix that times out isn't counted against the admin", async () => {
    const { t, questionId } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    for (let i = 0; i < 6; i++) {
      await expect(t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId })).rejects.toThrow(TIMED_OUT);
    }

    expect(create).toHaveBeenCalledTimes(6);
    expect(await slotsLeft(t, ADMIN.subject)).toBeUndefined();
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/no signed-in caller/));
  });

  test("a call nobody is signed in for holds nothing and says so; system spend holds nothing", async () => {
    const runMutation = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const signedOut = { auth: { getUserIdentity: vi.fn().mockResolvedValue(null) }, runMutation };
    const signedIn = { auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: ME.subject }) }, runMutation };

    await expect(holdAiUnanswered(signedIn as never, "system")).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    // User spend with no caller isn't counted against anyone, so it is logged.
    await expect(holdAiUnanswered(signedOut as never, "user")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no signed-in caller/));
    // Nothing was held, so there is nothing to give back.
    await releaseAiUnanswered(signedIn as never, null);
    // And with nobody signed in there is nobody to refuse.
    await expect(ensureAiUnansweredLeft(signedOut as never)).resolves.toBeUndefined();

    expect(runMutation).not.toHaveBeenCalled();
  });

  test("a slot that can't be given back is logged, never thrown", async () => {
    const ctx = { runMutation: vi.fn().mockRejectedValue(new Error("write conflict")) };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(releaseAiUnanswered(ctx as never, { row: "row-1" as never, day: "2026-09-29" })).resolves.toBeUndefined();

    expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe("internal/aiRateLimit:releaseAiUnanswered");
    expect(ctx.runMutation.mock.calls[0][1]).toEqual({ row: "row-1", day: "2026-09-29" });
    // The log names the row, so an operator can see whose slot stayed held.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/rateLimits row row-1/), expect.any(Error));
  });

  test("a held slot names its row and the day the hold reported; a refusal carries the code, the message and when to retry", async () => {
    const runMutation = vi
      .fn()
      // Not the faked clock's day: the slot's day is the one the hold was counted on.
      .mockResolvedValueOnce({ ok: true, row: "row-1", day: "2026-09-28" })
      .mockResolvedValueOnce({ ok: false, retryAt: 1234 })
      .mockResolvedValueOnce({ ok: false, retryAt: 5678 });
    const ctx = { auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: ME.subject }) }, runMutation };

    expect(await holdAiUnanswered(ctx as never, "user")).toEqual({ row: "row-1", day: "2026-09-28" });
    expect(getFunctionName(runMutation.mock.calls[0][0])).toBe("internal/aiRateLimit:holdAiUnanswered");
    expect(runMutation.mock.calls[0][1]).toEqual({ key: ME.subject });

    const refusal = await holdAiUnanswered(ctx as never, "user").catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ConvexError);
    expect(convexErrorData(refusal)).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
      retryAt: 1234,
    });

    // The check before a request refuses the same way, and takes nothing.
    const early = await ensureAiUnansweredLeft(ctx as never).catch((error: unknown) => error);
    expect(getFunctionName(runMutation.mock.calls[2][0])).toBe("internal/aiRateLimit:checkAiUnanswered");
    expect(convexErrorData(early)).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
      retryAt: 5678,
    });
  });

  test("a call is charged to the spend day its slot was held on", async () => {
    const { t, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The slot was held a moment before midnight; the call is set aside a moment after.
    vi.spyOn(aiRateLimitLib, "holdAiUnanswered").mockResolvedValue({ row: "row-1" as never, day: "2026-09-28" });
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);

    expect(await ledger(t)).toEqual([["2026-09-28", "user", lastSetAside(), 1]]);
  });

  test("a refused attempt whose retry is answered leaves every slot free", async () => {
    const { t, questionId } = await setup();
    create
      .mockRejectedValueOnce(refused(503, "Service Unavailable") as never)
      .mockResolvedValueOnce(completion("A quicker take on breakfast?", { cost: 0.004 }) as never);

    await expect(throughBackoff(remix(t, questionId))).resolves.toBe("A quicker take on breakfast?");

    expect(create).toHaveBeenCalledTimes(2);
    expect(await slotsLeft(t)).toBe(5);
  });

  test("a refused attempt followed by a timeout gives back the first slot and keeps only the second", async () => {
    const { t, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create
      .mockRejectedValueOnce(refused(429, "Too Many Requests") as never)
      .mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(TIMED_OUT);

    // The timeout ends the request: there is no third attempt to hold a slot for.
    expect(create).toHaveBeenCalledTimes(2);
    expect(await slotsLeft(t)).toBe(4);
  });

  test("a retry holds a slot of its own: with none left by then it is refused instead of sent", async () => {
    const { t, questionId } = await setup();
    // The first attempt holds one of Sep 29's slots.
    create.mockImplementationOnce((async () => {
      // The spend day turns before the retry, and the new day's slots are all taken by then.
      vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 0, 1));
      await holdEverySlot(t);
      throw refused(503, "Service Unavailable");
    }) as never);

    const refusal = await throughBackoff(remix(t, questionId)).catch((error: unknown) => error);

    expect(convexErrorData(refusal)).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
      retryAt: Date.UTC(2026, 9, 1, 7, 0),
    });
    expect(create).toHaveBeenCalledTimes(1);
    // Yesterday's slot being given back adds nothing to today's, and nothing was set aside today.
    expect(await slotsLeft(t)).toBe(0);
    expect(await ledger(t)).toEqual([["2026-09-29", "user", 0, 0]]);
  });

  test("a reply that couldn't be read as a completion keeps its slot, like a call that timed out", async () => {
    const { t, questionId } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = stubSend().mockImplementation(
      async () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/no completion/);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await slotsLeft(t)).toBe(4);
  });

  test("a matrix batch stops at a cell whose answer is cut off and says how far it got: later cells aren't tried, one slot is kept and the cell is freed", async () => {
    const { t, meId } = await setup();
    const orgId = await matrixOrg(t, meId);
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", { id: "s3", slug: "s3", status: "active", version: 1, name: "s3", structure: "x", color: "#111111", icon: "sparkles" });
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const truncated = completion("", { cost: 0.006 });
    truncated.choices[0].finish_reason = "length";
    create
      .mockResolvedValueOnce(completion(JSON.stringify({ questions: [{ text: "What small win are you proud of this week?" }] }), { cost: 0.01 }) as never)
      .mockResolvedValue(truncated as never);

    const stopped = await t
      .withIdentity(ME)
      .action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [
          { ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" },
          { ySlug: "s2", xSlug: "t1", styleSlug: "s2", toneSlug: "t1" },
          { ySlug: "s3", xSlug: "t1", styleSlug: "s3", toneSlug: "t1" },
        ],
      })
      .catch((error: unknown) => error);

    // A message the planner can show, not the provider's own error.
    expect(convexErrorData(stopped)).toEqual({
      code: ERROR_CODES.AI_GENERATION_FAILED,
      message: "Filled 1 cell, then stopped because the AI didn't finish an answer. The filled cells are saved. Try the rest again later.",
      filledCells: 1,
      totalCells: 3,
    });
    // The third cell has the same size and cap, so it would very likely be cut off too.
    expect(create).toHaveBeenCalledTimes(2);
    expect(await slotsLeft(t)).toBe(4);
    expect(await matrixFillsLeft(t, orgId)).toEqual([48]);
    const { runs, locks } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    // The first cell's questions stay saved.
    expect(runs.map((run) => run.status)).toEqual(["succeeded", "failed"]);
    expect(locks).toEqual([]);
  });

  test("a matrix batch also stops when the cut-off answer follows a paid-for unusable one", async () => {
    const { t, meId } = await setup();
    const orgId = await matrixOrg(t, meId);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const truncated = completion("", { cost: 0.006 });
    truncated.choices[0].finish_reason = "length";
    create.mockResolvedValueOnce(completion('{"questions":[]}', { cost: 0.004 }) as never).mockResolvedValue(truncated as never);

    const stopped = await t
      .withIdentity(ME)
      .action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [
          { ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" },
          { ySlug: "s2", xSlug: "t1", styleSlug: "s2", toneSlug: "t1" },
        ],
      })
      .catch((error: unknown) => error);

    expect(convexErrorData(stopped)).toMatchObject({ code: ERROR_CODES.AI_GENERATION_FAILED, filledCells: 0, totalCells: 2 });
    // Two calls for the first cell, none for the second.
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("a matrix batch is refused at its first cell once the person has no slot left: nothing is taken from the team and the cell is freed", async () => {
    const { t, meId } = await setup();
    const orgId = await matrixOrg(t, meId);
    await holdEverySlot(t);

    const refusal = await t
      .withIdentity(ME)
      .action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [
          { ySlug: "s1", xSlug: "t1", styleSlug: "s1", toneSlug: "t1" },
          { ySlug: "s2", xSlug: "t1", styleSlug: "s2", toneSlug: "t1" },
        ],
      })
      .catch((error: unknown) => error);

    expect(convexErrorData(refusal)).toMatchObject({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
    });
    expect(create).not.toHaveBeenCalled();
    // Refused before anything was set aside, before a run was started, and before the
    // organization's fills were touched.
    expect(await ledger(t)).toEqual([]);
    expect(await matrixFillsLeft(t, orgId)).toEqual([]);
    const { runs, locks } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    expect(runs).toEqual([]);
    expect(locks).toEqual([]);
  });
});
