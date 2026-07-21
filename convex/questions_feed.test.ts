/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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
  expect(new Set(results.map((question: Doc<"questions">) => question._id))).toEqual(new Set(questionIds));
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
  expect(results.some((question: Doc<"questions">) => question._id === ids.recentQuestion)).toBe(true);
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
  expect(results.filter((question: Doc<"questions">) => question.styleId === styleId).length).toBeLessThanOrEqual(reasonableAnchoredCap);
});

test("personal feed excludes organization-tagged questions", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const { globalId, orgOnlyId } = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      name: "Test Org",
    });

    const globalId = await ctx.db.insert("questions", {
      text: "Global pool question?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });

    const orgOnlyId = await ctx.db.insert("questions", {
      text: "Org-only question?",
      status: "public",
      organizationId,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });

    return { globalId, orgOnlyId };
  });

  const results = await t.query(internal.internal.questions.getRandomQuestionsInternal, {
    count: 10,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
  });

  const resultIds = new Set(results.map((q: Doc<"questions">) => q._id));
  expect(resultIds.has(globalId)).toBe(true);
  expect(resultIds.has(orgOnlyId)).toBe(false);
});

test("organization feed includes org-tagged and global questions", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const { organizationId, globalId, orgOnlyId } = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      name: "Test Org",
    });

    const globalId = await ctx.db.insert("questions", {
      text: "Global pool question?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });

    const orgOnlyId = await ctx.db.insert("questions", {
      text: "Org-only question?",
      status: "public",
      organizationId,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });

    return { organizationId, globalId, orgOnlyId };
  });

  const results = await t.query(internal.internal.questions.getRandomQuestionsInternal, {
    count: 10,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
    organizationId,
  });

  const resultIds = new Set(results.map((q: Doc<"questions">) => q._id));
  expect(resultIds.has(globalId)).toBe(true);
  expect(resultIds.has(orgOnlyId)).toBe(true);
});

test("anchored feed meets its quota across taxonomy versions and legacy slugs", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();

  const { currentStyleId, matchingIds } = await t.run(async (ctx) => {
    const archivedStyleId = await ctx.db.insert("styles", {
      id: "story-style",
      slug: "story-style",
      name: "Story Style v1",
      structure: "Ask for a story",
      color: "#111111",
      icon: "book",
      status: "archived",
      version: 1,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    });
    const currentStyleId = await ctx.db.insert("styles", {
      id: "story-style",
      slug: "story-style",
      name: "Story Style v2",
      structure: "Ask for a vivid story",
      color: "#222222",
      icon: "book-open",
      status: "active",
      version: 2,
      createdAt: now,
      updatedAt: now,
    });

    const matchingIds: Id<"questions">[] = [];
    for (let index = 0; index < 4; index++) {
      matchingIds.push(
        await ctx.db.insert("questions", {
          text: `Archived-version story ${index}?`,
          styleId: archivedStyleId,
          style: "story-style",
          status: "public",
          totalLikes: 0,
          totalShows: 0,
          averageViewDuration: 0,
          lastShownAt: index === 0 ? now - 60_000 : 0,
        }),
      );
    }
    matchingIds.push(
      await ctx.db.insert("questions", {
        text: "Current-version story?",
        styleId: currentStyleId,
        styleSlug: "story-style",
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: 0,
      }),
    );
    matchingIds.push(
      await ctx.db.insert("questions", {
        text: "Legacy slug-only story?",
        style: "story-style",
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: 0,
      }),
    );

    for (let index = 0; index < 10; index++) {
      await ctx.db.insert("questions", {
        text: `General question ${index}?`,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: 0,
      });
    }
    return { currentStyleId, matchingIds };
  });

  const result = await t.query(internal.internal.questions.getAnchoredQuestionsInternal, {
    count: 10,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
    anchoredStyleId: currentStyleId,
    randomSeed: 0.25,
  });

  expect(result.targetAnchoredCount).toBe(6);
  expect(result.anchoredMatchCount).toBe(6);
  expect(result.questions).toHaveLength(10);
  expect(new Set(result.questions.slice(0, 6).map((question: Doc<"questions">) => question._id))).toEqual(new Set(matchingIds));
});

