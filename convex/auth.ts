import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Anonymous],
  callbacks: {
    async session({ session, user }) {
      const userFromDb = await getUser(session.ctx, { userId: user.userId });
      session.user = {
        ...user,
        ...userFromDb,
      };
      return session;
    },
    async onSignIn({ ctx, user }) {
      await getOrCreateUser(ctx, { userId: user.userId });
    },
    async onSignUp({ ctx, user }) {
      await getOrCreateUser(ctx, { userId: user.userId });
    },
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const loggedInUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return userId;
  },
});

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
