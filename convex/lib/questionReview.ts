import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { isPrivateUserQuestion } from "./questionAccess";

export function snapshot(question: Doc<"questions">) {
  return {
    text: question.text,
    customText: question.customText,
    fingerprint: question.fingerprint,
    status: question.status,
    prunedAt: question.prunedAt,
    duplicateOf: question.duplicateOf,
    duplicateWasPublic: question.duplicateWasPublic,
    heldForReview: question.heldForReview,
    reviewRevision: question.reviewRevision,
  };
}

export function reviewReason(reason: string) {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 2000)
    throw new Error("Enter a review reason (up to 2,000 characters).");
  return trimmed;
}

/** What a question shows: its reviewed text, or the author's wording until a review copies it. */
export function shownWording(question: Pick<Doc<"questions">, "text" | "customText">) {
  return question.text ?? question.customText;
}

async function deleteQuestionEmbeddings(
  ctx: MutationCtx,
  questionId: Doc<"questions">["_id"],
) {
  const rows = await ctx.db
    .query("question_embeddings")
    .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

// Only for a question whose shown wording is embedded (see syncReviewedEmbedding).
async function refreshQuestionText(
  ctx: MutationCtx,
  questionId: Doc<"questions">["_id"],
) {
  // Remove stale vectors in the same transaction as the edit. A failed embedding
  // job leaves the question eligible for the existing missing-embedding retry.
  await deleteQuestionEmbeddings(ctx, questionId);
  await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
    questionId,
  });
}

/**
 * Embeddings follow the reviewed wording: a library or public question has an embedding of the
 * wording it shows, and a private user-written question has none (see isPrivateUserQuestion), so
 * an author's wording is embedded once a review makes it public and its embedding is removed
 * whenever it is saved private, whether or not its wording changed. Call after saving
 * `question`; `previousWording` is what it showed before.
 */
export async function syncReviewedEmbedding(
  ctx: MutationCtx,
  question: Doc<"questions">,
  previousWording: string | undefined,
) {
  if (isPrivateUserQuestion(question)) {
    await deleteQuestionEmbeddings(ctx, question._id);
    return;
  }
  if (shownWording(question) === previousWording) {
    const existing = await ctx.db
      .query("question_embeddings")
      .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
      .first();
    if (existing) return;
  }
  await refreshQuestionText(ctx, question._id);
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
