import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/*
 * What a question leaves behind when it is hard-deleted.
 *
 * Rows that only make sense for a live question are removed: its embeddings (vector search
 * keeps returning them), per-user state (seen, liked, hidden, sent), pending pruning reviews
 * and pending duplicate groups (neither can be resolved once a member is gone). History is kept: analytics events, approved or rejected reviews,
 * generation runs and email deliveries.
 */

/** A duplicate group's members in stored order and its dedupe key. */
export function duplicateGroup(questionIds: Id<"questions">[]): { questionIds: Id<"questions">[]; uniqueKey: string } {
	const sorted = [...questionIds].sort();
	return { questionIds: sorted, uniqueKey: sorted.join("_") };
}

/**
 * Settles a pending duplicate group after members disappear. It keeps its live members, or is
 * deleted when fewer than two remain (or when its reduced group already has its own row).
 * Returns what happened, and writes nothing when `dryRun` is set.
 */
export async function settleDuplicateGroup(
	ctx: MutationCtx,
	detection: Doc<"duplicateDetections">,
	isLive: (questionId: Id<"questions">) => Promise<boolean>,
	dryRun = false,
): Promise<"unchanged" | "stripped" | "deleted"> {
	const live: Id<"questions">[] = [];
	for (const questionId of detection.questionIds) {
		if (await isLive(questionId)) live.push(questionId);
	}
	if (live.length === detection.questionIds.length) return "unchanged";

	const { questionIds, uniqueKey } = duplicateGroup(live);
	const sameGroup =
		questionIds.length >= 2
			? await ctx.db
					.query("duplicateDetections")
					.withIndex("by_uniqueKey", (q) => q.eq("uniqueKey", uniqueKey))
					.first()
			: null;
	if (questionIds.length < 2 || (sameGroup && sameGroup._id !== detection._id)) {
		if (!dryRun) await ctx.db.delete(detection._id);
		return "deleted";
	}
	if (!dryRun) await ctx.db.patch(detection._id, { questionIds, uniqueKey });
	return "stripped";
}

/**
 * Removes the rows that only make sense for a live question. Call it before deleting one.
 * A caller deleting several questions in one transaction can read the pending duplicate groups
 * once and pass them in; each is re-read before it is settled.
 */
export async function removeQuestionReferences(
	ctx: MutationCtx,
	questionId: Id<"questions">,
	pendingGroups?: Doc<"duplicateDetections">[],
): Promise<void> {
	const embeddings = await ctx.db
		.query("question_embeddings")
		.withIndex("by_questionId", (q) => q.eq("questionId", questionId))
		.collect();
	const userQuestions = await ctx.db
		.query("userQuestions")
		.withIndex("by_questionId", (q) => q.eq("questionId", questionId))
		.collect();
	const pendingPruning = await ctx.db
		.query("pruning")
		.withIndex("by_questionId_and_status", (q) => q.eq("questionId", questionId).eq("status", "pending"))
		.collect();
	for (const row of [...embeddings, ...userQuestions, ...pendingPruning]) {
		await ctx.db.delete(row._id);
	}

	const groups =
		pendingGroups ??
		(await ctx.db
			.query("duplicateDetections")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect());
	for (const listed of groups) {
		if (!listed.questionIds.includes(questionId)) continue;
		const detection = pendingGroups ? await ctx.db.get(listed._id) : listed;
		if (!detection || !detection.questionIds.includes(questionId)) continue;
		await settleDuplicateGroup(ctx, detection, async (id) => id !== questionId && (await ctx.db.get(id)) !== null);
	}
}
