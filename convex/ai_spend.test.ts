/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { completionUsage, dailyCaps, FALLBACK_COST_PER_CALL_USD, spendDay } from "./lib/aiSpend";
import { settleAiCompletion } from "./lib/aiSpendGuard";

const OTHER = { subject: "other-clerk", tokenIdentifier: "test|other-clerk", email: "other@example.com" };
const ENV_KEYS = ["AI_DAILY_BUDGET_USD", "AI_DAILY_HARD_CAP_USD"] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // Midday Pacific, so a test can't straddle the spend-day boundary.
  vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
  for (const key of ENV_KEYS) delete process.env[key];
});
afterEach(() => {
  vi.useRealTimers();
  for (const key of ENV_KEYS) delete process.env[key];
});

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.ts"));
}
type T = ReturnType<typeof setup>;

async function seedSpend(t: T, spent: { user?: number; system?: number }, day = spendDay(Date.now())) {
  await t.run(async (ctx) => {
    for (const spendClass of ["user", "system"] as const) {
      const costUsd = spent[spendClass];
      if (costUsd !== undefined) await ctx.db.insert("aiSpendDays", { day, spendClass, costUsd, calls: 1 });
    }
  });
}

// The caps are read here, as ensureAiBudget does in the action, so env changes apply.
const allowed = (t: T, spendClass: "user" | "system", day = spendDay(Date.now())) =>
  t.query(internal.internal.aiSpend.checkAiBudget, { spendClass, day, ...dailyCaps() });

describe("spend ledger", () => {
  test("records each completion's cost per day and class, and its usage on the run", async () => {
    const t = setup();
    const runId = await t.run(async (ctx) => {
      const blueprintId = await ctx.db.insert("promptBlueprints", {
        slug: "default",
        version: 1,
        status: "active",
        systemInstruction: "",
        safetyChecklist: [],
        qualityChecklist: [],
        outputFormatInstruction: "",
        createdAt: 0,
        updatedAt: 0,
      });
      return await ctx.db.insert("generationRuns", {
        status: "running",
        purpose: "feed",
        blueprintId,
        batchSize: 1,
        model: "@preset/break-the-ice-berg-default",
        temperature: 0.9,
        assembledPrompt: "",
        resultQuestionIds: [],
        createdAt: 0,
      });
    });

    const day = spendDay(Date.now());
    // Each call settles against a reservation; with nothing reserved, settle adds the cost.
    await t.mutation(internal.internal.aiSpend.settleAiSpend, {
      spendClass: "user",
      day,
      reservedUsd: 0,
      costUsd: 0.25,
      runId,
      resolvedModel: "anthropic/claude-sonnet-5",
      promptTokens: 900,
      completionTokens: 300,
    });
    await t.mutation(internal.internal.aiSpend.settleAiSpend, { spendClass: "user", day, reservedUsd: 0, costUsd: 0.5 });
    await t.mutation(internal.internal.aiSpend.settleAiSpend, { spendClass: "system", day, reservedUsd: 0, costUsd: 0.1 });

    const { rows, run } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("aiSpendDays").collect(),
      run: await ctx.db.get(runId),
    }));
    const today = spendDay(Date.now());
    expect(rows.map((row) => [row.day, row.spendClass, row.costUsd, row.calls]).sort()).toEqual([
      [today, "system", 0.1, 1],
      [today, "user", 0.75, 2],
    ]);
    expect(run).toMatchObject({
      costUsd: 0.25,
      resolvedModel: "anthropic/claude-sonnet-5",
      promptTokens: 900,
      completionTokens: 300,
    });
  });
});

describe("budget decisions", () => {
  test("user AI pauses at the daily budget while the email and admin tools keep going", async () => {
    const t = setup();
    expect(await allowed(t, "user")).toBe(true);

    await seedSpend(t, { user: 1 });

    expect(await allowed(t, "user")).toBe(false);
    expect(await allowed(t, "system")).toBe(true);
  });

  test("everything stops at the hard cap, counting both classes", async () => {
    const t = setup();
    await seedSpend(t, { user: 0.5, system: 4.5 });

    expect(await allowed(t, "user")).toBe(false);
    expect(await allowed(t, "system")).toBe(false);
  });

  test("the caps come from env vars; 0 pauses user AI and a bad value falls back", async () => {
    const t = setup();
    process.env.AI_DAILY_BUDGET_USD = "0";
    expect(await allowed(t, "user")).toBe(false);
    expect(await allowed(t, "system")).toBe(true);

    process.env.AI_DAILY_BUDGET_USD = "not-a-number";
    expect(await allowed(t, "user")).toBe(true);

    process.env.AI_DAILY_HARD_CAP_USD = "0.05";
    await seedSpend(t, { system: 0.05 });
    expect(await allowed(t, "system")).toBe(false);
  });

  test("an earlier day's spend doesn't count today", async () => {
    const t = setup();
    await seedSpend(t, { user: 10, system: 10 }, "2020-01-01");

    expect(await allowed(t, "user")).toBe(true);
    expect(await allowed(t, "system")).toBe(true);
  });
});

describe("refusing before any work", () => {
  test("a remix is refused once the user budget is spent: no run, and the quota is never charged", async () => {
    const t = setup();
    const { userId, questionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: OTHER.email, clerkId: OTHER.subject });
      const questionId = await ctx.db.insert("questions", {
        text: "What is a public question?",
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
      return { userId, questionId };
    });
    await seedSpend(t, { user: 1 });

    await expect(
      t.withIdentity(OTHER).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow(/paused for today/);

    const { runs, usage } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === userId),
    }));
    expect(runs).toEqual([]);
    expect(usage).toEqual([]);
  });
});

describe("usage from the provider response", () => {
  test("reads the cost and token counts, and charges a fallback when the cost is missing", () => {
    expect(completionUsage({ cost: 0.0123, prompt_tokens: 800, completion_tokens: 200 })).toEqual({
      costUsd: 0.0123,
      promptTokens: 800,
      completionTokens: 200,
    });
    expect(completionUsage(undefined)).toEqual({ costUsd: FALLBACK_COST_PER_CALL_USD });
    expect(completionUsage({ cost: -1, prompt_tokens: Number.NaN }).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);
  });

  test("spend days follow Los Angeles time", () => {
    // 11:30pm and 12:30am Pacific (UTC-7 in September).
    expect(spendDay(Date.UTC(2026, 8, 30, 6, 30))).toBe("2026-09-29");
    expect(spendDay(Date.UTC(2026, 8, 30, 7, 30))).toBe("2026-09-30");
  });

  test("a failure to record spend doesn't fail the paid call, and the write is retried in the background", async () => {
    const ctx = {
      runMutation: vi.fn().mockRejectedValue(new Error("write conflict")),
      scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reservation = { spendClass: "user" as const, day: "2026-09-29", reservedUsd: 0.02 };

    await expect(
      settleAiCompletion(ctx as never, reservation, undefined, { model: "m", usage: { cost: 0.01 } }),
    ).resolves.toBeUndefined();
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
      0,
      internal.internal.aiSpend.settleAiSpend,
      expect.objectContaining({ day: "2026-09-29", reservedUsd: 0.02, costUsd: 0.01 }),
    );
    consoleError.mockRestore();
  });
});
