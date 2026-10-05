/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ERROR_CODES, ERROR_MESSAGES } from "./constants";
import { spendDay } from "./lib/aiSpend";
import { convexErrorData } from "./lib/errorData";

const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
const YOU = { subject: "you-clerk", tokenIdentifier: "test|you-clerk", email: "you@example.com" };
const RATE_LIMITED = /a lot of AI requests/;
const MATRIX_LIMITED = /used its matrix fills/;
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
    await ctx.db.insert("users", { email: YOU.email, clerkId: YOU.subject });
    // Public but textless: a remix gets past the rate limit and the quota, then stops
    // before calling the model.
    const textlessId = await ctx.db.insert("questions", { status: "public", ...counters });
    return { meId, textlessId };
  });
  return { t, ...ids };
}

describe("per-person AI requests", () => {
  test("a burst of 10, shared by remix and feed generation, and the quota isn't charged when refused", async () => {
    const { t, meId, textlessId } = await setup();
    const remix = () =>
      t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });

    for (let i = 0; i < 10; i++) await expect(remix()).rejects.toThrow("Question text not found.");
    await expect(remix()).rejects.toThrow(RATE_LIMITED);
    await expect(
      t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { count: 1 }),
    ).rejects.toThrow(RATE_LIMITED);

    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    );
    expect(usage.map((row) => row.count)).toEqual([0]);
  });

  test("each person has their own bucket, and it refills over time", async () => {
    const { t, textlessId } = await setup();
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequest", key: ME.subject, count: 10 });

    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    await expect(remixAs(ME)).rejects.toThrow(RATE_LIMITED);
    await expect(remixAs(YOU)).rejects.toThrow("Question text not found.");

    // 30 an hour: one token back after two minutes.
    vi.setSystemTime(Date.now() + 2 * 60 * 1000 + 1_000);
    await expect(remixAs(ME)).rejects.toThrow("Question text not found.");
    await expect(remixAs(ME)).rejects.toThrow(RATE_LIMITED);
  });

  test("at most 40 AI requests a day per person, whatever the burst bucket holds", async () => {
    const { t, textlessId } = await setup();
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count: 40 });

    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    await expect(remixAs(ME)).rejects.toThrow(/today's AI requests/);
    await expect(remixAs(YOU)).rejects.toThrow("Question text not found.");
  });

  test("the daily limit resets at midnight in Los Angeles, in daylight time and in standard time", async () => {
    const { t, textlessId } = await setup();
    const remix = () => t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    const useUp = () =>
      t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count: 40 });

    // Noon Pacific Daylight Time.
    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    await useUp();
    await expect(remix()).rejects.toThrow(/today's AI requests/);
    // 11:59pm PDT is still that day; 12:01am PDT is the next.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 6, 59));
    await expect(remix()).rejects.toThrow(/today's AI requests/);
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 1));
    await expect(remix()).rejects.toThrow("Question text not found.");

    // Noon Pacific Standard Time, then 11:59pm and 12:01am.
    vi.setSystemTime(Date.UTC(2026, 11, 1, 20, 0));
    await useUp();
    vi.setSystemTime(Date.UTC(2026, 11, 2, 7, 59));
    await expect(remix()).rejects.toThrow(/today's AI requests/);
    vi.setSystemTime(Date.UTC(2026, 11, 2, 8, 1));
    await expect(remix()).rejects.toThrow("Question text not found.");
  });

  test("a day the clocks change is still one day of requests", async () => {
    const { t } = await setup();
    const take = (count: number) =>
      t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count });

    // 12:30am PDT on Nov 1, 2026. The clocks go back at 2am, so the day is 25 hours long.
    vi.setSystemTime(Date.UTC(2026, 10, 1, 7, 30));
    expect(await take(40)).toEqual({ ok: true });
    // 24 hours on it is 11:30pm PST, the same day. The refusal says when the next one starts.
    vi.setSystemTime(Date.UTC(2026, 10, 2, 7, 30));
    expect(spendDay(Date.now())).toBe("2026-11-01");
    expect(await take(1)).toEqual({ ok: false, retryAt: Date.UTC(2026, 10, 2, 8, 0) });
    vi.setSystemTime(Date.UTC(2026, 10, 2, 8, 1));
    expect(await take(40)).toEqual({ ok: true });

    // 12:30am PST on Mar 14, 2027. The clocks go forward at 2am, so the day is 23 hours long.
    vi.setSystemTime(Date.UTC(2027, 2, 14, 8, 30));
    expect(await take(40)).toEqual({ ok: true });
    // 23 hours on it is 12:30am PDT on Mar 15.
    vi.setSystemTime(Date.UTC(2027, 2, 15, 7, 30));
    expect(await take(40)).toEqual({ ok: true });
  });

  test("a count left by the fixed 24-hour window still counts for its day", async () => {
    const { t } = await setup();
    const take = () =>
      t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject });
    // As the window wrote it: its start (1am PDT on Sep 29) and what was left of the 40.
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", { name: "aiRequestDaily", key: ME.subject, value: 1, ts: Date.UTC(2026, 8, 29, 8, 0) });
    });

    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    expect(await take()).toEqual({ ok: true });
    expect(await take()).toEqual({ ok: false, retryAt: Date.UTC(2026, 8, 30, 7, 0) });
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 1));
    expect(await take()).toEqual({ ok: true });
  });

  test("one spend day holds one day's requests during daylight time too", async () => {
    const { t, textlessId } = await setup();
    const remix = () => t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    const take = (count: number) =>
      t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count });

    // 12:10am Pacific Daylight Time: the spend day has just started.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 10));
    const day = spendDay(Date.now());
    expect(await take(39)).toMatchObject({ ok: true });

    // 1:01am, the same spend day: one request is left, not a fresh 40.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 8, 1));
    expect(spendDay(Date.now())).toBe(day);
    await expect(remix()).rejects.toThrow("Question text not found.");
    await expect(remix()).rejects.toThrow(/today's AI requests/);
  });

  test("a refusal doesn't use up tokens: not when the daily limit refuses, nor while the budget is paused", async () => {
    const { t, textlessId } = await setup();
    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    const bucketsFor = (key: string) =>
      t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).filter((row) => row.key === key).map((row) => row.name).sort());

    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count: 40 });
    await expect(remixAs(ME)).rejects.toThrow(/today's AI requests/);
    expect(await bucketsFor(ME.subject)).toEqual(["aiRequestDaily"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 100, calls: 1 });
    });
    await expect(remixAs(YOU)).rejects.toThrow(/paused for today/);
    expect(await bucketsFor(YOU.subject)).toEqual([]);
  });

  test("a person with no unanswered-call slot left is refused before the request takes anything from them", async () => {
    const { t, meId, textlessId } = await setup();
    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    for (let i = 0; i < 5; i++) await t.mutation(internal.internal.aiRateLimit.holdAiUnanswered, { key: ME.subject });

    await expect(remixAs(ME)).rejects.toThrow(/still running or got no answer/);
    await expect(remixAs(YOU)).rejects.toThrow("Question text not found.");

    const { limits, usage } = await t.run(async (ctx) => ({
      limits: (await ctx.db.query("rateLimits").collect()).filter((row) => row.key === ME.subject).map((row) => row.name),
      usage: (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === meId),
    }));
    expect(limits).toEqual(["aiUnanswered"]);
    expect(usage).toEqual([]);
  });

  test("a slot is given back to the spend day it was held on, and never past the five", async () => {
    const { t } = await setup();
    const hold = () => t.mutation(internal.internal.aiRateLimit.holdAiUnanswered, { key: ME.subject });
    const release = (day: string) => t.mutation(internal.internal.aiRateLimit.releaseAiUnanswered, { key: ME.subject, day });
    const left = () =>
      t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).find((row) => row.name === "aiUnanswered")?.value);

    // 11:59pm PDT on Sep 29, then 12:01am on Sep 30.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 6, 59));
    expect(await hold()).toEqual({ ok: true, day: "2026-09-29" });
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 1));
    expect(await hold()).toEqual({ ok: true, day: "2026-09-30" });
    expect(await left()).toBe(4);

    // Yesterday's call finishing doesn't add to today's slots.
    await release("2026-09-29");
    expect(await left()).toBe(4);
    await release("2026-09-30");
    await release("2026-09-30");
    expect(await left()).toBe(5);

    for (let i = 0; i < 5; i++) expect(await hold()).toEqual({ ok: true, day: "2026-09-30" });
    expect(await hold()).toEqual({ ok: false, retryAt: Date.UTC(2026, 9, 1, 7, 0) });
  });

  test("giving back a slot when none is held changes nothing", async () => {
    const { t } = await setup();
    const hold = () => t.mutation(internal.internal.aiRateLimit.holdAiUnanswered, { key: ME.subject });
    const rows = () => t.run(async (ctx) => await ctx.db.query("rateLimits").collect());

    // Noon Pacific Daylight Time.
    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    expect(
      await t.mutation(internal.internal.aiRateLimit.releaseAiUnanswered, { key: ME.subject, day: "2026-09-29" }),
    ).toBeNull();
    expect(await rows()).toEqual([]);

    // The person still starts the day with five.
    for (let i = 0; i < 5; i++) expect(await hold()).toEqual({ ok: true, day: "2026-09-29" });
    expect(await hold()).toEqual({ ok: false, retryAt: Date.UTC(2026, 8, 30, 7, 0) });
  });

  test("a person over the daily limit is told when the next day starts", async () => {
    const { t, textlessId } = await setup();
    // Noon Pacific Daylight Time.
    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count: 40 });

    const refusal = await t
      .withIdentity(ME)
      .action(api.core.questions.remixQuestionForUser, { questionId: textlessId })
      .catch((error: unknown) => error);

    expect(convexErrorData(refusal)).toEqual({
      code: ERROR_CODES.AI_RATE_LIMITED,
      message: ERROR_MESSAGES.AI_DAILY_LIMITED,
      retryAt: Date.UTC(2026, 8, 30, 7, 0),
    });
  });

  test("a count larger than a whole day's limit is refused and takes nothing", async () => {
    const { t } = await setup();
    const take = (count: number) =>
      t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count });

    // Noon Pacific Daylight Time.
    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    expect(await take(41)).toEqual({ ok: false, retryAt: Date.UTC(2026, 8, 30, 7, 0) });
    expect(await t.run(async (ctx) => await ctx.db.query("rateLimits").collect())).toEqual([]);

    // The whole 40 are still there, and no more.
    expect(await take(40)).toEqual({ ok: true });
    expect(await take(1)).toEqual({ ok: false, retryAt: Date.UTC(2026, 8, 30, 7, 0) });
  });

  test("the daily limit only takes a positive whole count", async () => {
    const { t } = await setup();

    for (const count of [0, -5, 1.5, Number.NaN]) {
      await expect(
        t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count }),
      ).rejects.toThrow(/positive integer/);
    }

    expect(await t.run(async (ctx) => await ctx.db.query("rateLimits").collect())).toEqual([]);
  });

  test("an operator can give one person their slots back", async () => {
    const { t, textlessId } = await setup();
    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    const reset = (key: string) => t.mutation(internal.internal.aiRateLimit.resetAiUnanswered, { key });
    for (const key of [ME.subject, YOU.subject]) {
      for (let i = 0; i < 5; i++) await t.mutation(internal.internal.aiRateLimit.holdAiUnanswered, { key });
    }
    await expect(remixAs(ME)).rejects.toThrow(/still running or got no answer/);

    expect(await reset(ME.subject)).toBeNull();

    // Past the limits again, and nobody else's slots were touched.
    await expect(remixAs(ME)).rejects.toThrow("Question text not found.");
    await expect(remixAs(YOU)).rejects.toThrow(/still running or got no answer/);
    expect(await t.mutation(internal.internal.aiRateLimit.checkAiUnanswered, { key: ME.subject })).toEqual({ ok: true });
    // A person with nothing held has nothing to reset.
    expect(await reset("someone-else")).toBeNull();
  });

  test("team previews draw from the same bucket", async () => {
    const { t } = await setup();
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequest", key: ME.subject, count: 10 });
    const { orgId, styleId, toneId } = await t.run(async (ctx) => ({
      orgId: await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
      styleId: await ctx.db.insert("styles", {
        id: "reflective",
        name: "Reflective",
        structure: "Ask for a reflection",
        color: "#111111",
        icon: "sparkles",
      }),
      toneId: await ctx.db.insert("tones", {
        id: "warm",
        name: "Warm",
        promptGuidanceForAI: "Be warm",
        color: "#222222",
        icon: "sun",
      }),
    }));

    await expect(
      t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
        organizationId: orgId,
        name: "Recovery",
        guidance: "Talk about rest days",
        styleId,
        toneId,
      }),
    ).rejects.toThrow(RATE_LIMITED);
  });
});

