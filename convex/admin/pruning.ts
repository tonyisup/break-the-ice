import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { ensureAdmin } from "../auth";

// Helper: Simple cosine similarity for matching
function cosineSimilarity(a: number[], b: number[]): number {
	if (!a || !b || a.length !== b.length || a.length === 0) return 0;
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Nightly action to identify potential pruning targets.
 */
export const gatherPruningTargets = internalAction({
	args: {},
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		await ensureAdmin(ctx);
		const questions: Doc<"questions">[] = await ctx.runQuery(internal.admin.pruning.getQuestionsForPruningReview);
		const styles: Doc<"styles">[] = await ctx.runQuery(internal.internal.styles.getAllStylesInternal);
		const tones: Doc<"tones">[] = await ctx.runQuery(internal.internal.tones.getAllTonesInternal);
		const settings = await ctx.runQuery(internal.admin.pruning.getPruningSettingsInternal);

		// Fallback defaults if no settings record exists
		const s = settings || {
			minShowsForEngagement: 50,
			minLikeRate: 0.03,
			minShowsForAvgDuration: 20,
			minAvgViewDuration: 2000,
			minHiddenCount: 1,
			minHiddenRate: 0.1,
			minStyleSimilarity: 0.10,
			minToneSimilarity: 0.20,
			enableToneCheck: false,
		};

		const styleMap = new Map<Id<"styles">, Doc<"styles">>(styles.map((s: Doc<"styles">) => [s._id, s]));
		const toneMap = new Map<Id<"tones">, Doc<"tones">>(tones.map((t: Doc<"tones">) => [t._id, t]));

		const targetsFound = [];

		for (const question of questions) {
			const reasons: string[] = [];
			const metrics = {
				totalShows: question.totalShows || 0,
				totalLikes: question.totalLikes || 0,
				averageViewDuration: question.averageViewDuration || 0,
				hiddenCount: 0,
				styleSimilarity: undefined as number | undefined,
				toneSimilarity: undefined as number | undefined,
			};

			// 1. Check Engagement (Low view duration or low likes with sufficient exposure)
			if (metrics.totalShows > s.minShowsForEngagement) {
				const likeRate = metrics.totalLikes / metrics.totalShows;
				if (likeRate < s.minLikeRate) {
					reasons.push(`Low like rate: ${(likeRate * 100).toFixed(1)}%`);
				}
				if (metrics.averageViewDuration < s.minAvgViewDuration && metrics.totalShows > s.minShowsForAvgDuration) {
					reasons.push(`Low average view duration: ${metrics.averageViewDuration.toFixed(0)}ms`);
				}
			}

			// 2. Check Hiddens
			const hiddenCount: number = await ctx.runQuery(internal.admin.pruning.getHiddenCount, { questionId: question._id });
			metrics.hiddenCount = hiddenCount;
			if (hiddenCount > s.minHiddenCount || (metrics.totalShows > 0 && (hiddenCount / metrics.totalShows) > s.minHiddenRate)) {
				reasons.push(`High hidden count: ${hiddenCount} (${((hiddenCount / metrics.totalShows) * 100).toFixed(1)}% of shows)`);
			}

			// 3. Check Style/Tone Mismatch
			if (question.embedding) {
				if (question.styleId && styleMap.has(question.styleId)) {
					const style = styleMap.get(question.styleId)!;
					if (style.embedding) {
						const sim = cosineSimilarity(question.embedding, style.embedding);
						metrics.styleSimilarity = sim;
						if (sim < s.minStyleSimilarity) {
							reasons.push(`Style mismatch: ${sim.toFixed(2)} similarity to "${style.name}"`);
						}
					}
				}
				if (s.enableToneCheck && question.toneId && toneMap.has(question.toneId)) {
					const tone = toneMap.get(question.toneId)!;
					if (tone.embedding) {
						const sim = cosineSimilarity(question.embedding, tone.embedding);
						metrics.toneSimilarity = sim;
						if (sim < s.minToneSimilarity) {
							reasons.push(`Tone mismatch: ${sim.toFixed(2)} similarity to "${tone.name}"`);
						}
					}
				}
			}

			if (reasons.length > 0) {
				targetsFound.push({
					questionId: question._id,
					reason: reasons.join("; "),
					metrics,
				});
			}
		}

		// Save targets
		for (const target of targetsFound) {
			await ctx.runMutation(internal.admin.pruning.savePruningTarget, target);
		}

		return { targetsFound: targetsFound.length };
	},
});

