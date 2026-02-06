import { Doc } from "../_generated/dataModel";
import { MutationCtx, mutation, query } from "../_generated/server";
import { v } from "convex/values";

// Helper to ensure user exists
export async function getUserOrCreate(ctx: MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Not authenticated");
	}

	const user = await ctx.db
		.query("users")
		.withIndex("email", (q) => q.eq("email", identity.email))
		.unique();

	if (user) {
		return user;
	}

	const userId = await ctx.db.insert("users", {
		name: identity.name!,
		email: identity.email,
		image: identity.pictureUrl,
	});

	return (await ctx.db.get(userId))!;
}

export const getCurrentUser = query({
	args: {},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx): Promise<Doc<"users"> | null> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		return user;
	},
});

export const getUserInteractionStats = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { totalSeen: 0, totalLikes: 0, dismissedRefineCTA: false };
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return { totalSeen: 0, totalLikes: 0, dismissedRefineCTA: false };
		}

		// Check if user has any likes
		const firstLike = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.first();

		// Count seen questions (up to 50 for efficiency)
		// We count anything that is not "unseen" (so seen, liked, hidden)
		const seenQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.filter((q) => q.neq(q.field("status"), "unseen"))
			.take(50);

		return {
			totalSeen: seenQuestions.length,
			totalLikes: firstLike ? 1 : 0,
			dismissedRefineCTA: !!user.dismissedRefineCTA,
		};
	},
});

export const dismissRefineCTA = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getUserOrCreate(ctx);
		await ctx.db.patch(user._id, {
			dismissedRefineCTA: true,
		});
	},
});

export const store = mutation({
	args: {},
	returns: v.id("users"),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called storeUser without authentication present");
		}

		// Check if we've already stored this identity before.
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (user !== null) {
			// If we've seen this identity before but the name has changed, patch the value.
			if (user.name !== identity.name) {
				await ctx.db.patch(user._id, { name: identity.name });
			}
			return user._id;
		}

		// If it's a new identity, create a new user.
		return await ctx.db.insert("users", {
			name: identity.name!,
			email: identity.email,
			image: identity.pictureUrl,
		});
	},
});
