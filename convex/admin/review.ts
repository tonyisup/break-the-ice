import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ensureAdmin } from "../auth";
import { fingerprintText } from "../lib/promptArchitecture";
import { isPrivateUserQuestion } from "../lib/questionAccess";
import { recordReview, reviewReason, shownWording, syncReviewedEmbedding } from "../lib/questionReview";
import { editorialReason, editorialReasonLabels } from "../lib/questionReviewValidators";
import { NO_VERDICT, sameJudgedSubject } from "../lib/qualityCheck";
import { MAX_REVIEW_BATCH } from "../constants";

/**
 * Approve or reject pending questions from the review queue, as one undoable review.
 *
 * Approve makes a question public. Reject makes it private: an AI question is then hidden
 * from everyone, and a person's own question stays theirs. Both copy the wording the question
 * shows into its reviewed text, as approving on the questions page always has.
 *
 * Nothing has to be written down. A reject may carry reasons, in the quality check's own codes,
 * and either decision may carry a note; without them the log says what was decided. All or
 * nothing: if any question is no longer pending, or changed since the page showed it, none
 * is saved.
 */
export const reviewPendingQuestions = mutation({
  args: {
    questions: v.array(v.object({ id: v.id("questions"), expectedRevision: v.number() })),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reasons: v.optional(v.array(editorialReason)),
    note: v.optional(v.string()),
  },
  returns: v.object({ reviewId: v.id("questionReviews") }),
  handler: async (ctx, args) => {
    const reviewer = await ensureAdmin(ctx);
    const count = args.questions.length;
    if (count === 0) throw new Error("Select at least one question to review");
    if (count > MAX_REVIEW_BATCH) throw new Error(`Review at most ${MAX_REVIEW_BATCH} questions at a time`);
    if (new Set(args.questions.map((q) => q.id)).size !== count) throw new Error("A question is listed twice");
    const reasons = [...new Set(args.reasons ?? [])];
    if (args.decision === "approve" && reasons.length > 0) throw new Error("Only a reject takes reasons");
    const note = args.note?.trim() ?? "";

    // Check every question before changing any, so a stale selection saves nothing.
    const befores: Doc<"questions">[] = [];
    for (const { id, expectedRevision } of args.questions) {
      const question = await ctx.db.get(id);
      if (!question) throw new Error("A selected question no longer exists");
      if (question.status !== "pending") throw new Error("A selected question has already been reviewed. Reload and try again.");
      if (question.duplicateOf) throw new Error("Undo duplicate resolution before reviewing this question");
      if (expectedRevision !== (question.reviewRevision ?? 0)) {
        throw new Error("A selected question changed during review. Reload before saving.");
      }
      if (!shownWording(question)?.trim()) throw new Error("A selected question has no text");
      befores.push(question);
    }

    const status = args.decision === "approve" ? "public" : "private";
    for (const before of befores) {
      const text = shownWording(before)!.trim();
      const update: Partial<Doc<"questions">> = {
        text,
        status,
        // Reviewing ends the hold; undo restores it from the snapshot.
        heldForReview: undefined,
        prunedAt: undefined,
      };
      const after = { ...before, ...update };
      // The quality check's verdict is about the wording it read.
      if (before.qualityCheck && !sameJudgedSubject(before, after)) Object.assign(update, NO_VERDICT);
      // Only a library question keeps a fingerprint (see isPrivateUserQuestion).
      update.fingerprint = isPrivateUserQuestion(after) ? undefined : fingerprintText(text);
      await ctx.db.patch(before._id, update);
      await syncReviewedEmbedding(ctx, (await ctx.db.get(before._id))!, shownWording(before));
      await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, { questionId: before._id });
    }

    const verb = args.decision === "approve" ? "Approved" : "Rejected";
    const summary = `${verb} ${count === 1 ? "1 question" : `${count} questions`}`;
    const why = [reasons.map((reason) => editorialReasonLabels[reason]).join(", "), note].filter(Boolean).join(": ");
    const reviewId = await recordReview(ctx, befores, {
      reviewer: reviewer.tokenIdentifier,
      reason: reviewReason(why ? `${summary}. ${why}` : summary),
      outcome: args.decision,
      source: "question",
      undoable: true,
      ...(reasons.length > 0 ? { reasons } : {}),
    });
    return { reviewId };
  },
});
