"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureAiBudget, keptAiReservation } from "../lib/aiSpendGuard";
import { assertEvalsEnabled } from "../lib/evalChecks";
import {
  GENERATION_PROVIDER,
  UnusableOutputError,
  createChatCompletionWithRetry,
  getChatCompletionContent,
  markRunFailed,
} from "../lib/generationRunner";
import {
  QUALITY_CHECK_MAX_OUTPUT_TOKENS,
  QUALITY_CHECK_MODEL,
  QUALITY_CHECK_PROMPT_VERSION,
  QUALITY_CHECK_TEMPERATURE,
  buildQualityCheckPrompts,
  flagsQuestion,
  parseQualityVerdict,
  qualityCheckMode,
  qualityCheckSubject,
  qualityVerdict,
  wouldPublish,
  type QualityCheckSubject,
  type QualityVerdict,
} from "../lib/qualityCheck";

/** A failed check is tried once more, this long after it failed. */
export const QUALITY_CHECK_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 2;
/** The most questions one backfill run checks. */
export const QUALITY_CHECK_BACKFILL_LIMIT = 50;
/** A backfill run starts no new check after this long, to finish well inside an action's time limit. */
export const QUALITY_CHECK_BACKFILL_TIME_BUDGET_MS = 6 * 60 * 1000;
/** Pages of the review queue one backfill run reads while looking for unchecked questions. */
const BACKFILL_MAX_PAGES = 25;
/** The most questions one eval call judges, so the action stays well inside its time limit. */
const EVAL_MAX_ITEMS = 25;

/**
 * One call to the judge, through the daily budget like any generation call and recorded as a
 * `quality_check` run. Throws when the budget is paused, the provider fails or the answer
 * can't be read: there is never a guessed verdict.
 *
 * Every check is system spend, whoever's request generated the question. A check costs about
 * 1 cent a question, which is more than generating a feed question did, so on the user budget
 * it would cut what people can generate in a day to about a third. On system spend, the checks
 * that follow people's generation are still bounded by the user budget that caps it; the ones
 * that follow the daily email and the nightly pool are bounded by the hard cap only.
 */
async function judge(
  ctx: ActionCtx,
  subject: QualityCheckSubject,
  sourceQuestionId?: Id<"questions">,
): Promise<{ verdict: QualityVerdict; runId: Id<"generationRuns">; model: string }> {
  await ensureAiBudget(ctx, "system");
  const prompts = buildQualityCheckPrompts(subject);
  const runId = await ctx.runMutation(internal.internal.generation.createGenerationRun, {
    purpose: "quality_check",
    styleSlug: subject.style.slug,
    toneSlug: subject.tone.slug,
    topicSlug: subject.topic?.slug,
    batchSize: 1,
    model: QUALITY_CHECK_MODEL,
    provider: GENERATION_PROVIDER,
    temperature: QUALITY_CHECK_TEMPERATURE,
    assembledPrompt: [prompts.systemPrompt, prompts.userPrompt].join("\n\n"),
    sourceQuestionId,
  });

  try {
    const completion = await createChatCompletionWithRetry(ctx, { spendClass: "system", runId }, {
      model: QUALITY_CHECK_MODEL,
      temperature: QUALITY_CHECK_TEMPERATURE,
      max_tokens: QUALITY_CHECK_MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompts.systemPrompt },
        { role: "user", content: prompts.userPrompt },
      ],
    });
    const rawResponse = getChatCompletionContent(completion);
    const verdict = parseQualityVerdict(rawResponse);
    if (!verdict) throw new UnusableOutputError("The quality check's answer couldn't be read", rawResponse);
    await ctx.runMutation(internal.internal.generation.completeGenerationRun, { runId, rawResponse });
    return { verdict, runId, model: completion.model ?? QUALITY_CHECK_MODEL };
  } catch (error) {
    await markRunFailed(ctx, runId, error, "Quality check failed");
    throw error;
  }
}

type CheckOutcome = "checked" | "skipped" | "failed";
/** `unanswered`: the call got no answer in time and kept its reservation, so the next one probably would too. */
type CheckResult = { outcome: CheckOutcome; unanswered: boolean };

/**
 * Judges one question and saves the verdict. `skipped` when there was nothing to judge, or
 * when the verdict wasn't saved because the question changed, was deleted or got a verdict
 * while the judge was reading it. A failure leaves the question exactly as it was.
 */
async function checkOne(ctx: ActionCtx, questionId: Id<"questions">): Promise<CheckResult> {
  const found = await ctx.runQuery(internal.internal.qualityCheckData.questionForCheck, { questionId });
  if (!found) return { outcome: "skipped", unanswered: false };
  try {
    const judged = await judge(ctx, found.subject, questionId);
    const { saved } = await ctx.runMutation(internal.internal.qualityCheckData.saveQualityCheck, {
      questionId,
      read: found.read,
      verdict: judged.verdict,
      model: judged.model,
      promptVersion: QUALITY_CHECK_PROMPT_VERSION,
      runId: judged.runId,
    });
    return { outcome: saved ? "checked" : "skipped", unanswered: false };
  } catch (error) {
    console.warn(`Quality check failed for question ${questionId}: ${error instanceof Error ? error.message : String(error)}`);
    return { outcome: "failed", unanswered: keptAiReservation(error) };
  }
}

/**
 * Checks one generated question. Scheduled when a question is saved, so whoever is waiting
 * for that question waits no longer. A check that fails is tried once more after
 * QUALITY_CHECK_RETRY_DELAY_MS. After a second failure a question waiting in the review queue
 * is picked up by checkPendingQuestions; one that was published at once stays unchecked.
 */
