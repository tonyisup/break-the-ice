import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { action, ActionCtx, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { ensureAdmin } from "../auth";
import { cosineSimilarity } from "../lib/embeddings";
import schema from "../schema";
import { editorialReason } from "../lib/questionReviewValidators";
import { recordReview, refreshQuestionText, reviewReason, snapshot } from "../lib/questionReview";

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

export const questionValidator = doc(schema, "questions");

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
	const styleIds = styles.map((s) => s._id);
	const toneIds = tones.map((t) => t._id);
	const [questionEmbList, styleEmbList, toneEmbList] = await Promise.all([
		ctx.runQuery(internal.internal.questions.getEmbeddingsByQuestionIds, { questionIds }),
		ctx.runQuery(internal.admin.pruning.getStyleEmbeddingsForIds, { styleIds }),
		ctx.runQuery(internal.admin.pruning.getToneEmbeddingsForIds, { toneIds }),
	]);
	const questionEmbeddingMap = new Map<Id<"questions">, number[]>(questionEmbList.map((e: { questionId: Id<"questions">; embedding: number[] }) => [e.questionId, e.embedding]));
	const styleEmbeddingMap = new Map<Id<"styles">, number[]>(styleEmbList.map((e: { styleId: Id<"styles">; embedding: number[] }) => [e.styleId, e.embedding]));
	const toneEmbeddingMap = new Map<Id<"tones">, number[]>(toneEmbList.map((e: { toneId: Id<"tones">; embedding: number[] }) => [e.toneId, e.embedding]));

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
    const wantSet = new Set(args.styleIds);
    const out: Array<{ styleId: Id<"styles">; embedding: Array<number> }> = [];
    for (const styleId of wantSet) {
      const rows = await ctx.db
        .query("style_embeddings")
        .withIndex("by_styleId", (q) => q.eq("styleId", styleId))
        .collect();
      for (const row of rows) {
        out.push({ styleId: row.styleId, embedding: row.embedding });
      }
    }
    return out;
	},
});

export const getToneEmbeddingsForIds = internalQuery({
	args: { toneIds: v.array(v.id("tones")) },
	returns: v.array(v.object({ toneId: v.id("tones"), embedding: v.array(v.number()) })),
	handler: async (ctx, args) => {
    const wantSet = new Set(args.toneIds);
    const out: Array<{ toneId: Id<"tones">; embedding: Array<number> }> = [];
    for (const toneId of wantSet) {
      const rows = await ctx.db
        .query("tone_embeddings")
        .withIndex("by_toneId", (q) => q.eq("toneId", toneId))
        .collect();
      for (const row of rows) {
        out.push({ toneId: row.toneId, embedding: row.embedding });
      }
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
            const question = await ctx.db.get(target.questionId);
            if (!question || question.prunedAt !== undefined || question.status === "pruned") continue;
            const kept = await ctx.db.query("pruning").withIndex("by_questionId_and_status", q => q.eq("questionId", target.questionId).eq("status", "rejected")).order("desc").first();
            if (kept?.reviewedRevision === (question.reviewRevision ?? 0)) continue;
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
		return null;
	},
});

/**
 * Query to get pending pruning targets for admin review.
 */
export const getPendingTargets = query({
	args: { limit: v.optional(v.number()) },
	returns: v.array(v.object({ ...doc(schema, "pruning").fields, question: questionValidator })),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);


        const limit = Math.max(1, Math.min(50, Math.floor(Number.isFinite(args.limit) ? args.limit! : 10)));
        const result: (Doc<"pruning"> & { question: Doc<"questions"> })[] = [];
        for await (const target of ctx.db.query("pruning").withIndex("by_status", q => q.eq("status", "pending"))) {
            const question = await ctx.db.get(target.questionId);
            if (!question || question.prunedAt !== undefined || question.status === "pruned") continue;
            result.push({ ...target, question });
            if (result.length >= limit) break;
        }
		return result;
	},
});

/**
 * Mutation to approve pruning (actual prune).
 */
export const approvePruning = mutation({
	args: { pruningId: v.id("pruning"), reason: v.string(), expectedRevision: v.number() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const reviewer = await ensureAdmin(ctx);
        const reason = reviewReason(args.reason);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");
		if (target.status !== "pending") {
			throw new Error(`Pruning target is already ${target.status}`);
		}
        const before = await ctx.db.get(target.questionId);
        if (!before || before.duplicateOf || before.status === "pruned") throw new Error("Question is no longer available for review");
        if ((before.reviewRevision ?? 0) !== args.expectedRevision) throw new Error("Question changed during review. Reload first.");

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
            reviewedBy: reviewer.tokenIdentifier,
            reviewedRevision: (before.reviewRevision ?? 0) + 1,
            reviewedAt: Date.now(),
		});
        await recordReview(ctx, [before], { reviewer: reviewer.tokenIdentifier, reason, outcome: "prune", source: "pruning", pruningId: target._id, undoable: true });
        return null;
	},
});

/**
 * Mutation to reject pruning (keep the question).
 */
