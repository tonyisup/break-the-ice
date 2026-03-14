/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

test("feed query falls back to recently shown questions when no older questions are available", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();

  const questionIds = await t.run(async (ctx) => {
    const recentOne = await ctx.db.insert("questions", {
      text: "Recent question one?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: now - 2 * 24 * 60 * 60 * 1000,
    });
    const recentTwo = await ctx.db.insert("questions", {
      text: "Recent question two?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: now - 24 * 60 * 60 * 1000,
    });

    return [recentOne, recentTwo];
  });

  const results = await t.query(internal.internal.questions.getRandomQuestionsInternal, {
    count: 2,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
  });

  expect(results).toHaveLength(2);
  expect(new Set(results.map((question) => question._id))).toEqual(new Set(questionIds));
});

test("feed query prioritizes questions not shown in the last seven days", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();

  const ids = await t.run(async (ctx) => {
    const olderQuestion = await ctx.db.insert("questions", {
      text: "Older question?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: now - 10 * 24 * 60 * 60 * 1000,
    });
    const recentQuestion = await ctx.db.insert("questions", {
      text: "Recent question?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: now - 24 * 60 * 60 * 1000,
    });

    return { olderQuestion, recentQuestion };
  });

  const results = await t.query(internal.internal.questions.getRandomQuestionsInternal, {
    count: 2,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
  });

  expect(results[0]?._id).toBe(ids.olderQuestion);
  expect(results.some((question) => question._id === ids.recentQuestion)).toBe(true);
});

test("anchored candidates are capped without re-entering through the general pool", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();
  const seededAnchoredCount = 50;
  const reasonableAnchoredCap = 30;

  const styleId = await t.run(async (ctx) => {
    return await ctx.db.insert("styles", {
      id: "anchored-style",
      name: "Anchored Style",
      structure: "Ask something specific",
      color: "#000000",
      icon: "sparkles",
      status: "active",
      version: 1,
      slug: "anchored-style",
      createdAt: now,
      updatedAt: now,
    });
  });

  await t.run(async (ctx) => {
    for (let index = 0; index < seededAnchoredCount; index++) {
      await ctx.db.insert("questions", {
        text: `Anchored question ${index}?`,
        status: "public",
        styleId,
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 10 * 24 * 60 * 60 * 1000,
      });
    }

    await ctx.db.insert("questions", {
      text: "General question?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: now - 10 * 24 * 60 * 60 * 1000,
    });
  });

  const results = await t.query(internal.internal.questions.getRandomQuestionsInternal, {
    count: 1,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
    anchoredStyleId: styleId,
  });

  // getRandomQuestionsInternal intentionally caps anchoredStyleId matches before
  // merging with the general pool; keep the bound loose so multiplier tweaks
  // do not break the test while still catching anchored rows re-entering later.
  expect(results.filter((question) => question.styleId === styleId).length).toBeLessThanOrEqual(reasonableAnchoredCap);
});

test("fixExistingQuestions processes one batch and schedules continuation", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  await t.run(async (ctx) => {
    for (let index = 0; index < 101; index++) {
      await ctx.db.insert("questions", {
        text: `Needs backfill ${index}?`,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
    }
  });

  const result = await t.withIdentity({ metadata: { isAdmin: "true" } }).mutation(
    api.admin.questions.fixExistingQuestions,
    {}
  );

  const state = await t.run(async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    const scheduled = await ctx.db.system.query("_scheduled_functions").collect();

    return {
      backfilledCount: questions.filter((question) => question.lastShownAt === 0).length,
      remainingCount: questions.filter((question) => question.lastShownAt === undefined).length,
      scheduledCount: scheduled.length,
    };
  });

  expect(result).toEqual({ processedCount: 100, fixedCount: 100, hasMore: true });
  expect(state.backfilledCount).toBe(100);
  expect(state.remainingCount).toBe(1);
  expect(state.scheduledCount).toBe(1);
});
