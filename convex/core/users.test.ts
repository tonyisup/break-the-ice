import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

test("getUserInteractionStats and dismissRefineCTA", async () => {
  const t = convexTest(schema, convexFunctionModules);

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

test("store reuses an existing email user and patches Clerk identifiers", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const existingUserId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Email First User",
      email: "test@example.com",
    });
  });

  const storedUserId = await t.withIdentity({
    subject: "user_789",
    tokenIdentifier: "https://clerk.example|user_789",
    email: "test@example.com",
    name: "Email First User",
  }).mutation(api.core.users.store, {});

  expect(storedUserId).toBe(existingUserId);

  await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "test@example.com"))
      .collect();

    expect(users).toHaveLength(1);
    expect(users[0]?.clerkId).toBe("user_789");
    expect(users[0]?.tokenIdentifier).toBe("https://clerk.example|user_789");
  });
});

test("getCurrentUser prefers tokenIdentifier-linked row when duplicate emails exist", async () => {
  const t = convexTest(schema, convexFunctionModules);

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Email-only older row",
      email: "dupe@example.com",
    });
  });

  const tokenUserId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Token Duplicate",
      email: "dupe@example.com",
      tokenIdentifier: "https://clerk.example|dupe",
    });
  });

  const currentUser = await t.withIdentity({
    subject: "user_dupe",
    tokenIdentifier: "https://clerk.example|dupe",
    email: "dupe@example.com",
  }).query(api.core.users.getCurrentUser, {});

  expect(currentUser?._id).toBe(tokenUserId);
});
