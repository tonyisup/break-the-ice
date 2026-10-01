"use node";

import { createHash } from "node:crypto";
import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertEvalsEnabled, checkEvalCandidates, evalDefinitionsResult, evalFingerprint } from "../lib/evalChecks";
import {
  DEFAULT_GENERATION_TEMPERATURE,
  GENERATION_MODEL,
  UNUSABLE_OUTPUT_ATTEMPTS,
  maxOutputTokens,
  runPreviewQuestionGeneration,
} from "../lib/generationRunner";
import { embed } from "../lib/retriever";

const DEFAULT_NEIGHBOURS = 5;
// Personal, team and unpublished rows are dropped after the search, so search wider than needed,
// and widen to vectorSearch's maximum when held-for-review questions crowd the public ones out.
const NEIGHBOUR_SEARCH_LIMITS = [40, 256];

const taxonomyRef = v.object({ slug: v.string(), version: v.number(), name: v.string() });
const neighbour = v.object({ questionId: v.id("questions"), text: v.string(), cosine: v.number() });

const evalBatch = v.object({
  runId: v.id("generationRuns"),
  model: v.string(),
  temperature: v.number(),
  /**
   * Settings the deployed code used, so a run made against stale or different code on dev shows
   * up as a different setup even when the local commit looks the same.
   */
  settings: v.object({ maxOutputTokens: v.number(), unusableOutputAttempts: v.number(), neighbours: v.number() }),
  /** The system and user prompt the model got, hashed, so runs can tell a prompt change from noise. */
  promptHash: v.string(),
  blueprint: v.object({ slug: v.string(), version: v.number() }),
  style: taxonomyRef,
  tone: taxonomyRef,
  topic: v.union(v.null(), taxonomyRef),
  definitions: evalDefinitionsResult,
  /** Questions whose fingerprint matches more than one library row: the real save step would throw. */
  fingerprintCollisions: v.number(),
  candidates: v.array(
    v.object({
      text: v.string(),
      outcome: v.union(v.literal("saved"), v.literal("duplicate"), v.literal("rejected")),
      duplicateOf: v.union(v.null(), v.literal("batch"), v.literal("library")),
      codeRejections: v.array(v.string()),
      neighbours: v.array(neighbour),
      neighbourError: v.union(v.null(), v.string()),
    }),
  ),
});
type EvalBatch = Infer<typeof evalBatch>;
type Neighbour = Infer<typeof neighbour>;

/** The closest questions in the shared library by embedding, with their cosine similarity. */
async function nearestLibraryQuestions(ctx: ActionCtx, text: string, count: number): Promise<Neighbour[]> {
  const vector = await embed(text);
  let neighbours: Neighbour[] = [];
  for (const limit of NEIGHBOUR_SEARCH_LIMITS) {
    const results = await ctx.vectorSearch("question_embeddings", "by_embedding", { vector, limit });
    const questionIds = await ctx.runQuery(internal.internal.questions.getQuestionIdsByEmbeddingRowIds, {
      embeddingRowIds: results.map((result) => result._id),
    });
    const found = results.flatMap((result, i) => {
      const questionId = questionIds[i];
      return questionId ? [{ questionId, cosine: result._score }] : [];
    });
    const texts = await ctx.runQuery(internal.internal.evalData.publicLibraryTexts, {
      questionIds: found.map((row) => row.questionId),
    });
    const seen = new Set<string>();
    neighbours = [];
    found.forEach((row, i) => {
      const neighbourText = texts[i];
      if (neighbourText === null || seen.has(row.questionId) || neighbours.length >= count) return;
      seen.add(row.questionId);
      neighbours.push({ questionId: row.questionId, text: neighbourText, cosine: row.cosine });
    });
    if (neighbours.length >= count) break;
  }
  return neighbours;
}

/**
 * One eval batch: today's prompt builder and model, run like an admin preview so nothing is
 * added to the library. Returns each question with what the save step would have done with it
 * and its nearest library questions, for the harness in `evals/` to score. Runs only where
 * EVALS_ENABLED is set (dev).
 */
export const generateEvalBatch = internalAction({
  args: {
    runLabel: v.string(),
    /** Tags this batch's generation runs as `eval:<runLabel>:<seedId>`, so its attempts can be counted. */
    seedId: v.string(),
    styleSlug: v.string(),
    toneSlug: v.string(),
    topicSlug: v.optional(v.string()),
    batchSize: v.number(),
    temperature: v.optional(v.number()),
    /** Library neighbours per question; 0 skips the search. Capped by the widest search. */
    neighbours: v.optional(v.number()),
  },
  returns: evalBatch,
  handler: async (ctx, args): Promise<EvalBatch> => {
    assertEvalsEnabled();
    const temperature = args.temperature ?? DEFAULT_GENERATION_TEMPERATURE;
    // A seed naming a missing style, tone or topic fails while the prompt is built, before any
    // run row or spend.
    const preview = await runPreviewQuestionGeneration(ctx, {
      requestedByUserId: `eval:${args.runLabel}:${args.seedId}`,
      styleSlug: args.styleSlug,
      toneSlug: args.toneSlug,
      topicSlug: args.topicSlug,
      batchSize: args.batchSize,
      temperature,
      spendClass: "system",
    });
    const { prompt } = preview;
    const definitions = await ctx.runQuery(internal.internal.evalData.evalDefinitions, {
      styleId: prompt.style._id,
      toneId: prompt.tone._id,
      topicId: prompt.topic?._id,
    });

    const fingerprints = preview.previewTexts.map(evalFingerprint);
    const matches = await ctx.runQuery(internal.internal.evalData.libraryFingerprintMatches, { fingerprints });
    const checks = checkEvalCandidates(preview.previewTexts, new Set(fingerprints.filter((_, i) => matches[i] > 0)));

    const neighbourCount = args.neighbours ?? DEFAULT_NEIGHBOURS;
    const candidates = [];
    for (const { fingerprint: _fingerprint, ...check } of checks) {
      let neighbours: Neighbour[] = [];
      let neighbourError: string | null = null;
      if (neighbourCount > 0) {
        // The generation is already paid for, so a failed search keeps the batch and says so.
        try {
          neighbours = await nearestLibraryQuestions(ctx, check.text, neighbourCount);
        } catch (error) {
          neighbourError = error instanceof Error ? error.message : String(error);
        }
      }
      candidates.push({ ...check, neighbours, neighbourError });
    }

    return {
      runId: preview.runId,
      model: GENERATION_MODEL,
      temperature,
      settings: {
        maxOutputTokens: maxOutputTokens(prompt.batchSize),
        unusableOutputAttempts: UNUSABLE_OUTPUT_ATTEMPTS,
        neighbours: neighbourCount,
      },
      promptHash: createHash("sha256").update(`${prompt.systemPrompt}\n\n${prompt.userPrompt}`).digest("hex").slice(0, 16),
      blueprint: { slug: prompt.blueprint.slug, version: prompt.blueprint.version },
      style: { slug: prompt.style.slug, version: prompt.style.version, name: prompt.style.name },
      tone: { slug: prompt.tone.slug, version: prompt.tone.version, name: prompt.tone.name },
      topic: prompt.topic ? { slug: prompt.topic.slug, version: prompt.topic.version, name: prompt.topic.name } : null,
      definitions,
      fingerprintCollisions: matches.filter((count) => count > 1).length,
      candidates,
    };
  },
});
