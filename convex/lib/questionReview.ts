import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

export function snapshot(question: Doc<"questions">) {
  return {
    text: question.text,
    fingerprint: question.fingerprint,
    status: question.status,
    prunedAt: question.prunedAt,
    duplicateOf: question.duplicateOf,
    duplicateWasPublic: question.duplicateWasPublic,
    reviewRevision: question.reviewRevision,
  };
}

export function reviewReason(reason: string) {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 2000)
    throw new Error("Enter a review reason (up to 2,000 characters).");
  return trimmed;
}

export async function refreshQuestionText(
  ctx: MutationCtx,
  questionId: Doc<"questions">["_id"],
) {
  // Remove stale vectors in the same transaction as the edit. A failed embedding
  // job leaves the question eligible for the existing missing-embedding retry.
  const rows = await ctx.db
    .query("question_embeddings")
    .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
    questionId,
  });
}

export async function recordReview(
  ctx: MutationCtx,
  before: Doc<"questions">[],
  review: Omit<Doc<"questionReviews">, "_id" | "_creationTime">,
) {
  const reviewId = await ctx.db.insert("questionReviews", review);
  for (const question of before) {
    const current = await ctx.db.get(question._id);
    if (!current) throw new Error("Question no longer exists");
    const reviewRevision = (current.reviewRevision ?? 0) + 1;
    await ctx.db.patch(question._id, { reviewRevision });
    await ctx.db.insert("questionReviewChanges", {
      reviewId,
      questionId: question._id,
      before: snapshot(question),
      after: snapshot({ ...current, reviewRevision }),
    });
  }
  return reviewId;
}
