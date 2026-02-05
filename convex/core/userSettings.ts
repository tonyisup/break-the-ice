import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { getUserOrCreate } from "./users";

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

		const likedQuestionsDocs = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();

		const hiddenQuestionsDocs = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		return {
			likedQuestions: likedQuestionsDocs.map((q) => q.questionId),
			hiddenQuestions: hiddenQuestionsDocs.map((q) => q.questionId),
			hiddenStyles: hiddenStylesDocs.map((us) => us.styleId),
			hiddenTones: hiddenTonesDocs.map((ut) => ut.toneId),
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

		const history = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(args.limit ?? 50);

		const results = [];
		for (const h of history) {
			const question = await ctx.db.get(h.questionId);
			if (question) {
				results.push({
					question,
					viewedAt: h.updatedAt,
				});
			}
		}

		return results;
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

		// 1. Handle removals
		const existingLiked = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();

		const newLikedSet = new Set(args.likedQuestions);
		for (const uq of existingLiked) {
			if (!newLikedSet.has(uq.questionId)) {
				// We don't delete, we just change status back to 'seen' or similar?
				// Actually, if it's no longer liked, we can just mark it as seen.
				await ctx.db.patch(uq._id, {
					status: "seen",
					updatedAt: Date.now(),
				});
			}
		}

		// 2. Handle additions/updates
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

		await ctx.scheduler.runAfter(0, internal.internal.users.updateUserPreferenceEmbeddingAction, {
			userId: user._id,
		});
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

		// 1. Handle removals
		const existingHidden = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status", (q) =>
				q.eq("userId", user._id).eq("status", "hidden")
			)
			.collect();

		const newHiddenSet = new Set(args.hiddenQuestions);
		for (const uq of existingHidden) {
			if (!newHiddenSet.has(uq.questionId)) {
				await ctx.db.patch(uq._id, {
					status: "seen",
					updatedAt: Date.now(),
				});
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

		await ctx.scheduler.runAfter(0, internal.internal.users.updateUserPreferenceEmbeddingAction, {
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

		await ctx.scheduler.runAfter(0, internal.internal.users.updateUserPreferenceEmbeddingAction, {
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
});

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
});

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
});

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
});

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
});

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
});