export const checkQuestion = internalAction({
  args: { questionId: v.id("questions"), attempt: v.optional(v.number()) },
  returns: v.union(v.literal("checked"), v.literal("skipped"), v.literal("failed")),
  handler: async (ctx, args): Promise<CheckOutcome> => {
    if (qualityCheckMode() === "off") return "skipped";
    const { outcome } = await checkOne(ctx, args.questionId);
    const attempt = args.attempt ?? 1;
    if (outcome === "failed" && attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(QUALITY_CHECK_RETRY_DELAY_MS, internal.internal.qualityCheck.checkQuestion, {
        questionId: args.questionId,
        attempt: attempt + 1,
      });
    } else if (outcome === "failed") {
      console.warn(`Quality check gave up on question ${args.questionId} after ${MAX_ATTEMPTS} attempts.`);
    }
    return outcome;
  },
});

/** The generated questions waiting in the review queue with no verdict, oldest first, up to `limit`. */
async function heldWithoutCheck(ctx: ActionCtx, limit: number): Promise<Id<"questions">[]> {
  const questionIds: Id<"questions">[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < BACKFILL_MAX_PAGES && questionIds.length < limit; page += 1) {
    const found: { questionIds: Id<"questions">[]; cursor: string; isDone: boolean } = await ctx.runQuery(
      internal.internal.qualityCheckData.heldQuestionsWithoutCheck,
      { limit: limit - questionIds.length, cursor },
    );
    questionIds.push(...found.questionIds);
    if (found.isDone) break;
    cursor = found.cursor;
  }
  return questionIds;
}

/**
 * Checks generated questions that are waiting in the review queue with no verdict: ones saved
 * while the check was off, or whose check failed twice. It doesn't cover questions that were
 * published at once (a matrix fill's or the nightly pool's). With dryRun it only lists them.
 * Up to QUALITY_CHECK_BACKFILL_LIMIT a run, oldest first. A run stops early, leaving the rest
 * as `notReached`, when a call gets no answer or the run has taken
 * QUALITY_CHECK_BACKFILL_TIME_BUDGET_MS. Run it again for more:
 * `npx convex run internal/qualityCheck:checkPendingQuestions '{"dryRun":true}'`.
 */
// gstack-shortcut(dec-73fb363c-9bb6-4c12-95da-fc399eae1f70): a question published at once is never re-checked after two failures, upgrade when the team-facing flag is finished (TODOS.md, Quality check).
export const checkPendingQuestions = internalAction({
  args: { dryRun: v.boolean() },
  returns: v.object({
    questionIds: v.array(v.id("questions")),
    checked: v.number(),
    skipped: v.number(),
    failed: v.number(),
    notReached: v.number(),
  }),
  handler: async (ctx, args) => {
    const questionIds = await heldWithoutCheck(ctx, QUALITY_CHECK_BACKFILL_LIMIT);
    const counts = { checked: 0, skipped: 0, failed: 0 };
    if (args.dryRun) return { questionIds, ...counts, notReached: 0 };
    if (qualityCheckMode() === "off") {
      throw new Error("QUALITY_CHECK_MODE is off on this deployment. Nothing was checked.");
    }
    const startedAt = Date.now();
    let reached = 0;
    for (const questionId of questionIds) {
      if (Date.now() - startedAt > QUALITY_CHECK_BACKFILL_TIME_BUDGET_MS) break;
      const { outcome, unanswered } = await checkOne(ctx, questionId);
      counts[outcome] += 1;
      reached += 1;
      // Like the other batch callers: one unanswered call is paid for, the next probably would be too.
      if (unanswered) break;
    }
    const totals = { ...counts, notReached: questionIds.length - reached };
    console.log(`checkPendingQuestions total: ${JSON.stringify(totals)}`);
    return { questionIds, ...totals };
  },
});

/**
 * The same check on questions given as text, for measuring it against the owner's labels
 * (evals/judge.mjs). Nothing is saved on any question. Runs only where EVALS_ENABLED is set
 * (dev), and is charged to that deployment's system budget. After a call that gets no answer
 * the rest are reported as not sent.
 */
export const evalQualityCheck = internalAction({
  args: {
    items: v.array(qualityCheckSubject),
  },
  returns: v.object({
    model: v.string(),
    promptVersion: v.number(),
    results: v.array(
      v.object({
        text: v.string(),
        verdict: v.optional(qualityVerdict),
        wouldPublish: v.optional(v.boolean()),
        wouldFlag: v.optional(v.boolean()),
        error: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    if (args.items.length > EVAL_MAX_ITEMS) throw new Error(`Pass at most ${EVAL_MAX_ITEMS} questions a call.`);
    const results: Array<{ text: string; verdict?: QualityVerdict; wouldPublish?: boolean; wouldFlag?: boolean; error?: string }> = [];
    let unanswered = false;
    for (const item of args.items) {
      if (unanswered) {
        results.push({ text: item.text, error: "Not sent: an earlier call in this batch got no answer" });
        continue;
      }
      try {
        const { verdict } = await judge(ctx, item);
        results.push({ text: item.text, verdict, wouldPublish: wouldPublish(verdict), wouldFlag: flagsQuestion(verdict) });
      } catch (error) {
        results.push({ text: item.text, error: error instanceof Error ? error.message : String(error) });
        unanswered = keptAiReservation(error);
      }
    }
    return { model: QUALITY_CHECK_MODEL, promptVersion: QUALITY_CHECK_PROMPT_VERSION, results };
  },
});
