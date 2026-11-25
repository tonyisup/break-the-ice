import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureAdmin } from "../auth";
import { isPrivateUserQuestion, isQuestionPublic, isRetiredQuestion, isUserWrittenQuestion } from "../lib/questionAccess";
import { shownWording } from "../lib/questionReview";

/**
 * How many questions and analytics events one report reads. Together they stay under a query's
 * read limits (16,384 documents and 8 MiB; a question with Claude's verdict runs to a couple of
 * KB). Past them the report says it is partial (questionsTruncated, eventsTruncated): by then
 * engagement needs a daily rollup table instead of being read event by event.
 */
export const REPORT_QUESTION_LIMIT = 3000;
export const REPORT_EVENT_LIMIT = 10000;

/** Where a question stands: the library, the review queue, rejected, or retired by pruning. */
const reportStatus = v.union(v.literal("live"), v.literal("pending"), v.literal("rejected"), v.literal("retired"));
export type ReportStatus = "live" | "pending" | "rejected" | "retired";

const reportRow = v.object({
  id: v.id("questions"),
  text: v.string(),
  status: reportStatus,
  reviewRevision: v.number(),
  createdAt: v.number(),
  isAIGenerated: v.boolean(),
  byPerson: v.boolean(),
  style: v.optional(v.string()),
  tone: v.optional(v.string()),
  topic: v.optional(v.string()),
  claude: v.optional(v.union(v.literal("keep"), v.literal("hold"))),
  seen: v.number(),
  liked: v.number(),
  shared: v.number(),
  hidden: v.number(),
  /** Average time on screen, in ms, over the views that recorded one. */
  avgViewMs: v.number(),
});

function statusOf(question: Doc<"questions">): ReportStatus {
  if (isRetiredQuestion(question)) return "retired";
  if (question.status === "pending") return "pending";
  if (isQuestionPublic(question)) return "live";
  return "rejected";
}

/**
 * Engagement for every library question, and for the questions review decided on, so the
 * reports page can rank questions and compare styles, tones and topics.
 *
 * Engagement comes from the analytics events (seen, liked, shared, hidden), newest first, from
 * `since` on. The counters on each question aren't used: every event, a like included, adds to
 * totalShows, and hides and shares aren't counted there at all.
 *
 * A person's private question and a resolved duplicate are left out: neither is in the library,
 * and neither tells anything about generation.
 */
export const getPerformanceReport = query({
  args: { since: v.optional(v.number()) },
  returns: v.object({
    rows: v.array(reportRow),
    eventsCounted: v.number(),
    /** The oldest event counted. With eventsTruncated, older events weren't read. */
    oldestEventAt: v.optional(v.number()),
    eventsTruncated: v.boolean(),
    questionsTruncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const since = args.since ?? 0;
    const events = await ctx.db
      .query("analytics")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .order("desc")
      .take(REPORT_EVENT_LIMIT);

    const tallies = new Map<Id<"questions">, { seen: number; liked: number; shared: number; hidden: number; viewMs: number; timedViews: number }>();
    for (const event of events) {
      let tally = tallies.get(event.questionId);
      if (!tally) {
        tally = { seen: 0, liked: 0, shared: 0, hidden: 0, viewMs: 0, timedViews: 0 };
        tallies.set(event.questionId, tally);
      }
      tally[event.event]++;
      if (event.event === "seen" && event.viewDuration > 0) {
        tally.viewMs += event.viewDuration;
        tally.timedViews++;
      }
    }

    const questions = await ctx.db.query("questions").take(REPORT_QUESTION_LIMIT);
    const rows = [];
    for (const question of questions) {
      if (question.duplicateOf || isPrivateUserQuestion(question)) continue;
      const text = shownWording(question)?.trim();
      if (!text) continue;
      const tally = tallies.get(question._id);
      rows.push({
        id: question._id,
        text,
        status: statusOf(question),
        reviewRevision: question.reviewRevision ?? 0,
        createdAt: question._creationTime,
        isAIGenerated: question.isAIGenerated === true,
        byPerson: isUserWrittenQuestion(question),
        style: question.style ?? question.styleSlug,
        tone: question.tone ?? question.toneSlug,
        topic: question.topic ?? question.topicSlug,
        claude: question.qualityCheck?.verdict,
        seen: tally?.seen ?? 0,
        liked: tally?.liked ?? 0,
        shared: tally?.shared ?? 0,
        hidden: tally?.hidden ?? 0,
        avgViewMs: tally && tally.timedViews > 0 ? Math.round(tally.viewMs / tally.timedViews) : 0,
      });
    }

    return {
      rows,
      eventsCounted: events.length,
      oldestEventAt: events.at(-1)?.timestamp,
      eventsTruncated: events.length === REPORT_EVENT_LIMIT,
      questionsTruncated: questions.length === REPORT_QUESTION_LIMIT,
    };
  },
});
