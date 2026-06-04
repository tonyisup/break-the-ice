import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const makeAdmin = mutation({
	args: {
		email: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.patch(user._id, { isAdmin: true });
		return null;
	},
});

export const updateUser = mutation({
	args: {
		userId: v.id("users"),
		aiUsageCount: v.optional(v.number()),
		newsletterSubscriptionStatus: v.optional(
			v.union(v.literal("subscribed"), v.literal("unsubscribed"))
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { userId, aiUsageCount, newsletterSubscriptionStatus } = args;

		const user = await ctx.db.get(userId);
		if (!user) throw new Error("User not found");

		const updates: {
			aiUsage?: { count: number; cycleStart: number };
			newsletterSubscriptionStatus?: "subscribed" | "unsubscribed";
		} = {};

		if (aiUsageCount !== undefined) {
			if (aiUsageCount < 0) throw new Error("AI usage count cannot be negative");
			if (!Number.isInteger(aiUsageCount)) throw new Error("AI usage count must be an integer");
			const cycleStart = user.aiUsage?.cycleStart ?? Date.now();
			updates.aiUsage = {
				cycleStart,
				count: aiUsageCount,
			};

			const personalUsage = await ctx.db
				.query("userAiUsage")
				.withIndex("by_userId_organizationId", (q) =>
					q.eq("userId", userId).eq("organizationId", undefined),
				)
				.unique();

			if (personalUsage) {
				await ctx.db.patch(personalUsage._id, {
					count: aiUsageCount,
					cycleStart,
				});
			} else {
				await ctx.db.insert("userAiUsage", {
					userId,
					organizationId: undefined,
					count: aiUsageCount,
					cycleStart,
				});
			}
		}

		if (newsletterSubscriptionStatus !== undefined) {
			updates.newsletterSubscriptionStatus = newsletterSubscriptionStatus;
		}

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(userId, updates);
		}
		return null;
	},
});

export const getUsers = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		return await ctx.db
			.query("users")
			.order("desc")
			.collect();
	},
});

export const getUser = query({
	args: { userId: v.id("users") },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		return await ctx.db.get(args.userId);
	},
});

export const getUserStyles = query({
	args: { userId: v.id("users") },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const userStyles = await ctx.db
			.query("userStyles")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		// Join with styles table
		const results = await Promise.all(
			userStyles.map(async (us) => {
				const style = await ctx.db.get(us.styleId);
				return { ...us, style };
			})
		);
		return results;
	},
});

export const getUserTones = query({
	args: { userId: v.id("users") },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const userTones = await ctx.db
			.query("userTones")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		// Join with tones table
		const results = await Promise.all(
			userTones.map(async (ut) => {
				const tone = await ctx.db.get(ut.toneId);
				return { ...ut, tone };
			})
		);
		return results;
	},
});

export const getUserQuestions = query({
	args: { userId: v.id("users"), limit: v.optional(v.number()) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const userQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.order("desc") // Most recent first
			.take(args.limit ?? 100);

		// Join with questions table
		const results = await Promise.all(
			userQuestions.map(async (uq) => {
				const question = await ctx.db.get(uq.questionId);
				return { ...uq, question };
			})
		);
		return results;
	},
});
