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
