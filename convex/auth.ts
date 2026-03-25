import { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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

  const user = await ctx.db
    .query("users")
    .withIndex("email", (q: any) => q.eq("email", identity.email))
    .unique();

  if (!user) {
    throw new Error("User not found");
  }

  const membership = await ctx.db
    .query("organization_members")
    .withIndex("by_userId_organizationId", (q: any) =>
      q.eq("userId", user._id).eq("organizationId", organizationId)
    )
    .unique();

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(membership.role)) {
      throw new Error(
        `User does not have the required role. Required: ${roles.join(
          ", "
        )}, but user has ${membership.role}`
      );
    }
  }

  return membership;
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
  userId: Id<"users">,
  organizationId?: Id<"organizations">
): Promise<{
  planTier: EffectivePlanTier;
  billingStatus: BillingStatus;
  organizationId: Id<"organizations"> | null;
}> => {
  if (organizationId) {
    const isPaid = await isOrganizationPaid(ctx, organizationId);
    const organization = await ctx.db.get(organizationId);

    return {
      planTier: isPaid ? "team" : "free",
      billingStatus: organization?.billingStatus ?? "inactive",
      organizationId,
    };
  }

  const memberships = await ctx.db
    .query("organization_members")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  for (const membership of memberships) {
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