describe("takeover topics", () => {
  test("a takeover-topic remix skips the usage quota but not the rate limit or the budget", async () => {
    const { t } = await setup();
    const now = Date.now();
    const questionId = await t.run(async (ctx) => {
      const topicId = await ctx.db.insert("topics", {
        id: "takeover",
        slug: "takeover",
        name: "Takeover",
        status: "active",
        version: 1,
        takeoverStartDate: now - 1000,
        takeoverEndDate: now + 60 * 60 * 1000,
      });
      return await ctx.db.insert("questions", { text: "Takeover question?", topicId, status: "public", ...counters });
    });
    const remixAs = (identity: typeof ME) =>
      t.withIdentity(identity).action(api.core.questions.remixQuestionForUser, { questionId });

    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequest", key: ME.subject, count: 10 });
    await expect(remixAs(ME)).rejects.toThrow(RATE_LIMITED);

    await t.run(async (ctx) => {
      await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 1, calls: 1 });
    });
    await expect(remixAs(YOU)).rejects.toThrow(/paused for today/);
  });
});

describe("matrix fill", () => {
  async function paidOrgMember() {
    const { t, meId } = await setup();
    const orgId = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    const fill = () =>
      t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
        organizationId: orgId,
        axisY: "style",
        axisX: "tone",
        topicSlug: "any-topic",
        cells: [{ ySlug: "a", xSlug: "b", styleSlug: "a", toneSlug: "b" }],
      });
    return { t, orgId, fill };
  }

  test("stops with the rate-limit error once the organization's cells are used, and frees the cell", async () => {
    const { t, orgId, fill } = await paidOrgMember();
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, {
      name: "matrixFillCell",
      key: orgId,
      count: 50,
    });

    await expect(fill()).rejects.toThrow(MATRIX_LIMITED);

    const locks = await t.run(async (ctx) => await ctx.db.query("matrixFillCellLocks").collect());
    expect(locks).toEqual([]);
  });

  test("reports a paused budget instead of quietly skipping every cell", async () => {
    const { t, fill } = await paidOrgMember();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 100, calls: 1 });
    });

    await expect(fill()).rejects.toThrow(/paused for today/);
  });
});
