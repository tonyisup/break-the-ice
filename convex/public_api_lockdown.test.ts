/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import * as ai from "./core/ai";
import * as questions from "./core/questions";
import * as tags from "./core/tags";
import * as instagram from "./instagram";

// These ran with no auth check (or wrote shared data), so the client must not be able to call them.
describe("locked-down functions stay off the public API", () => {
  test.each([
    ["core/tags:initializeTags", tags.initializeTags],
    ["instagram:postToInstagram", instagram.postToInstagram],
    ["core/questions:getNearestQuestionsByEmbedding", questions.getNearestQuestionsByEmbedding],
  ])("%s is internal", (_name, fn) => {
    expect(fn.isInternal).toBe(true);
    expect((fn as { isPublic?: boolean }).isPublic).toBeUndefined();
  });

  test("removed endpoints are no longer exported", () => {
    const aiExports = Object.keys(ai);
    const questionExports = Object.keys(questions);
    for (const name of ["preview", "generateFallbackQuestion", "generateAIQuestions", "generateAIQuestionForNewsletter"]) {
      expect(aiExports).not.toContain(name);
    }
    for (const name of ["discardQuestion", "getSimilarQuestions", "getNextQuestionsByEmbedding"]) {
      expect(questionExports).not.toContain(name);
    }
    // The feed generator the client still uses stays public.
    expect(ai.generateAIQuestionForFeed.isPublic).toBe(true);
  });
});

describe("internal nearest-question lookup", () => {
  test("still returns approved questions for server callers and skips private ones", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
    const approvedId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { email: "owner@example.com", clerkId: "owner-clerk" });
      const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
      const approvedId = await ctx.db.insert("questions", { text: "Approved?", status: "approved", ...counters });
      const privateId = await ctx.db.insert("questions", {
        text: "Private?",
        authorId: ownerId,
        status: "private",
        ...counters,
      });
      await ctx.db.insert("question_embeddings", { questionId: approvedId, embedding: vector, status: "approved" });
      await ctx.db.insert("question_embeddings", { questionId: privateId, embedding: vector, status: "private" });
      return approvedId;
    });

    const nearest = await t.action(internal.core.questions.getNearestQuestionsByEmbedding, {
      embedding: vector,
      count: 5,
    });
    expect(nearest.map((question: { _id: string }) => question._id)).toEqual([approvedId]);
    expect(
      await t.action(internal.core.questions.getNearestQuestionsByEmbedding, { embedding: [] }),
    ).toEqual([]);
  });
});
