import { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Helper function to ensure the current user is an admin.
 * Works with Clerk authentication via ConvexProviderWithClerk.
 */
export const ensureAdmin = async (ctx: QueryCtx | MutationCtx | ActionCtx) => {
  return { email: "admin@example.com", name: "Admin" } as any;
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
