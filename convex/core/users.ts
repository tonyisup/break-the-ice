import { getAiPlanLimit } from "../lib/aiPlanLimits";
import { MutationCtx, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getAiUsage } from "../lib/aiUsage";
import { ignoredWorkspaceArg } from "../lib/ignoredWorkspaceArg";
import { findCanonicalUser, getOrCreateCanonicalUser } from "../lib/users";

// Helper to ensure user exists
export async function getUserOrCreate(ctx: MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Not authenticated");
	}

	return await getOrCreateCanonicalUser(ctx, {
		clerkId: identity.subject,
		tokenIdentifier: identity.tokenIdentifier,
		email: identity.email,
		name: identity.name,
		image: identity.pictureUrl,
	});
}

export const getCurrentUser = query({
	args: { ...ignoredWorkspaceArg },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx): Promise<any> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
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

		const limit = getAiPlanLimit();
		const aiUsage = await getAiUsage(ctx, user._id);

		return {
			...user,
			planTier: "free" as const,
			billingStatus: user.billingStatus ?? "inactive",
			aiLimit: limit,
			aiUsage: { count: aiUsage.count, cycleStart: aiUsage.cycleStart },
			isAiLimitReached: aiUsage.count >= limit,
		};
	},
});

export const getUserInteractionStats = query({
	args: { ...ignoredWorkspaceArg },
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { totalSeen: 0, totalLikes: 0, dismissedRefineCTA: false };
		}

		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

		if (!user) {
			return { totalSeen: 0, totalLikes: 0, dismissedRefineCTA: false };
		}

		const firstLike = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", user._id).eq("status", "liked"))
			.first();

		const seenQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", user._id))
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
		const user = await getOrCreateCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
			name: identity.name,
			image: identity.pictureUrl,
		});

		return user._id;
	},
});
