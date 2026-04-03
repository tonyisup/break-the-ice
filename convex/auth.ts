import { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { collectUserCandidates, userScore } from "./lib/users";

export type BillingStatus =
  | "inactive"
  | "active"
  | "past_due"
  | "canceled"
  | "trialing";

export type EffectivePlanTier = "free" | "team";

const ACTIVE_BILLING_STATUSES = new Set<BillingStatus>(["active", "trialing"]);

/**
 * Helper function to ensure the current user is an admin.
 * Works with Clerk authentication via ConvexProviderWithClerk.
 */
export const ensureAdmin = async (ctx: QueryCtx | MutationCtx | ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  if ((identity.metadata as any)?.isAdmin !== "true") {
    throw new Error("Not an admin");
  }
  return identity;
}

export const ensureOrgMember = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  requiredRole?: "admin" | "manager" | "member" | ("admin" | "manager" | "member")[]
) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const { candidates, normalizedEmail } = await collectUserCandidates(ctx, {
    clerkId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    email: identity.email,
  });

  if (candidates.length === 0) {
    throw new Error("User not found");
  }

  const scoredLookup = {
    tokenIdentifier: identity.tokenIdentifier ?? "",
    clerkId: identity.subject ?? "",
    email: normalizedEmail ?? "",
  };

  const sorted = candidates
    .slice()
    .sort(
      (left, right) =>
        userScore(right, scoredLookup) - userScore(left, scoredLookup) ||
        left._creationTime - right._creationTime,
    );

  let foundAllowed = false;
  let firstMembership = null;

  for (const user of sorted) {
    const membership = await ctx.db
      .query("organization_members")
      .withIndex("by_userId_organizationId", (q) =>
        q.eq("userId", user._id).eq("organizationId", organizationId),
      )
      .unique();

    if (!membership) {
      continue;
    }

    if (!firstMembership) {
      firstMembership = membership;
    }

    if (requiredRole) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      if (roles.includes(membership.role)) {
        foundAllowed = true;
        return membership;
      }
    } else {
      return membership;
    }
  }

  if (firstMembership && requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    throw new Error(
      `User does not have the required role. Required: ${roles.join(
        ", ",
      )}, but user has ${firstMembership.role}`,
    );
  }

  throw new Error("Not a member of this organization");
};

export const isBillingActiveStatus = (status?: BillingStatus | null) =>
  !!status && ACTIVE_BILLING_STATUSES.has(status);

export const isOrganizationPaid = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) => {
  const organization = await ctx.db.get(organizationId);
  if (!organization) {
    return false;
  }

  return organization.planTier === "team" && isBillingActiveStatus(organization.billingStatus);
};

export const ensurePaidOrganizationMember = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  requiredRole?: "admin" | "manager" | "member" | ("admin" | "manager" | "member")[]
) => {
  const membership = await ensureOrgMember(ctx, organizationId, requiredRole);
  const isPaid = await isOrganizationPaid(ctx, organizationId);

  if (!isPaid) {
    throw new Error("This feature requires an active Team workspace.");
  }

  return membership;
};

export const getEffectivePlanForUser = async (
  ctx: QueryCtx | MutationCtx,
  userIds: Id<"users"> | Id<"users">[],
  organizationId?: Id<"organizations">
): Promise<{
  planTier: EffectivePlanTier;
  billingStatus: BillingStatus;
  organizationId: Id<"organizations"> | null;
}> => {
  const candidateIds = Array.isArray(userIds) ? userIds : [userIds];

  if (organizationId) {
    // Verify membership before checking billing - check all candidate IDs
    for (const userId of candidateIds) {
      const membership = await ctx.db
        .query("organization_members")
        .withIndex("by_userId_organizationId", (q) =>
          q.eq("userId", userId).eq("organizationId", organizationId)
        )
        .unique();

      if (membership) {
        const isPaid = await isOrganizationPaid(ctx, organizationId);
        const organization = await ctx.db.get(organizationId);

        return {
          planTier: isPaid ? "team" : "free",
          billingStatus: organization?.billingStatus ?? "inactive",
          organizationId,
        };
      }
    }

    // No candidate is a member
    return {
      planTier: "free",
      billingStatus: "inactive",
      organizationId: null,
    };
  }

  // Check all candidate user IDs for paid memberships
  const allMemberships = [];
  for (const userId of candidateIds) {
    const memberships = await ctx.db
      .query("organization_members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    allMemberships.push(...memberships);
  }

  const membershipsByMostRecentJoin = allMemberships
    .slice()
    .sort((a, b) => b._creationTime - a._creationTime);

  for (const membership of membershipsByMostRecentJoin) {
    const organization = await ctx.db.get(membership.organizationId);
    if (organization?.planTier === "team" && isBillingActiveStatus(organization.billingStatus)) {
      return {
        planTier: "team",
        billingStatus: organization.billingStatus ?? "inactive",
        organizationId: organization._id,
      };
    }
  }

  return {
    planTier: "free",
    billingStatus: "inactive",
    organizationId: null,
  };
};