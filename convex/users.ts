import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateAverageEmbedding } from "./questions";

// Helper to ensure user exists
async function getUserOrCreate(ctx: MutationCtx) {
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

export const getSettings = query({
	args: {},
	returns: v.union(
		v.null(),
		v.object({
			likedQuestions: v.optional(v.array(v.id("questions"))),
			hiddenQuestions: v.optional(v.array(v.id("questions"))),
			hiddenStyles: v.optional(v.array(v.string())),
			hiddenTones: v.optional(v.array(v.string())),
			defaultStyle: v.optional(v.string()),
			defaultTone: v.optional(v.string()),
		})
	),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return null;
		}

		// Get liked questions from userQuestions table
		const likedUserQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();
		const likedQuestions = likedUserQuestions.map((uq) => uq.questionId);

		// Get hidden questions from userQuestions table
		const hiddenUserQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		const hiddenQuestions = hiddenUserQuestions.map((uq) => uq.questionId);

		// Get hidden styles from userStyles table
		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		const hiddenStyles = hiddenStylesDocs.map((us) => us.styleId);

		// Get hidden tones from userTones table
		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		const hiddenTones = hiddenTonesDocs.map((ut) => ut.toneId);

		return {
			likedQuestions: likedQuestions.length > 0 ? likedQuestions : undefined,
			hiddenQuestions: hiddenQuestions.length > 0 ? hiddenQuestions : undefined,
			hiddenStyles: hiddenStyles.length > 0 ? hiddenStyles : undefined,
			hiddenTones: hiddenTones.length > 0 ? hiddenTones : undefined,
			defaultStyle: user.defaultStyle,
			defaultTone: user.defaultTone,
		};
	},
});

export const getQuestionHistory = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return [];
		}

		const limit = args.limit ?? 50;
		// Enforce free tier limit
		const effectiveLimit = user.subscriptionTier === "casual" ? limit : Math.min(limit, 100);

		const history = await ctx.db
			.query("analytics")
			.withIndex("by_userId_event_timestamp", (q) =>
				q.eq("userId", user._id).eq("event", "seen")
			)
			.order("desc")
			.take(effectiveLimit);

		const questions = await Promise.all(
			history.map(async (h) => {
				const question = await ctx.db.get(h.questionId);
				if (!question) return null;
				return {
					question,
					viewedAt: h.timestamp,
				};
			})
		);

		return questions.filter((q): q is NonNullable<typeof q> => q !== null);
	},
});

export const updateUserSettings = mutation({
	args: {
		defaultStyle: v.optional(v.string()),
		defaultTone: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		await ctx.db.patch(user._id, {
			defaultStyle: args.defaultStyle,
			defaultTone: args.defaultTone,
		});

		return null;
	},
});

