import { v } from "convex/values";
import { action, ActionCtx, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { ensureAdmin } from "../auth";

// Shared return validators for type safety
export const pruningSettingsValidator = v.object({
	_id: v.id("pruningSettings"),
	_creationTime: v.number(),
	name: v.string(),
	status: v.union(v.literal("default"), v.literal("custom")),
	minShowsForEngagement: v.number(),
	minLikeRate: v.number(),
	minShowsForAvgDuration: v.number(),
	minAvgViewDuration: v.number(),
	minHiddenCount: v.number(),
	minHiddenRate: v.number(),
	minStyleSimilarity: v.number(),
	minToneSimilarity: v.number(),
	enableToneCheck: v.boolean(),
});

export const questionValidator = v.object({
	_id: v.id("questions"),
	_creationTime: v.number(),
	organizationId: v.optional(v.id("organizations")),
	averageViewDuration: v.number(),
	lastShownAt: v.optional(v.number()),
	text: v.optional(v.string()),
	totalLikes: v.number(),
	totalThumbsDown: v.optional(v.number()),
	totalShows: v.number(),
	isAIGenerated: v.optional(v.boolean()),
	tags: v.optional(v.array(v.string())),
	style: v.optional(v.string()),
	styleId: v.optional(v.id("styles")),
	tone: v.optional(v.string()),
	toneId: v.optional(v.id("tones")),
	topic: v.optional(v.string()),
	topicId: v.optional(v.id("topics")),
	authorId: v.optional(v.string()),
	customText: v.optional(v.string()),
	status: v.optional(
		v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("public"),
			v.literal("private"),
			v.literal("pruning"),
			v.literal("pruned")
		)
	),
	prunedAt: v.optional(v.number()),
	lastPostedAt: v.optional(v.number()),
	poolDate: v.optional(v.string()),
	poolStatus: v.optional(v.union(v.literal("available"), v.literal("distributed"))),
});

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
 * Internal helper to satisfy both the cron and manual trigger.
 */
