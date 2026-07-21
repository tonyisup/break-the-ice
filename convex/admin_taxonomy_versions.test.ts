/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const adminIdentity = { metadata: { isAdmin: "true" } };

afterEach(() => {
  vi.useRealTimers();
});

describe("taxonomy version activation", () => {
  test("moves existing questions and embedding filters from any old version to the activated version", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const now = Date.now();

    const ids = await t.run(async (ctx) => {
      const styleV1 = await ctx.db.insert("styles", {
        id: "reflective",
        name: "Reflective v1",
        structure: "Ask for a reflection",
        color: "#111111",
        icon: "sparkles",
      });
      const styleV2 = await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v2",
        structure: "Ask for a newer reflection",
        color: "#222222",
        icon: "sparkles",
        version: 2,
        status: "active",
      });
      const styleV3 = await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v3",
        structure: "Ask for the newest reflection",
        color: "#333333",
        icon: "sparkles",
        version: 3,
        status: "draft",
      });

      const toneV1 = await ctx.db.insert("tones", {
        id: "warm",
        name: "Warm v1",
        promptGuidanceForAI: "Be warm",
        color: "#111111",
        icon: "sun",
      });
      const toneV2 = await ctx.db.insert("tones", {
        id: "warm",
        slug: "warm",
        name: "Warm v2",
        promptGuidanceForAI: "Be warmer",
        color: "#222222",
        icon: "sun",
        version: 2,
        status: "active",
      });
      const toneV3 = await ctx.db.insert("tones", {
        id: "warm",
        slug: "warm",
        name: "Warm v3",
        promptGuidanceForAI: "Be warmest",
        color: "#333333",
        icon: "sun",
        version: 3,
        status: "draft",
      });

      const topicV1 = await ctx.db.insert("topics", {
        id: "weekends",
        name: "Weekends v1",
      });
      const topicV2 = await ctx.db.insert("topics", {
        id: "weekends",
        slug: "weekends",
        name: "Weekends v2",
        version: 2,
        status: "active",
      });
      const topicV3 = await ctx.db.insert("topics", {
        id: "weekends",
        slug: "weekends",
        name: "Weekends v3",
        version: 3,
        status: "draft",
      });

      const questionId = await ctx.db.insert("questions", {
        text: "What makes a weekend memorable?",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
        status: "public",
        style: "reflective",
        styleId: styleV1,
        styleSlug: "reflective",
        styleVersion: 1,
        tone: "warm",
        toneId: toneV1,
        toneSlug: "warm",
        toneVersion: 1,
        topic: "weekends",
        topicId: topicV1,
        topicSlug: "weekends",
        topicVersion: 1,
      });
      const embeddingId = await ctx.db.insert("question_embeddings", {
        questionId,
        embedding: Array.from({ length: 384 }, () => 0),
        status: "public",
        styleId: styleV1,
        toneId: toneV1,
        topicId: topicV1,
      });

      return {
        questionId,
        embeddingId,
        styleV1,
        styleV2,
        styleV3,
        toneV1,
        toneV2,
        toneV3,
        topicV1,
        topicV2,
        topicV3,
      };
    });

    const admin = t.withIdentity(adminIdentity);
    await admin.mutation(api.admin.styles.activateStyleVersion, {
      id: ids.styleV3,
    });
    await admin.mutation(api.admin.tones.activateToneVersion, {
      id: ids.toneV3,
    });
    await admin.mutation(api.admin.topics.activateTopicVersion, {
      _id: ids.topicV3,
    });

    const beforeScheduledWork = await t.run(async (ctx) => ({
      question: await ctx.db.get(ids.questionId),
      embedding: await ctx.db.get(ids.embeddingId),
    }));
    expect(beforeScheduledWork.question).toMatchObject({
      styleId: ids.styleV1,
      toneId: ids.toneV1,
      topicId: ids.topicV1,
    });
    expect(beforeScheduledWork.embedding).toMatchObject({
      styleId: ids.styleV1,
      toneId: ids.toneV1,
      topicId: ids.topicV1,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const result = await t.run(async (ctx) => ({
      question: await ctx.db.get(ids.questionId),
      embedding: await ctx.db.get(ids.embeddingId),
      oldVersions: await Promise.all([
        ctx.db.get(ids.styleV1),
        ctx.db.get(ids.styleV2),
        ctx.db.get(ids.toneV1),
        ctx.db.get(ids.toneV2),
        ctx.db.get(ids.topicV1),
        ctx.db.get(ids.topicV2),
      ]),
    }));

    expect(result.question).toMatchObject({
      style: "reflective",
      styleId: ids.styleV3,
      styleSlug: "reflective",
      styleVersion: 3,
      tone: "warm",
      toneId: ids.toneV3,
      toneSlug: "warm",
      toneVersion: 3,
      topic: "weekends",
      topicId: ids.topicV3,
      topicSlug: "weekends",
      topicVersion: 3,
    });
    expect(result.embedding).toMatchObject({
      styleId: ids.styleV3,
      toneId: ids.toneV3,
      topicId: ids.topicV3,
    });
    expect(
      result.oldVersions.every((version) => version?.status === "archived"),
    ).toBe(true);
  });

  test("defers and continues question and preference reassignment in scheduled batches", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    const { oldStyleId, newStyleId, userStyleId } = await t.run(async (ctx) => {
      const oldStyleId = await ctx.db.insert("styles", {
        id: "story",
        slug: "story",
        name: "Story v1",
        structure: "Ask for a story",
        color: "#111111",
        icon: "book",
        version: 1,
        status: "active",
      });
      const newStyleId = await ctx.db.insert("styles", {
        id: "story",
        slug: "story",
        name: "Story v2",
        structure: "Ask for a vivid story",
        color: "#222222",
        icon: "book",
        version: 2,
        status: "draft",
      });

      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("questions", {
          text: `Story question ${index}?`,
          averageViewDuration: 0,
          totalLikes: 0,
          totalShows: 0,
          status: "public",
          style: "story",
          styleId: oldStyleId,
          styleSlug: "story",
          styleVersion: 1,
        });
      }

      const userId = await ctx.db.insert("users", {
        email: "scheduled-style@example.com",
      });
      const userStyleId = await ctx.db.insert("userStyles", {
        userId,
        styleId: oldStyleId,
        status: "preferred",
        updatedAt: Date.now(),
      });

      return { oldStyleId, newStyleId, userStyleId };
    });

    await t
      .withIdentity(adminIdentity)
      .mutation(api.admin.styles.activateStyleVersion, { id: newStyleId });

    const beforeScheduledWork = await t.run(async (ctx) => ({
      oldQuestions: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", oldStyleId))
        .collect(),
      newQuestions: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", newStyleId))
        .collect(),
      userStyle: await ctx.db.get(userStyleId),
    }));
    expect(beforeScheduledWork.oldQuestions).toHaveLength(101);
    expect(beforeScheduledWork.newQuestions).toHaveLength(0);
    expect(beforeScheduledWork.userStyle?.styleId).toBe(oldStyleId);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counts = await t.run(async (ctx) => ({
      old: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", oldStyleId))
        .collect(),
      current: await ctx.db
        .query("questions")
        .withIndex("by_style", (q) => q.eq("styleId", newStyleId))
        .collect(),
      userStyle: await ctx.db.get(userStyleId),
    }));

    expect(counts.old).toHaveLength(0);
    expect(counts.current).toHaveLength(101);
    expect(
      counts.current.every((question) => question.styleVersion === 2),
    ).toBe(true);
    expect(counts.userStyle?.styleId).toBe(newStyleId);
  });
});
