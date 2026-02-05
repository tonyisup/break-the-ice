/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Daily newsletter", () => {
  test("returns unique question on each call", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    // 1. Create a user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "test@example.com",
        newsletterSubscriptionStatus: "subscribed",
      });
    });

    // 2. Create pool questions
    const q1Id = await t.run(async (ctx) => {
      return await ctx.db.insert("questions", {
        text: "Question 1",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
        poolStatus: "available",
        poolDate: "2024-01-01",
      });
    });

    const q2Id = await t.run(async (ctx) => {
      return await ctx.db.insert("questions", {
        text: "Question 2",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
        poolStatus: "available",
        poolDate: "2024-01-01",
      });
    });

    // 3. Assign questions to user as unseen
    await t.mutation(internal.internal.questions.assignPoolQuestionsToUser, {
      userId,
      questionIds: [q1Id, q2Id]
    });

    // Verify assignments
    const userQuestions = await t.run(async (ctx) => {
      return await ctx.db.query("userQuestions").withIndex("by_userId", q => q.eq("userId", userId)).collect();
    });
    expect(userQuestions.length).toBe(2);
    expect(userQuestions[0].status).toBe("unseen");

    // 4. Get first newsletter question
    const result1 = await t.query(api.core.questions.getQuestionForNewsletter, {
      userId
    });

    expect(result1).not.toBeNull();
    const firstSeenId = result1!._id;
    expect([q1Id, q2Id]).toContain(firstSeenId);

    // 5. Call again without marking seen - should return same question (idempotency)
    const result1Again = await t.query(api.core.questions.getQuestionForNewsletter, {
      userId
    });
    expect(result1Again!._id).toBe(firstSeenId);

    // 6. Mark as seen (WITH IDENTITY)
    await t.withIdentity({ email: "test@example.com" }).mutation(api.core.questions.recordAnalytics, {
      questionId: firstSeenId,
      event: "seen",
      viewDuration: 1000
    });

    // Verify status updated
    const uqSeen = await t.run(async (ctx) => {
      return await ctx.db.query("userQuestions")
        .withIndex("by_userIdAndQuestionId", q => q.eq("userId", userId).eq("questionId", firstSeenId))
        .unique();
    });
    expect(uqSeen?.status).toBe("seen");

    // 7. Get next newsletter question
    const result2 = await t.query(api.core.questions.getQuestionForNewsletter, {
      userId
    });

    expect(result2).not.toBeNull();
    expect(result2!._id).not.toBe(firstSeenId);
    expect([q1Id, q2Id]).toContain(result2!._id);

    // 8. Mark second as seen (WITH IDENTITY)
    await t.withIdentity({ email: "test@example.com" }).mutation(api.core.questions.recordAnalytics, {
      questionId: result2!._id,
      event: "seen",
      viewDuration: 1000
    });

    // 9. Fallback logic: Create Q3 (public, not assigned)
    const q3Id = await t.run(async (ctx) => {
      return await ctx.db.insert("questions", {
        text: "Question 3",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
        status: "public"
      });
    });

    const result3 = await t.query(api.core.questions.getQuestionForNewsletter, {
      userId
    });

    expect(result3).not.toBeNull();
    expect(result3!._id).toBe(q3Id);
  });
});
