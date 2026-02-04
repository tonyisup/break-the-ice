import { v } from "convex/values";
import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { calculateAverageEmbedding } from "./questions";

export const getUser = internalQuery({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.query("users").withIndex("by_id", (q) => q.eq("_id", args.userId)).unique();
	},
});

export const getUserLikedQuestions = internalQuery({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", args.userId).eq("status", "liked"))
			.collect();
	},
});

export const updateUserPreferenceEmbedding = internalMutation({
	args: {
		userId: v.id("users"),
		questionPreferenceEmbedding: v.array(v.number()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.userId, { questionPreferenceEmbedding: args.questionPreferenceEmbedding });
	},
});

export const updateUserPreferenceEmbeddingAction = internalAction({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const user = await ctx.runQuery(internal.userInternal.getUser, {
			userId: args.userId,
		});

		if (!user) {
			throw new Error("User not found");
		}

		const userQuestions = await ctx.runQuery(internal.userInternal.getUserLikedQuestions, {
			userId: args.userId,
		});

		const userQuestionEmbeddings = await Promise.all(userQuestions.map(async (uq: any) => {
			const embedding = await ctx.runQuery(internal.questions.getQuestionEmbedding, {
				questionId: uq.questionId,
			});
			if (!embedding) {
				return [];
			}
			return embedding;
		}));

		const averageEmbedding = calculateAverageEmbedding(userQuestionEmbeddings);

		await ctx.runMutation(internal.userInternal.updateUserPreferenceEmbedding, {
			userId: args.userId,
			questionPreferenceEmbedding: averageEmbedding,
		});

		return null;
	},
});

export const getUsersWithMissingEmbeddings = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("users").filter((q) => q.eq(q.field("questionPreferenceEmbedding"), undefined)).collect();
	},
});

export const updateUsersWithMissingEmbeddingsAction = internalAction({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.runQuery(internal.userInternal.getUsersWithMissingEmbeddings);
		for (const user of users) {
			await ctx.runAction(internal.userInternal.updateUserPreferenceEmbeddingAction, {
				userId: user._id,
			});
		}
	},
});

export const getRecentlySeenQuestions = internalQuery({
	args: {
		userId: v.id("users"),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const seen = await ctx.db.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", args.userId).eq("status", "seen")
			)
			.order("desc")
			.take(args.limit ?? 3);

		const seenQuestions = await Promise.all(
			seen.map(async (relation) => {
				const question = await ctx.db.query("questions")
					.withIndex("by_id", (q) => q.eq("_id", relation.questionId))
					.first();
				return question;
			})
		);
		return seenQuestions
			.filter((q) => q !== null)
			.map((q) => q.text!);
	},
});

export const getBlockedQuestions = internalQuery({
	args: {
		userId: v.id("users"),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const hidden = await ctx.db.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", args.userId).eq("status", "hidden")
			)
			.order("desc")
			.take(args.limit ?? 3);

		const hiddenQuestions = await Promise.all(
			hidden.map(async (relation) => {
				const question = await ctx.db.query("questions")
					.withIndex("by_id", (q) => q.eq("_id", relation.questionId))
					.first();
				return question;
			})
		);
		return hiddenQuestions
			.filter((q) => q !== null)
			.map((q) => q.text!);
	},
});

export const getNewsletterSubscribers = internalQuery({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		return await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", "subscribed")
			)
			.collect();
	},
});

export const getUserHiddenStyles = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", args.userId).eq("status", "hidden")
			)
			.collect();
	},
});

export const getUserHiddenTones = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", args.userId).eq("status", "hidden")
			)
			.collect();
	},
});

export const getHiddenPreferencesForUsers = internalQuery({
	args: {
		userIds: v.array(v.id("users")),
	},
	returns: v.object({
		hiddenStyles: v.array(v.object({
			userId: v.id("users"),
			styleId: v.id("styles"),
		})),
		hiddenTones: v.array(v.object({
			userId: v.id("users"),
			toneId: v.id("tones"),
		})),
	}),
	handler: async (ctx, args) => {
		if (args.userIds.length === 0) {
			return { hiddenStyles: [], hiddenTones: [] };
		}
		const userIdSet = new Set(args.userIds.map(id => id.toString()));

		const allHiddenStyles = await ctx.db
			.query("userStyles")
			.withIndex("by_status", (q) => q.eq("status", "hidden"))
			.collect();

		const allHiddenTones = await ctx.db
			.query("userTones")
			.withIndex("by_status", (q) => q.eq("status", "hidden"))
			.collect();

		const hiddenStyles = allHiddenStyles
			.filter(s => userIdSet.has(s.userId.toString()))
			.map(s => ({ userId: s.userId, styleId: s.styleId }));

		const hiddenTones = allHiddenTones
			.filter(t => userIdSet.has(t.userId.toString()))
			.map(t => ({ userId: t.userId, toneId: t.toneId }));

		return { hiddenStyles, hiddenTones };
	},
});
