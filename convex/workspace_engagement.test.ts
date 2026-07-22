/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test("engagement settings are scoped per workspace", async () => {
	vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const { userId, orgId, questionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "workspace@test.com",
      tokenIdentifier: "workspace|test",
    });
    const orgId = await ctx.db.insert("organizations", { name: "Team" });
    await ctx.db.insert("organization_members", {
      userId,
      organizationId: orgId,
      role: "admin",
    });
    const questionId = await ctx.db.insert("questions", {
      text: "Scoped?",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    return { userId, orgId, questionId };
  });

  const identity = {
    tokenIdentifier: "workspace|test",
    email: "workspace@test.com",
  };

  await t.withIdentity(identity).mutation(api.core.userSettings.updateLikedQuestions, {
    likedQuestions: [questionId],
    organizationId: orgId,
  });

  const personalSettings = await t
    .withIdentity(identity)
    .query(api.core.userSettings.getSettings, {});
  const orgSettings = await t
    .withIdentity(identity)
    .query(api.core.userSettings.getSettings, { organizationId: orgId });

  expect(personalSettings?.likedQuestions ?? []).toHaveLength(0);
  expect(orgSettings?.likedQuestions).toEqual([questionId]);
});

test("AI usage is tracked separately for personal and org workspaces", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "ai@test.com",
      tokenIdentifier: "ai|test",
      aiUsage: { count: 3, cycleStart: Date.now() },
    });
  });

  const orgId = await t.run(async (ctx) => {
    return await ctx.db.insert("organizations", {
      name: "AI Org",
      planTier: "team",
      billingStatus: "active",
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("organization_members", {
      userId,
      organizationId: orgId,
      role: "member",
    });
  });

  await t.run(async (ctx) => {
    const { checkAndIncrementAiUsageForWorkspace } = await import("./lib/aiUsageWorkspace");
    await checkAndIncrementAiUsageForWorkspace(ctx, userId, undefined);
    await checkAndIncrementAiUsageForWorkspace(ctx, userId, orgId);
  });

  const personal = await t.run(async (ctx) => {
    const { getAiUsageForWorkspace } = await import("./lib/aiUsageWorkspace");
    return await getAiUsageForWorkspace(ctx, userId, undefined);
  });
  const org = await t.run(async (ctx) => {
    const { getAiUsageForWorkspace } = await import("./lib/aiUsageWorkspace");
    return await getAiUsageForWorkspace(ctx, userId, orgId);
  });

  expect(personal.count).toBe(4);
  expect(org.count).toBe(1);
});

test("acceptInvitation allows membership in a second organization", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));

  const { userId, orgA, orgB, inviteB } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "multi@test.com",
      tokenIdentifier: "multi|test",
    });
    const orgA = await ctx.db.insert("organizations", { name: "Org A" });
    const orgB = await ctx.db.insert("organizations", {
      name: "Org B",
      planTier: "team",
      billingStatus: "active",
    });
    await ctx.db.insert("organization_members", {
      userId,
      organizationId: orgA,
      role: "member",
    });
    const inviteB = await ctx.db.insert("invitations", {
      email: "multi@test.com",
      organizationId: orgB,
      role: "member",
    });
    return { userId, orgA, orgB, inviteB };
  });

  await t.withIdentity({ email: "multi@test.com", tokenIdentifier: "multi|test" }).mutation(
    api.core.organizations.acceptInvitation,
    { invitationId: inviteB },
  );

  const memberships = await t.run(async (ctx) => {
    return await ctx.db
      .query("organization_members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  });

  expect(memberships).toHaveLength(2);
  expect(new Set(memberships.map((m) => m.organizationId))).toEqual(
    new Set([orgA, orgB]),
  );
});
