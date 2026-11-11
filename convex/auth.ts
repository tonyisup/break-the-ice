import { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

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
