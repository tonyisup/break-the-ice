/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { APIConnectionError, APIConnectionTimeoutError, APIError, OpenAIError } from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ERROR_CODES, ERROR_MESSAGES } from "./constants";
import { completionUsage, dailyCaps, DEFAULT_DAILY_BUDGET_USD, DEFAULT_DAILY_HARD_CAP_USD, FALLBACK_COST_PER_CALL_USD, spendDay } from "./lib/aiSpend";
import { billedFailure, keepAiReservation, keptAiReservation } from "./lib/aiSpendGuard";
import { ensureAiRateLimit, isAiStopError } from "./lib/aiRateLimit";
import { convexErrorData } from "./lib/errorData";
import { GENERATION_MODEL, openRouterClient } from "./lib/generationRunner";
import { DEFAULT_BLUEPRINT_SLUG } from "./lib/promptArchitecture";

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

async function ledger(t: T) {
  const rows = await t.run(async (ctx) => await ctx.db.query("aiSpendDays").collect());
  return rows.map((row) => [row.day, row.spendClass, row.costUsd, row.calls]).sort();
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

describe("helpers", () => {
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
    expect(completionUsage({ cost: 0 }).costUsd).toBe(0);
    expect(completionUsage({ cost: "0.01" }).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);
    expect(completionUsage(null).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);

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

  test("an admin preview generates with the preset model: only the eval harness picks another", async () => {
    const { t, styleId, toneId } = await setup();
    create.mockResolvedValue(
      completion(JSON.stringify({ questions: [{ text: "What small win are you proud of?" }] }), { cost: 0.01 }) as never,
    );

    await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId, toneId });

    expect(create.mock.calls[0][0]).toMatchObject({ model: GENERATION_MODEL });
    const runs = await t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs.map((run) => run.model)).toEqual([GENERATION_MODEL]);
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

    // The provider may still have run and billed the abandoned send, so its $0.02 stays.
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
  });

  test("a timed-out call counts toward the cap: the next request is refused once the budget is used", async () => {
    process.env.AI_DAILY_BUDGET_USD = "0.02";
    const { t, questionId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(remix(t, questionId)).rejects.toThrow(TIMED_OUT);
    await expect(remix(t, questionId)).rejects.toThrow(PAUSED);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
  });

  test("a refused attempt followed by a timeout gives back the first reservation and keeps only the second", async () => {
    const { t, meId, questionId } = await setup();
    create
      .mockRejectedValueOnce(refused(429, "Too Many Requests") as never)
      .mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(TIMED_OUT);

    // The timeout ends the request: there is no third attempt.
    expect(create).toHaveBeenCalledTimes(2);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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

    // The provider answered, so it billed: the $0.02 stays although no cost was reported.
    expect(send).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
  });

  test("an unparseable response isn't taken for a refusal because its error mentions a number like 502", async () => {
    const { t, questionId } = await setup();
    create.mockRejectedValue(new SyntaxError("Unexpected token < in JSON at position 502") as never);

    await expect(throughBackoff(remix(t, questionId))).rejects.toThrow(/position 502/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
  });

  test("feed generation that times out fails its run, saves nothing and refunds the quota", async () => {
    const { t, meId, styleId, toneId } = await setup();
    create.mockRejectedValue(new APIConnectionTimeoutError() as never);

    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleId, anchoredToneId: toneId }),
    ).rejects.toThrow(TIMED_OUT);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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
    // The answered call settles to its real $0.004; the timed-out one keeps its $0.02.
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.024, 2]]);
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

  test("a matrix cell that times out stops the fill: later cells aren't tried, one reservation is kept and the lock is freed", async () => {
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
    ).rejects.toThrow(TIMED_OUT);

    // The second cell would very likely time out too, and keep a reservation of its own.
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "user", 0.02, 1]]);
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
    expect(await ledger(t)).toEqual([[spendDay(Date.now()), "system", 0.02, 1]]);
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
