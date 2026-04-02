import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getEffectivePlanForUser } from "../auth";
import { findCanonicalUser } from "../lib/users";
import { normalizeClerkApiRole, upsertClerkLinkedOrganization } from "../lib/clerkOrgSync";

const getActiveClerkOrganization = (identity: Record<string, unknown>) => {
  const orgClaim = identity.o;
  const nestedOrg =
    orgClaim && typeof orgClaim === "object" && !Array.isArray(orgClaim)
      ? (orgClaim as Record<string, unknown>)
      : null;

  const organizationId =
    typeof identity.org_id === "string"
      ? identity.org_id
      : typeof nestedOrg?.id === "string"
        ? nestedOrg.id
        : typeof identity.organization_id === "string"
          ? identity.organization_id
          : typeof identity.organizationId === "string"
            ? identity.organizationId
            : null;

  const roleValue =
    typeof identity.org_role === "string"
      ? identity.org_role
      : typeof nestedOrg?.rol === "string"
        ? nestedOrg.rol
        : typeof identity.orgRole === "string"
          ? identity.orgRole
          : null;

  return {
    clerkOrganizationId: organizationId,
    role: normalizeClerkApiRole(roleValue),
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
    const aiLimit =
      effectivePlan.planTier === "team"
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
    name: v.optional(v.string()),
  },
  returns: v.union(v.id("organizations"), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      throw new Error("Not authenticated");
    }

    const activeOrganization = getActiveClerkOrganization(identity as Record<string, unknown>);
    if (!activeOrganization.clerkOrganizationId) {
      return null;
    }
    const clerkOrganizationId = activeOrganization.clerkOrganizationId;
    const organizationRole =
      activeOrganization.role ?? "member";
    const name = args.name ?? "Team";

    return await upsertClerkLinkedOrganization(ctx, {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      displayName: identity.name,
      pictureUrl: identity.pictureUrl,
      clerkOrganizationId,
      organizationName: name,
      organizationRole,
    });
  },
});