export async function gatherPruningTargetsImpl(ctx: ActionCtx): Promise<{ targetsFound: number }> {
	const questions: Doc<"questions">[] = await ctx.runQuery(internal.admin.pruning.getQuestionsForPruningReview);
	const hiddenCounts: Record<string, number> = await ctx.runQuery(internal.admin.pruning.getBatchHiddenCounts, {
		questionIds: questions.map((q) => q._id),
	});
	const styles: Doc<"styles">[] = await ctx.runQuery(internal.internal.styles.getAllStylesInternal);
	const tones: Doc<"tones">[] = await ctx.runQuery(internal.internal.tones.getAllTonesInternal);
	const settings = await ctx.runQuery(internal.admin.pruning.getPruningSettingsInternal);

	const questionIds = questions.map((q) => q._id);
	const styleIds = [...new Set(styles.map((s) => s._id))];
	const toneIds = [...new Set(tones.map((t) => t._id))];
	const [questionEmbList, styleEmbList, toneEmbList] = await Promise.all([
		ctx.runQuery(internal.internal.questions.getEmbeddingsByQuestionIds, { questionIds }),
		ctx.runQuery(internal.admin.pruning.getStyleEmbeddingsForIds, { styleIds }),
		ctx.runQuery(internal.admin.pruning.getToneEmbeddingsForIds, { toneIds }),
	]);
	const questionEmbeddingMap = new Map(questionEmbList.map((e) => [e.questionId, e.embedding]));
	const styleEmbeddingMap = new Map(styleEmbList.map((e) => [e.styleId, e.embedding]));
	const toneEmbeddingMap = new Map(toneEmbList.map((e) => [e.toneId, e.embedding]));

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
		}

		// 2. Check Engagement Duration
		// Independence check: we evaluate duration if exposure > minShowsForAvgDuration
		if (metrics.totalShows > s.minShowsForAvgDuration && metrics.averageViewDuration < s.minAvgViewDuration) {
			reasons.push(`Low average view duration: ${metrics.averageViewDuration.toFixed(0)}ms`);
		}

		// 3. Check Hiddens
		const hiddenCount = hiddenCounts[question._id] || 0;
		metrics.hiddenCount = hiddenCount;
		const hiddenRate = metrics.totalShows > 0 ? hiddenCount / metrics.totalShows : 0;
		if (hiddenCount > s.minHiddenCount || hiddenRate > s.minHiddenRate) {
			reasons.push(`High hidden count: ${hiddenCount} (${(hiddenRate * 100).toFixed(1)}% of shows)`);
		}

		// 4. Check Style/Tone Mismatch (embeddings from embedding tables)
		const questionEmbedding = questionEmbeddingMap.get(question._id);
		if (questionEmbedding) {
			if (question.styleId && styleMap.has(question.styleId)) {
				const style = styleMap.get(question.styleId)!;
				const styleEmbedding = styleEmbeddingMap.get(question.styleId);
				if (styleEmbedding) {
					const sim = cosineSimilarity(questionEmbedding, styleEmbedding);
					metrics.styleSimilarity = sim;
					if (sim < s.minStyleSimilarity) {
						reasons.push(`Style mismatch: ${sim.toFixed(2)} similarity to "${style.name}"`);
					}
				}
			}
			if (s.enableToneCheck && question.toneId && toneMap.has(question.toneId)) {
				const tone = toneMap.get(question.toneId)!;
				const toneEmbedding = toneEmbeddingMap.get(question.toneId);
				if (toneEmbedding) {
					const sim = cosineSimilarity(questionEmbedding, toneEmbedding);
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
	await ctx.runMutation(internal.admin.pruning.savePruningTargets, { targets: targetsFound });

	return { targetsFound: targetsFound.length };
}

/**
 * Nightly action to identify potential pruning targets.
 */
export const gatherPruningTargets = internalAction({
	args: {},
	returns: v.object({ targetsFound: v.number() }),
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		return await gatherPruningTargetsImpl(ctx);
	},
});

/**
 * Internal query to fetch candidates for pruning review.
 */
export const getQuestionsForPruningReview = internalQuery({
	args: {},
	returns: v.array(questionValidator),
	handler: async (ctx): Promise<Doc<"questions">[]> => {
		// Fetch public/approved/undefined status questions that aren't already pruned
		// We avoid .filter() by performing three indexed queries and merging
		const results = await Promise.all([
			ctx.db
				.query("questions")
				.withIndex("by_prunedAt_status_text", (q) => q.eq("prunedAt", undefined).eq("status", "public"))
				.collect(),
			ctx.db
				.query("questions")
				.withIndex("by_prunedAt_status_text", (q) => q.eq("prunedAt", undefined).eq("status", "approved"))
				.collect(),
			ctx.db
				.query("questions")
				.withIndex("by_prunedAt_status_text", (q) => q.eq("prunedAt", undefined).eq("status", undefined))
				.collect(),
		]);

		const flat = results.flat();
		const seen = new Set<Id<"questions">>();
		const unique: Doc<"questions">[] = [];
		for (const q of flat) {
			if (!seen.has(q._id)) {
				seen.add(q._id);
				unique.push(q);
			}
		}
		return unique;
	},
});

export const getStyleEmbeddingsForIds = internalQuery({
	args: { styleIds: v.array(v.id("styles")) },
	returns: v.array(v.object({ styleId: v.id("styles"), embedding: v.array(v.number()) })),
	handler: async (ctx, args) => {
		const out: { styleId: Id<"styles">; embedding: number[] }[] = [];
		for (const styleId of args.styleIds) {
			const row = await ctx.db
				.query("style_embeddings")
				.withIndex("by_styleId", (q) => q.eq("styleId", styleId))
				.first();
			if (row) out.push({ styleId, embedding: row.embedding });
		}
		return out;
	},
});

export const getToneEmbeddingsForIds = internalQuery({
	args: { toneIds: v.array(v.id("tones")) },
	returns: v.array(v.object({ toneId: v.id("tones"), embedding: v.array(v.number()) })),
	handler: async (ctx, args) => {
		const out: { toneId: Id<"tones">; embedding: number[] }[] = [];
		for (const toneId of args.toneIds) {
			const row = await ctx.db
				.query("tone_embeddings")
				.withIndex("by_toneId", (q) => q.eq("toneId", toneId))
				.first();
			if (row) out.push({ toneId, embedding: row.embedding });
		}
		return out;
	},
});

/**
 * Internal query to get hidden counts for multiple questions.
 */
export const getBatchHiddenCounts = internalQuery({
	args: { questionIds: v.array(v.id("questions")) },
	returns: v.record(v.string(), v.number()),
	handler: async (ctx, args): Promise<Record<string, number>> => {
		const results: Record<string, number> = {};
		// Perform per-question indexed queries to avoid full hidden scan + filter
		for (const id of args.questionIds) {
			const hiddens = await ctx.db
				.query("userQuestions")
				.withIndex("by_questionIdAndStatus", (q) =>
					q.eq("questionId", id).eq("status", "hidden")
				)
				.collect();
			results[id] = hiddens.length;
		}
		return results;
	},
});

/**
 * Internal mutation to save multiple potential pruning targets.
 */
export const savePruningTargets = internalMutation({
	args: {
		targets: v.array(
			v.object({
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
			})
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		for (const target of args.targets) {
			const existing = await ctx.db
				.query("pruning")
				.withIndex("by_questionId_and_status", (q) =>
					q.eq("questionId", target.questionId).eq("status", "pending")
				)
				.first();

			if (!existing) {
				await ctx.db.insert("pruning", {
					questionId: target.questionId,
					reason: target.reason,
					status: "pending",
					metrics: target.metrics,
				});
			} else {
				// Update the entry with new metrics/reason if still pending
				await ctx.db.patch(existing._id, {
					reason: target.reason,
					metrics: target.metrics,
				});
			}
		}
	},
});

/**
 * Query to get pending pruning targets for admin review.
 */
export const getPendingTargets = query({
	args: {},
	returns: v.array(v.object({
		_id: v.id("pruning"),
		_creationTime: v.number(),
		questionId: v.id("questions"),
		userId: v.optional(v.id("users")),
		status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
		reason: v.string(),
		metrics: v.optional(v.object({
			totalShows: v.number(),
			totalLikes: v.number(),
			averageViewDuration: v.number(),
			hiddenCount: v.number(),
			styleSimilarity: v.optional(v.number()),
			toneSimilarity: v.optional(v.number()),
		})),
		prunedAt: v.optional(v.number()),
		question: questionValidator,
	})),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		const targets = await ctx.db
			.query("pruning")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();

		const result: (Doc<"pruning"> & { question: Doc<"questions"> })[] = [];
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
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");
		if (target.status !== "pending") {
			throw new Error(`Pruning target is already ${target.status}`);
		}

		await ctx.db.patch(target.questionId, {
			status: "pruned",
			prunedAt: Date.now(),
		});
		await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
			questionId: target.questionId,
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
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");
		if (target.status !== "pending") {
			throw new Error(`Pruning target is already ${target.status}`);
		}

		await ctx.db.patch(args.pruningId, {
			status: "rejected",
		});
	},
});
/**
 * Internal query to fetch pruning settings.
 */
export const getPruningSettingsInternal = internalQuery({
	args: {},
	returns: v.nullable(pruningSettingsValidator),
	handler: async (ctx): Promise<Doc<"pruningSettings"> | null> => {
		return await ctx.db
			.query("pruningSettings")
			.withIndex("by_status", (q) => q.eq("status", "default"))
			.first();
	},
});

/**
 * Public query to fetch pruning settings for the admin UI.
 */
export const getPruningSettings = query({
	args: {},
	returns: v.nullable(pruningSettingsValidator),
	handler: async (ctx): Promise<Doc<"pruningSettings"> | null> => {
		await ensureAdmin(ctx);
		return await ctx.runQuery(internal.admin.pruning.getPruningSettingsInternal);
	},
});

export const updatePruningSettings = mutation({
	args: {
		id: v.optional(v.id("pruningSettings")),
		name: v.string(),
		status: v.union(v.literal("default"), v.literal("custom")),
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
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, ...data } = args;

		// If this is set to default, ensure no other settings are default
		if (data.status === "default") {
			const defaults = await ctx.db
				.query("pruningSettings")
				.withIndex("by_status", (q) => q.eq("status", "default"))
				.collect();
			for (const d of defaults) {
				if (d._id !== id) {
					await ctx.db.patch(d._id, { status: "custom" });
				}
			}
		}

		if (id) {
			await ctx.db.patch(id, data);
		} else {
			await ctx.db.insert("pruningSettings", data);
		}
	},
});

/**
 * Public action to trigger pruning gathering manually from the UI.
 */
export const triggerGathering = action({
	args: {},
	returns: v.object({ targetsFound: v.number() }),
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		await ensureAdmin(ctx);

		return await gatherPruningTargetsImpl(ctx);
	},
});