export const updateLikedQuestions = mutation({
	args: {
		likedQuestions: v.array(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		// Enforce limits for Free tier
		if (user.subscriptionTier !== "casual" && args.likedQuestions.length > 100) {
			throw new Error("Free plan limit: You can only like up to 100 questions. Upgrade to Casual for unlimited.");
		}

		// 1. Handle removals: un-like questions that are no longer in the list
		const existingLikedQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();

		const newLikedSet = new Set(args.likedQuestions);
		for (const uq of existingLikedQuestions) {
			if (!newLikedSet.has(uq.questionId)) {
				await ctx.db.delete(uq._id);
			}
		}

		// 2. Handle additions/updates: ensure we don't create duplicates if question exists as "seen"
		const now = Date.now();
		await Promise.all(
			Array.from(newLikedSet).map(async (questionId) => {
				const existing = await ctx.db
					.query("userQuestions")
					.withIndex("by_userIdAndQuestionId", (q) =>
						q.eq("userId", user._id).eq("questionId", questionId)
					)
					.first();

				if (existing) {
					if (existing.status !== "liked") {
						await ctx.db.patch(existing._id, {
							status: "liked",
							updatedAt: now,
						});
					}
				} else {
					await ctx.db.insert("userQuestions", {
						userId: user._id,
						questionId,
						status: "liked",
						updatedAt: now,
						seenCount: 1,
					});
				}
			})
		);

		return null;
	},
});

export const updateHiddenQuestions = mutation({
	args: {
		hiddenQuestions: v.array(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		// Enforce limits for Free tier
		if (user.subscriptionTier !== "casual" && args.hiddenQuestions.length > 100) {
			throw new Error("Free plan limit: You can only hide up to 100 questions. Upgrade to Casual for unlimited.");
		}

		// 1. Handle removals: un-hide questions that are no longer in the list
		const existingHiddenQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const newHiddenSet = new Set(args.hiddenQuestions);
		for (const uq of existingHiddenQuestions) {
			if (!newHiddenSet.has(uq.questionId)) {
				await ctx.db.delete(uq._id);
			}
		}

		// 2. Handle additions/updates
		const now = Date.now();
		await Promise.all(
			Array.from(newHiddenSet).map(async (questionId) => {
				const existing = await ctx.db
					.query("userQuestions")
					.withIndex("by_userIdAndQuestionId", (q) =>
						q.eq("userId", user._id).eq("questionId", questionId)
					)
					.first();

				if (existing) {
					if (existing.status !== "hidden") {
						await ctx.db.patch(existing._id, {
							status: "hidden",
							updatedAt: now,
						});
					}
				} else {
					await ctx.db.insert("userQuestions", {
						userId: user._id,
						questionId,
						status: "hidden",
						updatedAt: now,
						seenCount: 1,
					});
				}
			})
		);

		await ctx.scheduler.runAfter(0, internal.users.updateUserPreferenceEmbeddingAction, {
			userId: user._id,
		});
		return null;
	},
});

export const updateHiddenStyles = mutation({
	args: {
		hiddenStyles: v.array(v.id("styles")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		// 1. Handle removals
		const existingHiddenStyles = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const newHiddenSet = new Set(args.hiddenStyles);
		for (const us of existingHiddenStyles) {
			if (!newHiddenSet.has(us.styleId)) {
				await ctx.db.delete(us._id);
			}
		}

		// 2. Handle additions/updates
		const now = Date.now();
		await Promise.all(
			Array.from(newHiddenSet).map(async (styleId) => {
				const existing = await ctx.db
					.query("userStyles")
					.withIndex("by_userIdAndStyleId", (q) =>
						q.eq("userId", user._id).eq("styleId", styleId)
					)
					.first();

				if (existing) {
					if (existing.status !== "hidden") {
						await ctx.db.patch(existing._id, {
							status: "hidden",
							updatedAt: now,
						});
					}
				} else {
					await ctx.db.insert("userStyles", {
						userId: user._id,
						styleId,
						status: "hidden",
						updatedAt: now,
					});
				}
			})
		);

		return null;
	},
});

export const updateHiddenTones = mutation({
	args: {
		hiddenTones: v.array(v.id("tones")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		// 1. Handle removals
		const existingHiddenTones = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const newHiddenSet = new Set(args.hiddenTones);
		for (const ut of existingHiddenTones) {
			if (!newHiddenSet.has(ut.toneId)) {
				await ctx.db.delete(ut._id);
			}
		}

		// 2. Handle additions/updates
		const now = Date.now();
		await Promise.all(
			Array.from(newHiddenSet).map(async (toneId) => {
				const existing = await ctx.db
					.query("userTones")
					.withIndex("by_userIdAndToneId", (q) =>
						q.eq("userId", user._id).eq("toneId", toneId)
					)
					.first();

				if (existing) {
					if (existing.status !== "hidden") {
						await ctx.db.patch(existing._id, {
							status: "hidden",
							updatedAt: now,
						});
					}
				} else {
					await ctx.db.insert("userTones", {
						userId: user._id,
						toneId,
						status: "hidden",
						updatedAt: now,
					});
				}
			})
		);

		return null;
	},
});

export const makeAdmin = mutation({
	args: {
		email: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}
		const tempUser = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!tempUser || !tempUser.isAdmin) {
			throw new Error("Not authorized to make admins");
		}

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

		const user = await ctx.runQuery(internal.users.getUser, {
			userId: args.userId,
		});

		if (!user) {
			throw new Error("User not found");
		}

		const userQuestions = await ctx.runQuery(internal.users.getUserLikedQuestions, {
			userId: args.userId,
		});

		const userQuestionEmbeddings = userQuestions.map(async (uq: any) => {
			const embedding = await ctx.runQuery(internal.questions.getQuestionEmbedding, {
				questionId: uq.questionId,
			});
			if (!embedding) {
				return [];
			}
			return embedding;
		});

		const averageEmbedding = calculateAverageEmbedding(await Promise.all(userQuestionEmbeddings));

		await ctx.runMutation(internal.users.updateUserPreferenceEmbedding, {
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
		const users = await ctx.runQuery(internal.users.getUsersWithMissingEmbeddings);
		for (const user of users) {
			await ctx.runAction(internal.users.updateUserPreferenceEmbeddingAction, {
				userId: user._id,
			});
		}
	},
});

export const mergeKnownLikedQuestions = mutation({
	args: {
		likedQuestions: v.array(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		const now = Date.now();
		const newLikedSet = new Set(args.likedQuestions);

		// Efficiently check existing relations for the input questions
		const existingRelations = await Promise.all(
			Array.from(newLikedSet).map(async (questionId) => {
				const relation = await ctx.db
					.query("userQuestions")
					.withIndex("by_userIdAndQuestionId", (q) =>
						q.eq("userId", user._id).eq("questionId", questionId)
					)
					.first();
				return { questionId, relation };
			})
		);

		for (const { questionId, relation } of existingRelations) {
			if (relation) {
				// If it exists but is not liked (e.g. seen), update it
				if (relation.status !== "liked") {
					await ctx.db.patch(relation._id, {
						status: "liked",
						updatedAt: now,
					});
				}
				// If already liked, do nothing
			} else {
				// If it doesn't exist, insert it
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					questionId,
					status: "liked",
					updatedAt: now,
					seenCount: 1,
				});
			}
		}

		return null;
	},
});

export const mergeKnownHiddenQuestions = mutation({
	args: {
		hiddenQuestions: v.array(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		const now = Date.now();
		const newHiddenSet = new Set(args.hiddenQuestions);

		const existingRelations = await Promise.all(
			Array.from(newHiddenSet).map(async (questionId) => {
				const relation = await ctx.db
					.query("userQuestions")
					.withIndex("by_userIdAndQuestionId", (q) =>
						q.eq("userId", user._id).eq("questionId", questionId)
					)
					.first();
				return { questionId, relation };
			})
		);

		for (const { questionId, relation } of existingRelations) {
			if (relation) {
				// If it exists but is not hidden (e.g. seen or liked), update it to hidden?
				// Usually explicit 'hidden' overrides others.
				if (relation.status !== "hidden") {
					await ctx.db.patch(relation._id, {
						status: "hidden",
						updatedAt: now,
					});
				}
			} else {
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					questionId,
					status: "hidden",
					updatedAt: now,
					seenCount: 1,
				});
			}
		}

		await ctx.scheduler.runAfter(0, internal.users.updateUserPreferenceEmbeddingAction, {
			userId: user._id,
		});
		return null;
	},
});

export const mergeQuestionHistory = mutation({
	args: {
		history: v.array(
			v.object({
				questionId: v.id("questions"),
				viewedAt: v.number(),
			})
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);

		// 1. Insert into analytics
		// avoiding duplicate analytics entries for the exact same timestamp might be overkill but good practice
		// For simplicity, we'll just insert.
		for (const entry of args.history) {
			await ctx.db.insert("analytics", {
				userId: user._id,
				questionId: entry.questionId,
				event: "seen",
				timestamp: entry.viewedAt,
				viewDuration: 0, // Default since we don't have it in local history
			});
		}

		// 2. Ensure they are marked as seen in userQuestions if not already there
		const uniqueQuestionIds = new Set(args.history.map((h) => h.questionId));

		const existingRelations = await Promise.all(
			Array.from(uniqueQuestionIds).map(async (questionId) => {
				const relation = await ctx.db
					.query("userQuestions")
					.withIndex("by_userIdAndQuestionId", (q) =>
						q.eq("userId", user._id).eq("questionId", questionId)
					)
					.first();
				return { questionId, relation };
			})
		);

		const now = Date.now();
		for (const { questionId, relation } of existingRelations) {
			if (relation) {
				// If it exists, we increment seenCount
				await ctx.db.patch(relation._id, {
					seenCount: (relation.seenCount || 0) + 1,
					// We DO NOT change status if it is liked or hidden. 
					// If it is 'seen', it stays 'seen'.
				});
			} else {
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					questionId,
					status: "seen",
					seenCount: 1,
					updatedAt: now,
				});
			}
		}

		return null;
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
})

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
})

