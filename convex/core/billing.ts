import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getEffectivePlanForUser } from "../auth";
import { findCanonicalUser, getOrCreateCanonicalUser } from "../lib/users";

type OrganizationRole = "admin" | "manager" | "member";

const normalizeClerkRole = (role?: string | null): OrganizationRole | null =>
  role === "org:admin" || role === "admin"
    ? "admin"
    : role === "org:manager" || role === "manager"
      ? "manager"
      : role === "org:member" || role === "member"
        ? "member"
        : null;

const getActiveClerkOrganization = (identity: Record<string, unknown>) => {
  const orgClaim = identity.o;
  const nestedOrg = orgClaim && typeof orgClaim === "object" && !Array.isArray(orgClaim)
    ? orgClaim as Record<string, unknown>
    : null;

  const organizationId = typeof identity.org_id === "string"
    ? identity.org_id
    : typeof nestedOrg?.id === "string"
      ? nestedOrg.id
      : null;

  const roleValue = typeof identity.org_role === "string"
    ? identity.org_role
    : typeof nestedOrg?.rol === "string"
      ? nestedOrg.rol
      : null;

  return {
    clerkOrganizationId: organizationId,
    role: normalizeClerkRole(roleValue),
  };
};

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

    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });

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

export const syncOrganizationFromClerk = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      throw new Error("Not authenticated");
    }

    const activeOrganization = getActiveClerkOrganization(identity as Record<string, unknown>);
    if (!activeOrganization.clerkOrganizationId || !activeOrganization.role) {
      throw new Error("No active Clerk organization found for this user");
    }
    const clerkOrganizationId = activeOrganization.clerkOrganizationId;
    const organizationRole = activeOrganization.role;

    const user = await getOrCreateCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      name: identity.name ?? identity.email,
      image: identity.pictureUrl,
    });

    if (!user) {
      throw new Error("Failed to sync current user");
    }

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", clerkOrganizationId))
      .unique();

    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        name: args.name,
        clerkOrganizationId,
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

    if (!existingMembership) {
      await ctx.db.insert("organization_members", {
        userId: user._id,
        organizationId: organization._id,
        role: organizationRole,
      });
    } else if (existingMembership.role !== organizationRole) {
      await ctx.db.patch(existingMembership._id, { role: organizationRole });
    }

    return organization._id;
  },
});
