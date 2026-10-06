"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureAiBudget } from "../lib/aiSpendGuard";
import { assertEvalsEnabled } from "../lib/evalChecks";
import { GENERATION_PROVIDER, createChatCompletionWithRetry, getChatCompletionContent } from "../lib/generationRunner";
import {
  QUALITY_CHECK_MAX_OUTPUT_TOKENS,
  QUALITY_CHECK_MODEL,
  QUALITY_CHECK_PROMPT_VERSION,
  QUALITY_CHECK_TEMPERATURE,
  buildQualityCheckPrompts,
  parseQualityVerdict,
  qualityCheckMode,
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
/** The most questions one eval call judges, so the action stays well inside its time limit. */
const EVAL_MAX_ITEMS = 25;

const definition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });

/**
 * One call to the judge, through the daily budget like any generation call and recorded as a
 * `quality_check` run. Throws when the budget is paused, the provider fails or the answer
 * can't be read: there is never a guessed verdict.
 */
async function judge(
  ctx: ActionCtx,
  subject: QualityCheckSubject,
  sourceQuestionId?: Id<"questions">,
): Promise<{ verdict: QualityVerdict; runId: Id<"generationRuns">; model: string }> {
  // The owner's check, whoever's request generated the question: system spend.
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

  let rawResponse: string | undefined;
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
    rawResponse = getChatCompletionContent(completion);
    const verdict = parseQualityVerdict(rawResponse);
    if (!verdict) throw new Error("The quality check's answer couldn't be read");
    await ctx.runMutation(internal.internal.generation.completeGenerationRun, { runId, rawResponse });
    return { verdict, runId, model: completion.model ?? QUALITY_CHECK_MODEL };
  } catch (error) {
    try {
      await ctx.runMutation(internal.internal.generation.failGenerationRun, {
        runId,
        error: error instanceof Error ? error.message : "Quality check failed",
        rawResponse,
      });
    } catch (writeError) {
      console.error("Failed to mark the quality check's run as failed", writeError);
    }
    throw error;
  }
}

type CheckOutcome = "checked" | "skipped" | "failed";

/** Judges one question and saves the verdict. A failure leaves the question exactly as it was. */
async function checkOne(ctx: ActionCtx, questionId: Id<"questions">): Promise<CheckOutcome> {
  const subject = await ctx.runQuery(internal.internal.qualityCheckData.questionForCheck, { questionId });
  if (!subject) return "skipped";
  try {
    const judged = await judge(ctx, subject, questionId);
    await ctx.runMutation(internal.internal.qualityCheckData.saveQualityCheck, {
      questionId,
      verdict: judged.verdict,
      model: judged.model,
      promptVersion: QUALITY_CHECK_PROMPT_VERSION,
      runId: judged.runId,
    });
    return "checked";
  } catch (error) {
    console.warn(`Quality check failed for question ${questionId}: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

/**
 * Checks one generated question. Scheduled when a question is saved, so whoever is waiting
 * for that question waits no longer. A check that fails is tried once more after
 * QUALITY_CHECK_RETRY_DELAY_MS; after that the question waits for checkPendingQuestions.
 */
export const checkQuestion = internalAction({
  args: { questionId: v.id("questions"), attempt: v.optional(v.number()) },
  returns: v.union(v.literal("checked"), v.literal("skipped"), v.literal("failed")),
  handler: async (ctx, args): Promise<CheckOutcome> => {
    if (qualityCheckMode() === "off") return "skipped";
    const outcome = await checkOne(ctx, args.questionId);
    const attempt = args.attempt ?? 1;
    if (outcome === "failed" && attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(QUALITY_CHECK_RETRY_DELAY_MS, internal.internal.qualityCheck.checkQuestion, {
        questionId: args.questionId,
        attempt: attempt + 1,
      });
    }
    return outcome;
  },
});

/**
 * Checks generated questions that are waiting for review with no verdict: ones saved while
 * the check was off, or whose check failed twice. With dryRun it only lists them. Up to
 * QUALITY_CHECK_BACKFILL_LIMIT a run, oldest first; run it again for more:
 * `npx convex run internal/qualityCheck:checkPendingQuestions '{"dryRun":true}'`.
 */
export const checkPendingQuestions = internalAction({
  args: { dryRun: v.boolean() },
  returns: v.object({
    questionIds: v.array(v.id("questions")),
    checked: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args): Promise<{ questionIds: Id<"questions">[]; checked: number; skipped: number; failed: number }> => {
    const questionIds: Id<"questions">[] = await ctx.runQuery(internal.internal.qualityCheckData.heldQuestionsWithoutCheck, {
      limit: QUALITY_CHECK_BACKFILL_LIMIT,
    });
    const counts = { checked: 0, skipped: 0, failed: 0 };
    if (args.dryRun) return { questionIds, ...counts };
    if (qualityCheckMode() === "off") {
      throw new Error("QUALITY_CHECK_MODE is off on this deployment. Nothing was checked.");
    }
    for (const questionId of questionIds) counts[await checkOne(ctx, questionId)] += 1;
    console.log(`checkPendingQuestions total: ${JSON.stringify(counts)}`);
    return { questionIds, ...counts };
  },
});

/**
 * The same check on questions given as text, for measuring it against the owner's labels
 * (evals/judge.mjs). Nothing is saved on any question. Runs only where EVALS_ENABLED is set
 * (dev), and is charged to that deployment's system budget.
 */
export const evalQualityCheck = internalAction({
  args: {
    items: v.array(v.object({ text: v.string(), style: definition, tone: definition, topic: v.union(v.null(), definition) })),
  },
  returns: v.object({
    model: v.string(),
    promptVersion: v.number(),
    results: v.array(
      v.object({
        text: v.string(),
        verdict: v.optional(qualityVerdict),
        wouldPublish: v.optional(v.boolean()),
        error: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    if (args.items.length > EVAL_MAX_ITEMS) throw new Error(`Pass at most ${EVAL_MAX_ITEMS} questions a call.`);
    const results: Array<{ text: string; verdict?: QualityVerdict; wouldPublish?: boolean; error?: string }> = [];
    for (const item of args.items) {
      try {
        const { verdict } = await judge(ctx, item);
        results.push({ text: item.text, verdict, wouldPublish: wouldPublish(verdict) });
      } catch (error) {
        results.push({ text: item.text, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { model: QUALITY_CHECK_MODEL, promptVersion: QUALITY_CHECK_PROMPT_VERSION, results };
  },
});