/**
 * Internal query to fetch candidates for pruning review.
 */
export const getQuestionsForPruningReview = internalQuery({
	handler: async (ctx): Promise<Doc<"questions">[]> => {
		await ensureAdmin(ctx);
		// Fetch public/approved questions that aren't already pruned or in pruning review
		return await ctx.db
			.query("questions")
			.filter((q) =>
				q.and(
					q.or(q.eq(q.field("status"), "public"), q.eq(q.field("status"), "approved"), q.eq(q.field("status"), undefined)),
					q.eq(q.field("prunedAt"), undefined)
				)
			)
			.collect();
	},
});

/**
 * Internal query to get hidden count for a question.
 */
export const getHiddenCount = internalQuery({
	args: { questionId: v.id("questions") },
	handler: async (ctx, args): Promise<number> => {
		await ensureAdmin(ctx);
		const hiddens = await ctx.db
			.query("userQuestions")
			.withIndex("by_questionIdAndStatus", (q) => q.eq("questionId", args.questionId).eq("status", "hidden"))
			.collect();
		return hiddens.length;
	},
});

/**
 * Internal mutation to save a potential pruning target.
 */
export const savePruningTarget = internalMutation({
	args: {
		questionId: v.id("questions"),
		reason: v.string(),
		metrics: v.object({
			totalShows: v.number(),
			totalLikes: v.number(),
			averageViewDuration: v.number(),
			hiddenCount: v.number(),
			styleSimilarity: v.optional(v.number()),
			toneSimilarity: v.optional(v.number()),
		}),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const existing = await ctx.db
			.query("pruning")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.filter((q) => q.eq(q.field("status"), "pending"))
			.first();

		if (!existing) {
			await ctx.db.insert("pruning", {
				questionId: args.questionId,
				reason: args.reason,
				status: "pending",
				metrics: args.metrics,
			});
		} else {
			// Update the entry with new metrics/reason if still pending
			await ctx.db.patch(existing._id, {
				reason: args.reason,
				metrics: args.metrics,
			});
		}
	},
});

/**
 * Query to get pending pruning targets for admin review.
 */
export const getPendingTargets = query({
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		const targets = await ctx.db
			.query("pruning")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();

		const result = [];
		for (const target of targets) {
			const question = await ctx.db.get(target.questionId);
			if (question) {
				result.push({
					...target,
					question,
				});
			}
		}
		return result;
	},
});

/**
 * Mutation to approve pruning (actual prune).
 */
export const approvePruning = mutation({
	args: { pruningId: v.id("pruning") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");

		await ctx.db.patch(target.questionId, {
			status: "pruned",
			prunedAt: Date.now(),
		});

		await ctx.db.patch(args.pruningId, {
			status: "approved",
			prunedAt: Date.now(),
		});
	},
});

/**
 * Mutation to reject pruning (keep the question).
 */
export const rejectPruning = mutation({
	args: { pruningId: v.id("pruning") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");

		await ctx.db.patch(args.pruningId, {
			status: "rejected",
		});

		// Optionally reset status to approved to clear any ambiguity
		const question = await ctx.db.get(target.questionId);
		if (question && (question.status === undefined || question.status === "pending")) {
			await ctx.db.patch(target.questionId, { status: "approved" });
		}
	},
});
/**
 * Internal query to fetch pruning settings.
 */
export const getPruningSettingsInternal = internalQuery({
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db.query("pruningSettings").first();
	},
});

/**
 * Public query to fetch pruning settings for the admin UI.
 */
export const getPruningSettings = query({
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db.query("pruningSettings").first();
	},
});

/**
 * Admin mutation to update pruning settings.
 */
export const updatePruningSettings = mutation({
	args: {
		minShowsForEngagement: v.number(),
		minLikeRate: v.number(),
		minShowsForAvgDuration: v.number(),
		minAvgViewDuration: v.number(),
		minHiddenCount: v.number(),
		minHiddenRate: v.number(),
		minStyleSimilarity: v.number(),
		minToneSimilarity: v.number(),
		enableToneCheck: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const existing = await ctx.db.query("pruningSettings").first();
		if (existing) {
			await ctx.db.patch(existing._id, args);
		} else {
			await ctx.db.insert("pruningSettings", args);
		}
	},
});

/**
 * Public action to trigger pruning gathering manually from the UI.
 */
export const triggerGathering = action({
	args: {},
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		await ensureAdmin(ctx);

		return await ctx.runAction(internal.admin.pruning.gatherPruningTargets, {});
	},
});
