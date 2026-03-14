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

test("fixExistingQuestions backfills missing lastShownAt to zero", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const questionId = await t.run(async (ctx) => {
    return await ctx.db.insert("questions", {
      text: "Needs backfill?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  });

  const result = await t.withIdentity({ metadata: { isAdmin: "true" } }).mutation(
    api.admin.questions.fixExistingQuestions,
    {}
  );

  const question = await t.run(async (ctx) => ctx.db.get(questionId));

  expect(result.fixedCount).toBe(1);
  expect(question?.lastShownAt).toBe(0);
});
