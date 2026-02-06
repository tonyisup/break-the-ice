import { convexTest } from "convex-test";
import { expect, test, beforeEach } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

test("getUserInteractionStats and dismissRefineCTA", async () => {
  const t = convexTest(schema);

  // Set up a user
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });
  });

  // Mock identity
  const identity = { subject: "test-user-id", email: "test@example.com" };
  const authenticatedT = t.withIdentity(identity);

  // Initial stats
  let stats = await authenticatedT.query(api.core.users.getUserInteractionStats, {});
  expect(stats).toEqual({
    totalSeen: 0,
    totalLikes: 0,
    dismissedRefineCTA: false,
  });

  // Add some seen questions
  await t.run(async (ctx) => {
    const q1 = await ctx.db.insert("questions", { totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const q2 = await ctx.db.insert("questions", { totalLikes: 0, totalShows: 0, averageViewDuration: 0 });

    await ctx.db.insert("userQuestions", {
      userId,
      questionId: q1,
      status: "seen",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("userQuestions", {
      userId,
      questionId: q2,
      status: "seen",
      updatedAt: Date.now(),
    });
  });

  stats = await authenticatedT.query(api.core.users.getUserInteractionStats, {});
  expect(stats.totalSeen).toBe(2);
  expect(stats.totalLikes).toBe(0);

  // Add a liked question
  await t.run(async (ctx) => {
    const q3 = await ctx.db.insert("questions", { totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    await ctx.db.insert("userQuestions", {
      userId,
      questionId: q3,
      status: "liked",
      updatedAt: Date.now(),
    });
  });

  stats = await authenticatedT.query(api.core.users.getUserInteractionStats, {});
  expect(stats.totalSeen).toBe(3); // liked is included in totalSeen because it's not "unseen"
  expect(stats.totalLikes).toBe(1);

  // Dismiss CTA
  await authenticatedT.mutation(api.core.users.dismissRefineCTA, {});

  stats = await authenticatedT.query(api.core.users.getUserInteractionStats, {});
  expect(stats.dismissedRefineCTA).toBe(true);
});
