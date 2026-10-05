/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ERROR_CODES, ERROR_MESSAGES } from "./constants";
import { callReserveUsd, completionUsage, dailyCaps, FALLBACK_COST_PER_CALL_USD, MAX_PROMPT_CHARS, spendDay, worstCaseCallCostUsd } from "./lib/aiSpend";
import { reserveAiSpend, settleAiCompletion } from "./lib/aiSpendGuard";
import { convexErrorData } from "./lib/errorData";

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
    expect(completionUsage({ cost: 0.0123, prompt_tokens: 800, completion_tokens: 200 }, FALLBACK_COST_PER_CALL_USD)).toEqual({
      costUsd: 0.0123,
      promptTokens: 800,
      completionTokens: 200,
    });
    expect(completionUsage(undefined, FALLBACK_COST_PER_CALL_USD)).toEqual({ costUsd: FALLBACK_COST_PER_CALL_USD });
    expect(completionUsage({ cost: -1, prompt_tokens: Number.NaN }, FALLBACK_COST_PER_CALL_USD).costUsd).toBe(FALLBACK_COST_PER_CALL_USD);
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

  test("a reported cost is charged as it is, a free call included; only a missing one is charged what the caller names", () => {
    expect(completionUsage({ cost: 0.003, prompt_tokens: 10 }, 0.07)).toEqual({ costUsd: 0.003, promptTokens: 10 });
    expect(completionUsage({ cost: 0 }, 0.07).costUsd).toBe(0);
    expect(completionUsage({ prompt_tokens: 10, completion_tokens: 4 }, 0.07)).toEqual({
      costUsd: 0.07,
      promptTokens: 10,
      completionTokens: 4,
    });
    expect(completionUsage({ cost: null }, 0.07).costUsd).toBe(0.07);
    expect(completionUsage("not usage", 0.07).costUsd).toBe(0.07);
  });

  test("a completion with no reported cost is settled at everything set aside for it, also when the write is retried", async () => {
    const ctx = {
      runMutation: vi.fn().mockRejectedValue(new Error("write conflict")),
      scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reservation = { spendClass: "system" as const, day: "2026-09-29", reservedUsd: 0.0537 };

    await expect(settleAiCompletion(ctx as never, reservation, undefined, { model: "m" })).resolves.toBeUndefined();

    const settled = { ...reservation, costUsd: 0.0537, runId: undefined, resolvedModel: "m", promptTokens: undefined, completionTokens: undefined };
    expect(ctx.runMutation).toHaveBeenCalledWith(internal.internal.aiSpend.settleAiSpend, settled);
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, internal.internal.aiSpend.settleAiSpend, settled);
    consoleError.mockRestore();
  });

  test("a settle that can be neither written nor scheduled still doesn't fail the paid call", async () => {
    const ctx = {
      runMutation: vi.fn().mockRejectedValue(new Error("write conflict")),
      scheduler: { runAfter: vi.fn().mockRejectedValue(new Error("scheduler down")) },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reservation = { spendClass: "user" as const, day: "2026-09-29", reservedUsd: 0.0537 };

    await expect(
      settleAiCompletion(ctx as never, reservation, undefined, { model: "m", usage: { cost: 0.01 } }),
    ).resolves.toBeUndefined();

    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls.map((call) => call[0])).toEqual([
      "Failed to record AI spend; retrying in the background",
      "Failed to schedule the AI spend retry",
    ]);
    consoleError.mockRestore();
  });
});

