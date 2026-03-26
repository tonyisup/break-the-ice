import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getEffectivePlanForUser } from "../auth";

export const getEffectiveEntitlements = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      return null;
    }

    const effectivePlan = await getEffectivePlanForUser(ctx, user._id, args.organizationId);
    const aiLimit = effectivePlan.planTier === "team"
      ? parseInt(process.env.MAX_TEAM_AIGEN ?? process.env.MAX_CASUAL_AIGEN ?? "100")
      : parseInt(process.env.MAX_FREE_AIGEN ?? "10");

    return {
      userId: user._id,
      planTier: effectivePlan.planTier,
      billingStatus: effectivePlan.billingStatus,
      organizationId: effectivePlan.organizationId,
      aiLimit,
      canUseTeamFeatures: effectivePlan.planTier === "team",
    };
  },
});

// TODO: This mutation accepts clerkOrganizationId, name, and role from the client
// without server-side verification against Clerk. Consider converting to internalMutation
// invoked only from a webhook, or call Clerk's server-side API to verify membership and role.
export const syncOrganizationFromClerk = mutation({
  args: {
    clerkOrganizationId: v.string(),
    name: v.string(),
    role: v.optional(v.string()),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      throw new Error("Not authenticated");
    }

    let user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        email: identity.email,
        name: identity.name ?? identity.email,
        image: identity.pictureUrl,
        billingStatus: "inactive",
        aiUsage: { count: 0, cycleStart: Date.now() },
      });
      user = await ctx.db.get(userId);
    } else if (user.tokenIdentifier !== identity.tokenIdentifier) {
      await ctx.db.patch(user._id, { tokenIdentifier: identity.tokenIdentifier });
      user = await ctx.db.get(user._id);
    }

    if (!user) {
      throw new Error("Failed to sync current user");
    }

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", args.clerkOrganizationId))
      .unique();

    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        name: args.name,
        clerkOrganizationId: args.clerkOrganizationId,
        planTier: "free",
        billingStatus: "inactive",
      });
      organization = await ctx.db.get(organizationId);
    } else if (organization.name !== args.name) {
      await ctx.db.patch(organization._id, { name: args.name });
      organization = await ctx.db.get(organization._id);
    }

    if (!organization) {
      throw new Error("Failed to sync organization");
    }

    const existingMembership = await ctx.db
      .query("organization_members")
      .withIndex("by_userId_organizationId", (q) =>
        q.eq("userId", user._id).eq("organizationId", organization._id)
      )
      .unique();

    const normalizedRole =
      args.role === "org:admin" || args.role === "admin"
        ? "admin"
        : args.role === "org:member" || args.role === "member"
          ? "member"
          : "member";

    if (args.role && !["org:admin", "admin", "org:member", "member"].includes(args.role)) {
      console.warn(`Unexpected Clerk organization role "${args.role}", defaulting to member.`);
    }

    if (!existingMembership) {
      await ctx.db.insert("organization_members", {
        userId: user._id,
        organizationId: organization._id,
        role: normalizedRole,
      });
    } else if (existingMembership.role !== normalizedRole) {
      await ctx.db.patch(existingMembership._id, { role: normalizedRole });
    }

    return organization._id;
  },
});