export const getUsers = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user || !user.isAdmin) {
			throw new Error("Not authorized");
		}

		return await ctx.db
			.query("users")
			.order("desc")
			.collect();
	},
});

export const getHiddenStyleIds = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return null;
		}

		// Get hidden styles from userStyles table
		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		const hiddenStyles = hiddenStylesDocs.map((us) => us.styleId);

		return hiddenStyles;
	}
})

export const addHiddenStyleId = mutation({
	args: { styleId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) return null;

		const styleId = ctx.db.normalizeId("styles", args.styleId);
		if (!styleId) return null;

		const existing = await ctx.db
			.query("userStyles")
			.withIndex("by_userIdAndStyleId", (q) =>
				q.eq("userId", user._id).eq("styleId", styleId)
			)
			.first();

		if (!existing) {
			await ctx.db.insert("userStyles", {
				userId: user._id,
				styleId,
				status: "hidden",
				updatedAt: Date.now(),
			});
		} else if (existing.status !== "hidden") {
			await ctx.db.patch(existing._id, {
				status: "hidden",
				updatedAt: Date.now(),
			});
		}

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		return hiddenStylesDocs.map((us) => us.styleId);
	}
})

export const removeHiddenStyleId = mutation({
	args: { styleId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) return null;

		const styleId = ctx.db.normalizeId("styles", args.styleId);
		if (!styleId) return null;

		const existing = await ctx.db
			.query("userStyles")
			.withIndex("by_userIdAndStyleId", (q) =>
				q.eq("userId", user._id).eq("styleId", styleId)
			)
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		return hiddenStylesDocs.map((us) => us.styleId);
	}
})