export const rejectPruning = mutation({
	args: { pruningId: v.id("pruning"), reason: v.string(), expectedRevision: v.number() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const reviewer = await ensureAdmin(ctx);
        const reason = reviewReason(args.reason);
		const target = await ctx.db.get(args.pruningId);
		if (!target) throw new Error("Target not found");
		if (target.status !== "pending") {
			throw new Error(`Pruning target is already ${target.status}`);
		}
        const before = await ctx.db.get(target.questionId);
        if (!before || before.duplicateOf || before.status === "pruned") throw new Error("Question is no longer available for review");
        if ((before.reviewRevision ?? 0) !== args.expectedRevision) throw new Error("Question changed during review. Reload first.");

		await ctx.db.patch(args.pruningId, {
			status: "rejected",
            reviewedBy: reviewer.tokenIdentifier,
            reviewedRevision: (before.reviewRevision ?? 0) + 1,
            reviewedAt: Date.now(),
		});
        await recordReview(ctx, [before], { reviewer: reviewer.tokenIdentifier, reason, outcome: "keep", source: "pruning", pruningId: target._id, undoable: true });
        return null;
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

/** Manual editorial flags do not require any engagement history. */
export const flagQuestion = mutation({
  args: { questionId: v.id("questions"), reasons: v.array(editorialReason), notes: v.string() },
  returns: v.id("pruning"),
  handler: async (ctx, args) => {
    const reviewer = await ensureAdmin(ctx);
    if (!args.reasons.length) throw new Error("Select at least one editorial reason");
    const notes = reviewReason(args.notes);
    const question = await ctx.db.get(args.questionId);
    if (!question || question.prunedAt !== undefined || question.status === "pruned") throw new Error("Question is not available for review");
    const pending = await ctx.db.query("pruning").withIndex("by_questionId_and_status", q => q.eq("questionId", args.questionId).eq("status", "pending")).first();
    const editorialReasons = [...new Set([...(pending?.editorialReasons ?? []), ...args.reasons])];
    const data = { editorialReasons, editorialNotes: notes, flaggedBy: reviewer.tokenIdentifier };
    const pruningId = pending?._id ?? await ctx.db.insert("pruning", { questionId: args.questionId, status: "pending", reason: "Manual editorial review", ...data });
    if (pending) await ctx.db.patch(pending._id, data);
    await recordReview(ctx, [question], { reviewer: reviewer.tokenIdentifier, reason: `${args.reasons.join(", ")}: ${notes}`, source: "pruning", outcome: "flag", pruningId, undoable: false });
    return pruningId;
  },
});

export const getReviewHistory = query({
  args: { source: v.union(v.literal("pruning"), v.literal("duplicates"), v.literal("question")) },
  returns: v.array(v.object({ ...doc(schema, "questionReviews").fields, changes: v.array(doc(schema, "questionReviewChanges")) })),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const reviews = await ctx.db.query("questionReviews").withIndex("by_source", q => q.eq("source", args.source)).order("desc").take(30);
    return await Promise.all(reviews.map(async review => ({
      ...review,
      changes: await ctx.db.query("questionReviewChanges").withIndex("by_reviewId", q => q.eq("reviewId", review._id)).collect(),
    })));
  },
});

export const undoReview = mutation({
  args: { reviewId: v.id("questionReviews") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reviewer = await ensureAdmin(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || !review.undoable || review.undoneAt !== undefined) throw new Error("This review cannot be undone");
    const changes = await ctx.db.query("questionReviewChanges").withIndex("by_reviewId", q => q.eq("reviewId", review._id)).collect();
    // Validate the whole group before restoring anything; newer edits must never
    // be silently overwritten. Analytics updates do not invalidate an undo.
    for (const change of changes) {
      const question = await ctx.db.get(change.questionId);
      if (!question) throw new Error("Question no longer exists");
      const current = snapshot(question);
      if (Object.keys(current).some(key => current[key as keyof typeof current] !== change.after[key as keyof typeof current])) {
        throw new Error("Question changed after this review; undo would overwrite newer work");
      }
    }
    if (review.pruningId) {
      const target = await ctx.db.get(review.pruningId);
      const pending = target && await ctx.db.query("pruning").withIndex("by_questionId_and_status", q => q.eq("questionId", target.questionId).eq("status", "pending")).first();
      if (!target || (pending && pending._id !== target._id)) throw new Error("A newer pruning review is pending");
      await ctx.db.patch(target._id, { status: "pending", prunedAt: undefined, reviewedBy: undefined, reviewedAt: undefined, reviewedRevision: undefined });
    }
    if (review.detectionId) {
      const detection = await ctx.db.get(review.detectionId);
      if (!detection || detection.status === "pending") throw new Error("Duplicate review has changed");
      await ctx.db.patch(detection._id, { status: "pending", reviewedBy: undefined, reviewedAt: undefined, rejectReason: undefined });
    }
    for (const change of changes) {
      // Explicit keys restore absent optional fields as well as defined values.
      await ctx.db.patch(change.questionId, {
        text: change.before.text, fingerprint: change.before.fingerprint,
        status: change.before.status, prunedAt: change.before.prunedAt,
        duplicateOf: change.before.duplicateOf, duplicateWasPublic: change.before.duplicateWasPublic,
        reviewRevision: (change.after.reviewRevision ?? 0) + 1,
      });
      if (change.before.text !== change.after.text) await refreshQuestionText(ctx, change.questionId);
      await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, { questionId: change.questionId });
    }
    await ctx.db.patch(review._id, { undoneAt: Date.now(), undoneBy: reviewer.tokenIdentifier });
    return null;
  },
});