describe("what is set aside before a call", () => {
  const opus = { input: 4, output: 20 };

  test("the worst case counts a started token as a whole one and charges the whole output cap", () => {
    expect(worstCaseCallCostUsd(0, 0, opus)).toBe(0);
    // One character is already a token, three still are one, and a fourth starts the next.
    expect(worstCaseCallCostUsd(1, 0, opus)).toBeCloseTo(0.000004, 9);
    expect(worstCaseCallCostUsd(3, 0, opus)).toBeCloseTo(0.000004, 9);
    expect(worstCaseCallCostUsd(4, 0, opus)).toBeCloseTo(0.000008, 9);
    // Output is charged for every token of the cap, at its own price.
    expect(worstCaseCallCostUsd(0, 2500, opus)).toBeCloseTo(0.05, 9);
    expect(worstCaseCallCostUsd(0, 2500, { input: 4, output: 10 })).toBeCloseTo(0.025, 9);
    // The largest prompt allowed with a ten-question batch: 13,334 tokens in and 4,300 out.
    expect(worstCaseCallCostUsd(MAX_PROMPT_CHARS, 4300, opus)).toBeCloseTo(0.139336, 9);
  });

  test("a call is set aside at no less than the fallback, and one without a whole, positive output cap is refused", () => {
    // A cap this small never happens; the floor is what keeps such a call from counting for nothing.
    expect(callReserveUsd(30, 10, opus)).toBe(FALLBACK_COST_PER_CALL_USD);
    expect(callReserveUsd(3000, 2500, opus)).toBeCloseTo(0.054, 9);
    // With no cap the provider's output is unbounded, and NaN would make the reservation NaN.
    for (const cap of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -5, 2.5, "2500"]) {
      expect(() => callReserveUsd(3000, cap, opus), String(cap)).toThrow(/whole, positive output cap/);
    }
  });

  test("the ledger refuses an amount that isn't a finite number, and stays as it was", async () => {
    const t = setup();
    const day = spendDay(Date.now());
    const caps = { budgetUsd: 1, hardCapUsd: 5 };
    expect(await t.mutation(internal.internal.aiSpend.reserveAiSpend, { spendClass: "user", day, ...caps, reserveUsd: 0.05 })).toBe(true);

    // A NaN total would refuse every later user call that day and never reach the hard cap.
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        t.mutation(internal.internal.aiSpend.reserveAiSpend, { spendClass: "user", day, ...caps, reserveUsd: amount }),
      ).rejects.toThrow(/finite/);
      await expect(t.mutation(internal.internal.aiSpend.releaseAiSpend, { spendClass: "user", day, reservedUsd: amount })).rejects.toThrow(/finite/);
      await expect(
        t.mutation(internal.internal.aiSpend.settleAiSpend, { spendClass: "user", day, reservedUsd: 0.05, costUsd: amount }),
      ).rejects.toThrow(/finite/);
    }

    const rows = await t.run(async (ctx) => ctx.db.query("aiSpendDays").collect());
    expect(rows.map((row) => [row.spendClass, row.costUsd, row.calls])).toEqual([["user", 0.05, 0]]);
  });

  test("a reservation is for the amount asked and names its day; a refusal reads as a paused budget", async () => {
    const runMutation = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const ctx = { runMutation, scheduler: { runAfter: vi.fn() } };
    const day = spendDay(Date.now());

    expect(await reserveAiSpend(ctx as never, "user", 0.0537)).toEqual({ spendClass: "user", day, reservedUsd: 0.0537 });
    expect(runMutation).toHaveBeenCalledWith(internal.internal.aiSpend.reserveAiSpend, {
      spendClass: "user",
      day,
      ...dailyCaps(),
      reserveUsd: 0.0537,
    });

    const refused = await reserveAiSpend(ctx as never, "user", 0.0537).catch((error: unknown) => error);
    expect(convexErrorData(refused)).toEqual({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
  });

  test("the ledger holds a reservation of any size until it is settled or given back", async () => {
    const t = setup();
    const day = spendDay(Date.now());
    const caps = { budgetUsd: 1, hardCapUsd: 5 };
    const ledger = async () =>
      (await t.run(async (ctx) => ctx.db.query("aiSpendDays").collect())).map((row) => [row.spendClass, row.costUsd, row.calls]);

    // Two calls in flight, each set aside at its own worst case.
    expect(await t.mutation(internal.internal.aiSpend.reserveAiSpend, { spendClass: "user", day, ...caps, reserveUsd: 0.0537 })).toBe(true);
    expect(await t.mutation(internal.internal.aiSpend.reserveAiSpend, { spendClass: "user", day, ...caps, reserveUsd: 0.139336 })).toBe(true);
    expect(await ledger()).toEqual([["user", 0.193036, 0]]);

    // The first fails and gives everything back; the second costs far less than was set aside.
    await t.mutation(internal.internal.aiSpend.releaseAiSpend, { spendClass: "user", day, reservedUsd: 0.0537 });
    await t.mutation(internal.internal.aiSpend.settleAiSpend, { spendClass: "user", day, reservedUsd: 0.139336, costUsd: 0.0125 });

    expect(await ledger()).toEqual([["user", 0.0125, 1]]);
  });
});
