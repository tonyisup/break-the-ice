import { MutationCtx, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getEffectivePlanForUser } from "../auth";
import { getAiUsageForWorkspace } from "../lib/aiUsageWorkspace";
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
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args): Promise<any> => {
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

		const organizationId = args.organizationId;
		const effectivePlan = await getEffectivePlanForUser(ctx, user._id, organizationId);
		const limit = effectivePlan.planTier === "team"
			? parseInt(process.env.MAX_TEAM_AIGEN ?? process.env.MAX_CASUAL_AIGEN ?? "100")
			: parseInt(process.env.MAX_FREE_AIGEN ?? "10");
		const aiUsage = await getAiUsageForWorkspace(ctx, user._id, organizationId);

		return {
			...user,
			planTier: effectivePlan.planTier,
			billingStatus: effectivePlan.billingStatus,
			activeOrganizationId: effectivePlan.organizationId,
			aiLimit: limit,
			aiUsage: { count: aiUsage.count, cycleStart: aiUsage.cycleStart },
			isAiLimitReached: aiUsage.count >= limit,
		};
	},
});

export const getUserInteractionStats = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
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

		const organizationId = args.organizationId;

		const firstLike = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "liked"),
			)
			.first();

		const seenQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("organizationId", organizationId),
			)
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