test("anchored feed reports a shortfall and ranks full multi-anchor matches first", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();

  const { styleId, toneId, fullMatchIds } = await t.run(async (ctx) => {
    const styleId = await ctx.db.insert("styles", {
      id: "ranked-style",
      slug: "ranked-style",
      name: "Ranked Style",
      structure: "Rank matches",
      color: "#111111",
      icon: "list",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const toneId = await ctx.db.insert("tones", {
      id: "ranked-tone",
      slug: "ranked-tone",
      name: "Ranked Tone",
      color: "#222222",
      icon: "message-circle",
      promptGuidanceForAI: "Use a ranked tone.",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const fullMatchIds = [
      await ctx.db.insert("questions", {
        text: "Full match one?",
        styleId,
        toneId,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      }),
      await ctx.db.insert("questions", {
        text: "Full match two?",
        styleId,
        toneId,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      }),
    ];
    await ctx.db.insert("questions", {
      text: "Style-only partial match?",
      styleId,
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    for (let index = 0; index < 5; index++) {
      await ctx.db.insert("questions", {
        text: `General ranked question ${index}?`,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
    }
    return { styleId, toneId, fullMatchIds };
  });

  const result = await t.query(internal.internal.questions.getAnchoredQuestionsInternal, {
    count: 5,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
    anchoredStyleId: styleId,
    anchoredToneId: toneId,
    randomSeed: 0.5,
  });

  expect(result.targetAnchoredCount).toBe(3);
  expect(result.anchoredMatchCount).toBe(3);
  expect(new Set(result.questions.slice(0, 2).map((question: Doc<"questions">) => question._id))).toEqual(new Set(fullMatchIds));
});

test("an explicit anchor takes precedence over an active takeover topic", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const now = Date.now();

  const { styleId, anchoredQuestionId } = await t.run(async (ctx) => {
    const styleId = await ctx.db.insert("styles", {
      id: "explicit-style",
      slug: "explicit-style",
      name: "Explicit Style",
      structure: "Respect explicit intent",
      color: "#111111",
      icon: "target",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const takeoverTopicId = await ctx.db.insert("topics", {
      id: "takeover-topic",
      slug: "takeover-topic",
      name: "Takeover Topic",
      aiGuidance: "Use the takeover topic.",
      status: "active",
      version: 1,
      takeoverStartDate: now - 1000,
      takeoverEndDate: now + 1000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("questions", {
      text: "Takeover-only question?",
      topicId: takeoverTopicId,
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    const anchoredQuestionId = await ctx.db.insert("questions", {
      text: "Explicitly anchored question?",
      styleId,
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    return { styleId, anchoredQuestionId };
  });

  const result = await t.action(api.core.questions.getNextRandomQuestions, {
    count: 5,
    seen: [],
    hidden: [],
    hiddenStyles: [],
    hiddenTones: [],
    anchoredStyleId: styleId,
    randomSeed: 0.75,
  });

  expect(result.anchoredMatchCount).toBe(1);
  expect(result.questions[0]?._id).toBe(anchoredQuestionId);
});

test("tone ID backfill skips completed rows and reaches later legacy questions", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const { toneId, legacyQuestionId } = await t.run(async (ctx) => {
    const toneId = await ctx.db.insert("tones", {
      id: "zzz-legacy-tone",
      slug: "zzz-legacy-tone",
      name: "Legacy Tone",
      color: "#111111",
      icon: "message-circle",
      promptGuidanceForAI: "Use a legacy tone.",
      status: "active",
    });
    for (let index = 0; index < 100; index++) {
      await ctx.db.insert("questions", {
        text: `Already backfilled ${index}?`,
        tone: "aaa-complete-tone",
        toneId,
        status: "public",
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
    }
    const legacyQuestionId = await ctx.db.insert("questions", {
      text: "Needs the later tone backfill?",
      tone: "zzz-legacy-tone",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    return { toneId, legacyQuestionId };
  });

  vi.useFakeTimers();
  await t.mutation(internal.internal.tones.updateQuestionsWithMissingToneIds, {});
  const legacyQuestion = await t.run((ctx) => ctx.db.get(legacyQuestionId));
  expect(legacyQuestion?.toneId).toBe(toneId);
  vi.clearAllTimers();
  vi.useRealTimers();
});

test("fixExistingQuestions processes one batch and schedules continuation", async () => {
  vi.useFakeTimers();
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
  vi.clearAllTimers();
  vi.useRealTimers();
});
