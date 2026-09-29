import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
	findUserQuestionInWorkspace,
	findUserStyleInWorkspace,
	findUserToneInWorkspace,
	resolveWorkspaceOrganizationId,
} from "../lib/workspaceEngagement";
import { getUserOrCreate } from "./users";
import { canReadQuestion, readableQuestionIds } from "../lib/questionAccess";
import { findCanonicalUser } from "../lib/users";

const workspaceOrganizationIdArg = {
	organizationId: v.optional(v.id("organizations")),
};

export const getSettings = query({
	args: workspaceOrganizationIdArg,
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
	handler: async (ctx, args) => {
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const likedQuestionsDocs = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "liked"),
			)
			.collect();

		const hiddenQuestionsDocs = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
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
		...workspaceOrganizationIdArg,
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

		if (!user) {
			return [];
		}

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const history = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("organizationId", organizationId),
			)
			.order("desc")
			.take(args.limit ?? 50);

		const results = [];
		for (const h of history) {
			const question = await ctx.db.get(h.questionId);
			if (question && (await canReadQuestion(ctx, question, user._id))) {
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
		...workspaceOrganizationIdArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existingLiked = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "liked"),
			)
			.collect();

		// Demote only what the client dropped; a like on a question the user can no
		// longer read (say, an org that lapsed) survives. Check only the new ids, since
		// the client sends its whole list on every change.
		const requestedLiked = new Set<string>(args.likedQuestions);
		const alreadyLiked = new Set<string>(existingLiked.map((uq) => uq.questionId));
		const newLikedSet = new Set(
			await readableQuestionIds(
				ctx,
				args.likedQuestions.filter((id) => !alreadyLiked.has(id)),
				user._id,
			),
		);
		for (const uq of existingLiked) {
			if (!requestedLiked.has(uq.questionId)) {
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
				const existing = await findUserQuestionInWorkspace(
					ctx,
					user._id,
					questionId,
					organizationId,
				);

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
						organizationId,
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
		...workspaceOrganizationIdArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existingHidden = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_organizationId_status_updatedAt", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();

		// Same rule as likes: un-hide only what the client dropped, check only new ids.
		const requestedHidden = new Set<string>(args.hiddenQuestions);
		const alreadyHidden = new Set<string>(existingHidden.map((uq) => uq.questionId));
		const newHiddenSet = new Set(
			await readableQuestionIds(
				ctx,
				args.hiddenQuestions.filter((id) => !alreadyHidden.has(id)),
				user._id,
			),
		);
		for (const uq of existingHidden) {
			if (!requestedHidden.has(uq.questionId)) {
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
				const existing = await findUserQuestionInWorkspace(
					ctx,
					user._id,
					questionId,
					organizationId,
				);

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
						organizationId,
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
		...workspaceOrganizationIdArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existingHiddenStyles = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
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
				const existing = await findUserStyleInWorkspace(
					ctx,
					user._id,
					styleId,
					organizationId,
				);

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
						organizationId,
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
		...workspaceOrganizationIdArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existingHiddenTones = await ctx.db
			.query("userTones")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
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
				const existing = await findUserToneInWorkspace(
					ctx,
					user._id,
					toneId,
					organizationId,
				);

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
						organizationId,
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

// The merge* mutations take plain strings: local storage can hold ids from another
// deployment or a malformed entry, and one bad id must not block the rest. They
// merge signed-out activity, which is always personal, so they take no workspace.
const PERSONAL_WORKSPACE = undefined;
// Still accepted, and ignored: clients cached before this change send it and clear
// their local lists without waiting, so rejecting it (even a malformed one) would
// lose that data.
const ignoredWorkspaceArg = { organizationId: v.optional(v.string()) };

export const mergeKnownLikedQuestions = mutation({
	args: {
		likedQuestions: v.array(v.string()),
		...ignoredWorkspaceArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = PERSONAL_WORKSPACE;

		const now = Date.now();
		const newLikedSet = new Set(await readableQuestionIds(ctx, args.likedQuestions, user._id));

		const existingRelations = await Promise.all(
			Array.from(newLikedSet).map(async (questionId) => {
				const relation = await findUserQuestionInWorkspace(
					ctx,
					user._id,
					questionId,
					organizationId,
				);
				return { questionId, relation };
			})
		);

		for (const { questionId, relation } of existingRelations) {
			if (relation) {
				if (relation.status !== "liked") {
					await ctx.db.patch(relation._id, {
						status: "liked",
						updatedAt: now,
					});
				}
			} else {
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					organizationId,
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
		hiddenQuestions: v.array(v.string()),
		...ignoredWorkspaceArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = PERSONAL_WORKSPACE;

		const now = Date.now();
		const newHiddenSet = new Set(await readableQuestionIds(ctx, args.hiddenQuestions, user._id));

		const existingRelations = await Promise.all(
			Array.from(newHiddenSet).map(async (questionId) => {
				const relation = await findUserQuestionInWorkspace(
					ctx,
					user._id,
					questionId,
					organizationId,
				);
				return { questionId, relation };
			})
		);

		for (const { questionId, relation } of existingRelations) {
			if (relation) {
				if (relation.status !== "hidden") {
					await ctx.db.patch(relation._id, {
						status: "hidden",
						updatedAt: now,
					});
				}
			} else {
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					organizationId,
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

// Local history timestamps come from the client. Admin analytics formats them as dates
// and charts the last 30 days, so skip any that can't be a real view.
const EARLIEST_VIEW_MS = Date.UTC(2020, 0, 1);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
function isPlausibleViewTime(viewedAt: number): boolean {
	return Number.isFinite(viewedAt) && viewedAt >= EARLIEST_VIEW_MS && viewedAt <= Date.now() + MAX_CLOCK_SKEW_MS;
}

export const mergeQuestionHistory = mutation({
	args: {
		history: v.array(
			v.object({
				questionId: v.string(),
				viewedAt: v.number(),
			})
		),
		...ignoredWorkspaceArg,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getUserOrCreate(ctx);
		const organizationId = PERSONAL_WORKSPACE;

		const readable = new Set<string>(
			await readableQuestionIds(ctx, args.history.map((h) => h.questionId), user._id),
		);

		// 1. Record each view once. A retried merge sends the same entries again, so an
		// entry already stored (same question and timestamp) is not counted twice.
		const newViews = new Map<Id<"questions">, number>();
		for (const entry of args.history) {
			const questionId = ctx.db.normalizeId("questions", entry.questionId);
			if (!questionId || !readable.has(questionId) || !isPlausibleViewTime(entry.viewedAt)) continue;
			const existing = await ctx.db
				.query("analytics")
				.withIndex("by_userId_event_timestamp", (q) =>
					q.eq("userId", user._id).eq("event", "seen").eq("timestamp", entry.viewedAt),
				)
				.filter((q) => q.eq(q.field("questionId"), questionId))
				.first();
			if (existing) continue;
			await ctx.db.insert("analytics", {
				userId: user._id,
				questionId,
				event: "seen",
				timestamp: entry.viewedAt,
				viewDuration: 0, // Default since we don't have it in local history
			});
			newViews.set(questionId, (newViews.get(questionId) ?? 0) + 1);
		}

		// 2. Ensure they are marked as seen in userQuestions if not already there
		const existingRelations = await Promise.all(
			Array.from(readable).map(async (id) => {
				const questionId = id as Id<"questions">;
				const relation = await findUserQuestionInWorkspace(
					ctx,
					user._id,
					questionId,
					organizationId,
				);
				return { questionId, relation };
			})
		);

		const now = Date.now();
		for (const { questionId, relation } of existingRelations) {
			const added = newViews.get(questionId) ?? 0;
			if (relation) {
				if (added > 0) {
					await ctx.db.patch(relation._id, {
						seenCount: (relation.seenCount || 0) + added,
					});
				}
			} else {
				await ctx.db.insert("userQuestions", {
					userId: user._id,
					organizationId,
					questionId,
					status: "seen",
					seenCount: Math.max(added, 1),
					updatedAt: now,
				});
			}
		}

		return null;
	},
});

export const getHiddenStyleIds = query({
	args: workspaceOrganizationIdArg,
	handler: async (ctx, args) => {
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();
		const hiddenStyles = hiddenStylesDocs.map((us) => us.styleId);

		return hiddenStyles;
	}
});

export const addHiddenStyleId = mutation({
	args: { styleId: v.string(), ...workspaceOrganizationIdArg },
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existing = await findUserStyleInWorkspace(
			ctx,
			user._id,
			styleId,
			organizationId,
		);

		if (!existing) {
			await ctx.db.insert("userStyles", {
				userId: user._id,
				organizationId,
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
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();
		return hiddenStylesDocs.map((us) => us.styleId);
	}
});

export const removeHiddenStyleId = mutation({
	args: { styleId: v.string(), ...workspaceOrganizationIdArg },
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existing = await findUserStyleInWorkspace(
			ctx,
			user._id,
			styleId,
			organizationId,
		);

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		const hiddenStylesDocs = await ctx.db
			.query("userStyles")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();
		return hiddenStylesDocs.map((us) => us.styleId);
	}
});

export const getHiddenToneIds = query({
	args: workspaceOrganizationIdArg,
	handler: async (ctx, args) => {
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();

		const hiddenTones = hiddenTonesDocs.map((ut) => ut.toneId);

		return hiddenTones;
	}
});

export const addHiddenToneId = mutation({
	args: { toneId: v.string(), ...workspaceOrganizationIdArg },
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existing = await findUserToneInWorkspace(
			ctx,
			user._id,
			toneId,
			organizationId,
		);

		if (!existing) {
			await ctx.db.insert("userTones", {
				userId: user._id,
				organizationId,
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
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();
		return hiddenTonesDocs.map((ut) => ut.toneId);
	}
});

export const removeHiddenToneId = mutation({
	args: { toneId: v.string(), ...workspaceOrganizationIdArg },
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

		const organizationId = await resolveWorkspaceOrganizationId(
			ctx,
			args.organizationId,
		);

		const existing = await findUserToneInWorkspace(
			ctx,
			user._id,
			toneId,
			organizationId,
		);

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		const hiddenTonesDocs = await ctx.db
			.query("userTones")
			.withIndex("by_userId_organizationId_status", (q) =>
				q
					.eq("userId", user._id)
					.eq("organizationId", organizationId)
					.eq("status", "hidden"),
			)
			.collect();
		return hiddenTonesDocs.map((ut) => ut.toneId);
	}
});
