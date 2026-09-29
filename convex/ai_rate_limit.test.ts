/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { spendDay } from "./lib/aiSpend";

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

  test("the daily limit resets at midnight in Los Angeles (1am during daylight time)", async () => {
    const { t, textlessId } = await setup();
    const remix = () => t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId: textlessId });
    // Noon Pacific Daylight Time.
    vi.setSystemTime(Date.UTC(2026, 8, 29, 19, 0));
    await t.mutation(internal.internal.aiRateLimit.consumeAiRateLimit, { name: "aiRequestDaily", key: ME.subject, count: 40 });
    await expect(remix()).rejects.toThrow(/today's AI requests/);

    // 12:30am PDT is still the same window; 1:01am PDT is the next one.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 7, 30));
    await expect(remix()).rejects.toThrow(/today's AI requests/);
    vi.setSystemTime(Date.UTC(2026, 8, 30, 8, 1));
    await expect(remix()).rejects.toThrow("Question text not found.");
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