export const getHiddenToneIds = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return null;
		}

		// Get hidden tones from userTones table
		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const hiddenTones = hiddenTonesDocs.map((ut) => ut.toneId);

		return hiddenTones;
	}
})

export const addHiddenToneId = mutation({
	args: { toneId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) return null;

		const toneId = ctx.db.normalizeId("tones", args.toneId);
		if (!toneId) return null;

		const existing = await ctx.db
			.query("userTones")
			.withIndex("by_userIdAndToneId", (q) =>
				q.eq("userId", user._id).eq("toneId", toneId)
			)
			.first();

		if (!existing) {
			await ctx.db.insert("userTones", {
				userId: user._id,
				toneId,
				status: "hidden",
				updatedAt: Date.now(),
			});
		} else if (existing.status !== "hidden") {
			await ctx.db.patch(existing._id, {
				status: "hidden",
				updatedAt: Date.now(),
			});
		}

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		return hiddenTonesDocs.map((ut) => ut.toneId);
	}
})

export const removeHiddenToneId = mutation({
	args: { toneId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) return null;

		const toneId = ctx.db.normalizeId("tones", args.toneId);
		if (!toneId) return null;

		const existing = await ctx.db
			.query("userTones")
			.withIndex("by_userIdAndToneId", (q) =>
				q.eq("userId", user._id).eq("toneId", toneId)
			)
			.first();

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();
		return hiddenTonesDocs.map((ut) => ut.toneId);
	}
})

// Get all users with newsletter subscription
export const getNewsletterSubscribers = internalQuery({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		return await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("newsletterSubscriptionStatus"), "subscribed"))
			.collect();
	},
});

// Get hidden styles for a user
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

// Get hidden tones for a user
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

