import { v } from "convex/values";
import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Helper function for average embedding calculation
export function calculateAverageEmbedding(embeddings: number[][]): number[] {
	if (embeddings.length === 0) {
		return [];
	}
	const sum = embeddings.reduce((acc, embedding) => {
		return acc.map((val, i) => val + (embedding[i] || 0));
	}, new Array(embeddings[0]?.length || 0).fill(0));
	return sum.map((val) => val / embeddings.length);
}

export const userValidator = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	email: v.optional(v.string()),
	emailVerificationTime: v.optional(v.number()),
	image: v.optional(v.string()),
	name: v.optional(v.string()),
	phone: v.optional(v.string()),
	phoneVerificationTime: v.optional(v.number()),
	isAdmin: v.optional(v.boolean()),
	questionPreferenceEmbedding: v.optional(v.array(v.number())),
	defaultStyle: v.optional(v.string()),
	defaultTone: v.optional(v.string()),
	subscriptionTier: v.optional(v.union(v.literal("free"), v.literal("casual"))),
	aiUsage: v.optional(v.object({
		count: v.number(),
		cycleStart: v.number(),
	})),
	newsletterSubscriptionStatus: v.optional(v.union(v.literal("subscribed"), v.literal("unsubscribed"))),
});

export const getUserById = internalQuery({
	args: { id: v.id("users") },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getUserByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();
	},
});

export const updateUserFromClerk = internalMutation({
	args: {
		clerkId: v.string(),
		email: v.optional(v.string()),
		name: v.string(),
		image: v.optional(v.string()),
		subscriptionTier: v.union(v.literal("free"), v.literal("casual")),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (user) {
			await ctx.db.patch(user._id, {
				name: args.name,
				image: args.image,
				subscriptionTier: args.subscriptionTier,
			});
		} else if (args.email) {
			await ctx.db.insert("users", {
				name: args.name,
				email: args.email,
				image: args.image,
				subscriptionTier: args.subscriptionTier,
				aiUsage: { count: 0, cycleStart: Date.now() },
			});
		}
	},
});

export const setNewsletterStatus = internalMutation({
	args: {
		email: v.string(),
		status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (user) {
			await ctx.db.patch(user._id, {
				newsletterSubscriptionStatus: args.status,
			});
		}
	},
});

export const checkAndIncrementAIUsage = internalMutation({
	args: {
		userId: v.id("users"),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error("User not found");

		const now = Date.now();
		const cycleLength = 30 * 24 * 60 * 60 * 1000; // 30 days
		let aiUsage = user.aiUsage || { count: 0, cycleStart: now };

		// Reset cycle if needed
		if (now - aiUsage.cycleStart > cycleLength) {
			aiUsage = { count: 0, cycleStart: now };
		}
		const limit = user.subscriptionTier === "casual" ? parseInt(process.env.MAX_CASUAL_AIGEN ?? "100") : parseInt(process.env.MAX_FREE_AIGEN ?? "10");

		const remaining = limit - aiUsage.count;
		if (remaining <= 0) {
			throw new Error(`AI generation limit reached. You have used ${aiUsage.count}/${limit} generations this cycle.`);
		}

		const actualCount = Math.min(1, remaining);

		await ctx.db.patch(user._id, {
			aiUsage: {
				count: aiUsage.count + actualCount,
				cycleStart: aiUsage.cycleStart,
			},
		});

		return actualCount;
	},
});

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
		const liked = await ctx.db.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", args.userId).eq("status", "liked"))
			.collect();

		if (liked.length > 0) {
			return liked;
		}

		const seenAndLingered = await ctx.db.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", args.userId).eq("status", "seen").gt("updatedAt", Date.now() - 30 * 24 * 60 * 60 * 1000))
			.collect();

		return seenAndLingered;
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
		const user = await ctx.runQuery(internal.internal.users.getUser, {
			userId: args.userId,
		});

		if (!user) {
			throw new Error("User not found");
		}

		const userQuestions = await ctx.runQuery(internal.internal.users.getUserLikedQuestions, {
			userId: args.userId,
		});

		const userQuestionEmbeddings = await Promise.all(userQuestions.map(async (uq: any) => {
			const embedding = await ctx.runQuery(internal.internal.questions.getQuestionEmbedding, {
				questionId: uq.questionId,
			});
			if (!embedding) {
				return [];
			}
			return embedding;
		}));

		const averageEmbedding = calculateAverageEmbedding(userQuestionEmbeddings);

		await ctx.runMutation(internal.internal.users.updateUserPreferenceEmbedding, {
			userId: args.userId,
			questionPreferenceEmbedding: averageEmbedding,
		});

		return null;
	},
});

export const getUsersWithMissingEmbeddings = internalQuery({
	args: {},
	returns: v.array(userValidator),
	handler: async (ctx) => {
		return await ctx.db
			.query("users")
			.filter((q) =>
				q.or(
					q.eq(q.field("questionPreferenceEmbedding"), undefined),
					q.eq(q.field("questionPreferenceEmbedding"), [])
				)
			)
			.collect();
	},
});

export const updateUsersWithMissingEmbeddingsAction = internalAction({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.runQuery(internal.internal.users.getUsersWithMissingEmbeddings);
		for (const user of users) {
			await ctx.runAction(internal.internal.users.updateUserPreferenceEmbeddingAction, {
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

export const getUserVisibleStyles = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const hidden = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", args.userId).eq("status", "hidden")
			)
			.collect();
		const visible = await ctx.db
			.query("styles")
			.collect();
		return visible.filter(s => !hidden.some(h => h.styleId === s._id));
	},
});

export const getUserVisibleTones = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const hidden = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", args.userId).eq("status", "hidden")
			)
			.collect();
		const visible = await ctx.db
			.query("tones")
			.collect();
		return visible.filter(t => !hidden.some(h => h.toneId === t._id));
	},
});