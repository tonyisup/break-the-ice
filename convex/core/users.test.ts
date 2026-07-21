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

test("store creates a new Clerk user with normalized profile data", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const storedUserId = await t
    .withIdentity({
      subject: "user_new",
      tokenIdentifier: "https://clerk.example|user_new",
      email: "  NEW@Example.COM ",
      name: "New User",
      pictureUrl: "https://example.com/avatar.png",
    })
    .mutation(api.core.users.store, {});

  await t.run(async (ctx) => {
    const user = await ctx.db.get(storedUserId);
    expect(user).toMatchObject({
      clerkId: "user_new",
      tokenIdentifier: "https://clerk.example|user_new",
      email: "new@example.com",
      name: "New User",
      image: "https://example.com/avatar.png",
      billingStatus: "inactive",
    });
    expect(user?.aiUsage).toMatchObject({ count: 0 });
  });
});

test("store is idempotent for repeated Clerk sessions", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const authenticatedT = t.withIdentity({
    subject: "user_repeat",
    tokenIdentifier: "https://clerk.example|user_repeat",
    email: "repeat@example.com",
    name: "Repeat User",
  });

  const firstId = await authenticatedT.mutation(api.core.users.store, {});
  const secondId = await authenticatedT.mutation(api.core.users.store, {});

  expect(secondId).toBe(firstId);
  await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_repeat"))
      .collect();
    expect(users).toHaveLength(1);
  });
});

test("store rejects callers without a Clerk identity", async () => {
  const t = convexTest(schema, convexFunctionModules);

  await expect(t.mutation(api.core.users.store, {})).rejects.toThrow(
    "Called storeUser without authentication present",
  );
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

test("getCurrentUser exposes the caller's organization role for scheduler capability gates", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const { userId, organizationId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "manager@example.com",
      clerkId: "manager",
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Role-aware workspace",
      planTier: "team",
      billingStatus: "active",
    });
    await ctx.db.insert("organization_members", {
      userId,
      organizationId,
      role: "manager",
    });
    return { userId, organizationId };
  });

  const currentUser = await t
    .withIdentity({ subject: "manager", email: "manager@example.com" })
    .query(api.core.users.getCurrentUser, { organizationId });

  expect(currentUser?._id).toBe(userId);
  expect(currentUser?.organizationRole).toBe("manager");
});

test("getCurrentUser resolves organization role from a matching legacy user row", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const { canonicalUserId, organizationId } = await t.run(async (ctx) => {
    const legacyUserId = await ctx.db.insert("users", {
      email: "duplicate-manager@example.com",
    });
    const canonicalUserId = await ctx.db.insert("users", {
      clerkId: "duplicate-manager",
      tokenIdentifier: "https://clerk.example|duplicate-manager",
      email: "duplicate-manager@example.com",
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Legacy membership workspace",
      planTier: "team",
      billingStatus: "active",
    });
    await ctx.db.insert("organization_members", {
      userId: legacyUserId,
      organizationId,
      role: "manager",
    });
    await ctx.db.insert("userAiUsage", {
      userId: legacyUserId,
      organizationId,
      count: 3,
      cycleStart: Date.now(),
    });
    return { canonicalUserId, organizationId };
  });

  const currentUser = await t
    .withIdentity({
      subject: "duplicate-manager",
      tokenIdentifier: "https://clerk.example|duplicate-manager",
      email: "duplicate-manager@example.com",
    })
    .query(api.core.users.getCurrentUser, { organizationId });

  expect(currentUser?._id).toBe(canonicalUserId);
  expect(currentUser?.organizationRole).toBe("manager");
  expect(currentUser?.aiUsage.count).toBe(3);
});
