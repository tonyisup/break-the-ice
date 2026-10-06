import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { qualityVerdict, wouldPublish, type QualityVerdict } from "../lib/qualityCheck";
import { isRetiredQuestion, isUserWrittenQuestion } from "../lib/questionAccess";
import { taxonomyDefinitions } from "../lib/taxonomyDefinitions";

/** Pending questions read per backfill query, to stay well within a query's limits. */
const HELD_SCAN_LIMIT = 500;

const definition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });

/** A generated library question that has no verdict yet. Questions people wrote are never checked. */
function awaitsCheck(question: Doc<"questions">): boolean {
  return (
    question.isAIGenerated === true &&
    Boolean(question.text) &&
    !question.qualityCheck &&
    !isUserWrittenQuestion(question) &&
    !isRetiredQuestion(question)
  );
}

/**
 * What the judge is shown for one question: its text and short definitions of its style, tone
 * and topic. Null when the question shouldn't be checked: it is gone, already has a verdict,
 * wasn't generated, was retired, or its style or tone no longer exists.
 */
export const questionForCheck = internalQuery({
  args: { questionId: v.id("questions") },
  returns: v.union(
    v.null(),
    v.object({ text: v.string(), style: definition, tone: definition, topic: v.union(v.null(), definition) }),
  ),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question || !question.text || !awaitsCheck(question)) return null;
    if (!question.styleId || !question.toneId) return null;
    const [style, tone, topic] = await Promise.all([
      ctx.db.get(question.styleId),
      ctx.db.get(question.toneId),
      question.topicId ? ctx.db.get(question.topicId) : Promise.resolve(null),
    ]);
    if (!style || !tone) return null;
    return { text: question.text, ...taxonomyDefinitions(style, tone, topic) };
  },
});

/**
 * Saves a verdict on a question. It only records: the question's status, its place in the
 * review queue and its review revision are left alone. A question that is gone, or that
 * another check reached first, is left as it is.
 */
export const saveQualityCheck = internalMutation({
  args: {
    questionId: v.id("questions"),
    verdict: qualityVerdict,
    model: v.string(),
    promptVersion: v.number(),
    runId: v.id("generationRuns"),
  },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question || question.qualityCheck) return { saved: false };
    const verdict = args.verdict as QualityVerdict;
    await ctx.db.patch(args.questionId, {
      qualityCheck: {
        ...args.verdict,
        wouldPublish: wouldPublish(verdict),
        model: args.model,
        promptVersion: args.promptVersion,
        runId: args.runId,
        checkedAt: Date.now(),
      },
      // Kept in step for existing readers of safetyFlags; qualityCheck.safety is the source.
      safetyFlags: args.verdict.safety,
    });
    return { saved: true };
  },
});

/** Generated questions waiting in the review queue with no verdict, oldest first. */
export const heldQuestionsWithoutCheck = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.id("questions")),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(HELD_SCAN_LIMIT);
    const waiting: Id<"questions">[] = [];
    for (const question of pending) {
      if (waiting.length >= args.limit) break;
      if (question.heldForReview === true && awaitsCheck(question)) waiting.push(question._id);
    }
    return waiting;
  },
});
