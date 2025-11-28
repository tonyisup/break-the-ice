import { QueryCtx } from "./_generated/server";

/**
 * Helper function to ensure the current user is an admin.
 * Works with Clerk authentication via ConvexProviderWithClerk.
 */
export const ensureAdmin = async (ctx: QueryCtx | { auth: any; db: any }) => {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Not authenticated");
	}
	if (!identity.metadata.isAdmin || identity.metadata.isAdmin !== "true") {
		throw new Error("Not an admin");
	}
	return identity;
}

export const ensureOrgMember = async (
  ctx: QueryCtx | { auth: any; db: any },
  organizationId: any,
  requiredRole?: "admin" | "manager" | "member" | ("admin" | "manager" | "member")[]
) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const membership = await ctx.db
    .query("organization_members")
    .withIndex("by_userId_organizationId", (q: any) =>
      q.eq("userId", identity.subject).eq("organizationId", organizationId)
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
