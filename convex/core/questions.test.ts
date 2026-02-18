import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

test("getUserLikedAndPreferredEmbedding should ignore empty user embedding", async () => {
  const t = convexTest(schema);

  // 1. Create a user with an empty preference embedding
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });
  });

  // 2. Create liked questions with valid embeddings
  await t.run(async (ctx) => {
    const q1 = await ctx.db.insert("questions", {
      embedding: [1, 1, 1],
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    const q2 = await ctx.db.insert("questions", {
      embedding: [3, 3, 3],
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    await ctx.db.insert("userQuestions", { userId, questionId: q1, status: "liked", updatedAt: Date.now() });
    await ctx.db.insert("userQuestions", { userId, questionId: q2, status: "liked", updatedAt: Date.now() });
  });

  // 3. Mock identity and call the query
  const identity = { subject: "test-user-id", email: "test@example.com" };
  const result = await t.withIdentity(identity).query(api.core.questions.getUserLikedAndPreferredEmbedding);

  // 4. Assert the average is correct (should be [2, 2, 2])
  // The failing implementation would likely produce a skewed result (e.g. [1.33, 1.33, 1.33])
  expect(result).toEqual([2, 2, 2]);
});
