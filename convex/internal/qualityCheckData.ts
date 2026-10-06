import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { qualityCheckMode, qualityVerdict, sameJudgedSubject, wouldPublish, type QualityVerdict } from "../lib/qualityCheck";
import { isRetiredQuestion, isUserWrittenQuestion } from "../lib/questionAccess";
import { taxonomyDefinitions } from "../lib/taxonomyDefinitions";

/** Pending questions read per page of the backfill's scan, to stay well within a query's limits. */
const HELD_PAGE_SIZE = 200;

const definition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });

/** What the check read on a question. A verdict is only saved while all of it is unchanged. */
const judgedSubject = v.object({
  text: v.string(),
  styleId: v.id("styles"),
  toneId: v.id("tones"),
  topicId: v.optional(v.id("topics")),
});

/**
 * A generated library question that has no verdict yet. Questions people wrote are never
 * checked, and neither is one with no style or tone to be judged against.
 */
function awaitsCheck(question: Doc<"questions">): boolean {
  return (
    question.isAIGenerated === true &&
    Boolean(question.text) &&
    Boolean(question.styleId && question.toneId) &&
    !question.qualityCheck &&
    !isUserWrittenQuestion(question) &&
    !isRetiredQuestion(question)
  );
}

/**
 * What the judge is shown for one question (its text and short definitions of its style, tone
 * and topic), with what was read from the question to build it. Null when the question
 * shouldn't be checked: it is gone, already has a verdict, wasn't generated, was retired, or
 * its style or tone no longer exists.
 */
export const questionForCheck = internalQuery({
  args: { questionId: v.id("questions") },
  returns: v.union(
    v.null(),
    v.object({
      subject: v.object({ text: v.string(), style: definition, tone: definition, topic: v.union(v.null(), definition) }),
      read: judgedSubject,
    }),
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
    return {
      subject: { text: question.text, ...taxonomyDefinitions(style, tone, topic) },
      read: { text: question.text, styleId: question.styleId, toneId: question.toneId, topicId: question.topicId },
    };
  },
});

/**
 * Saves a verdict on a question. It only records: the question's status, its place in the
 * review queue and its review revision are left alone. Nothing is saved when the question is
 * gone, another check reached it first, or its wording, style, tone or topic changed while
 * the judge was reading it. Nothing is saved once the mode is off either, even for a check
 * that was already running.
 */
export const saveQualityCheck = internalMutation({
  args: {
    questionId: v.id("questions"),
    read: judgedSubject,
    verdict: qualityVerdict,
    model: v.string(),
    promptVersion: v.number(),
    runId: v.id("generationRuns"),
  },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    if (qualityCheckMode() === "off") return { saved: false };
    const question = await ctx.db.get(args.questionId);
    if (!question || question.qualityCheck || !sameJudgedSubject(question, args.read)) return { saved: false };
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
      // The schema's own field for these. Nothing reads it yet; it is kept in step with
      // qualityCheck.safety, which is the source, and is cleared with it (NO_VERDICT).
      safetyFlags: args.verdict.safety,
    });
    return { saved: true };
  },
});

/**
 * One page of the review queue, oldest first: the generated questions on it that are waiting
 * with no verdict, up to `limit`. A question whose style or tone was deleted can't be judged,
 * so it is left out instead of taking a place in the list on every run. The caller reads on
 * from `cursor` until it has enough or `isDone`.
 */
export const heldQuestionsWithoutCheck = internalQuery({
  args: { limit: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ questionIds: v.array(v.id("questions")), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .paginate({ numItems: HELD_PAGE_SIZE, cursor: args.cursor });
    const questionIds: Id<"questions">[] = [];
    for (const question of page.page) {
      if (questionIds.length >= args.limit) break;
      if (question.heldForReview !== true || !awaitsCheck(question)) continue;
      if (!(await ctx.db.get(question.styleId!)) || !(await ctx.db.get(question.toneId!))) continue;
      questionIds.push(question._id);
    }
    return { questionIds, cursor: page.continueCursor, isDone: page.isDone };
  },
});
