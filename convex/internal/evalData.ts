import { ConvexError, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { assertEvalsEnabled } from "../lib/evalChecks";
import { isQuestionPublic } from "../lib/questionAccess";

/** Jev reads these next to each question, and gets less accurate as its input grows. */
const MAX_DEFINITION_CHARS = 300;

function shortDefinition(parts: Array<string | undefined>): string {
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.length > MAX_DEFINITION_CHARS ? `${text.slice(0, MAX_DEFINITION_CHARS - 1)}…` : text;
}


const definition = v.object({ slug: v.string(), name: v.string(), definition: v.string() });

/**
 * Short definitions of the exact style, tone and topic versions a prompt was built from, using
 * the fields the generator is given, so Jev judges fit against what the model was asked to do.
 */
export const evalDefinitions = internalQuery({
  args: { styleId: v.id("styles"), toneId: v.id("tones"), topicId: v.optional(v.id("topics")) },
  returns: v.object({ style: definition, tone: definition, topic: v.union(v.null(), definition) }),
  handler: async (ctx, args) => {
    const [style, tone, topic] = await Promise.all([
      ctx.db.get(args.styleId),
      ctx.db.get(args.toneId),
      args.topicId ? ctx.db.get(args.topicId) : Promise.resolve(null),
    ]);
    if (!style || !tone || (args.topicId && !topic)) {
      throw new ConvexError({ code: "EVAL_SETUP", message: "The style, tone or topic a prompt was built from no longer exists." });
    }
    // The prompt shows a style's `examples` (not the legacy single `example`) and no topic examples.
    const styleExample = style.examples?.[0]?.text;
    return {
      style: {
        slug: style.slug ?? style.id,
        name: style.name,
        definition: shortDefinition([
          style.description,
          `Structure: ${style.structuralInstruction ?? style.structure}`,
          styleExample ? `Example: ${styleExample}` : undefined,
        ]),
      },
      tone: {
        slug: tone.slug ?? tone.id,
        name: tone.name,
        definition: shortDefinition([
          tone.description ?? tone.aiGuidance ?? tone.promptGuidanceForAI,
          tone.languageCues?.length ? `Sounds: ${tone.languageCues.join(", ")}.` : undefined,
        ]),
      },
      topic: topic
        ? {
            slug: topic.slug ?? topic.id,
            name: topic.name,
            definition: shortDefinition([
              topic.description,
              topic.scopeBoundaries?.length ? `Covers: ${topic.scopeBoundaries.join(", ")}.` : undefined,
            ]),
          }
        : null,
    };
  },
});

/**
 * How many questions already have each fingerprint (0, 1, or 2 for "more than one"). The save
 * step treats one as a duplicate and throws on more than one, failing the whole batch.
 */
export const libraryFingerprintMatches = internalQuery({
  args: { fingerprints: v.array(v.string()) },
  returns: v.array(v.number()),
  handler: async (ctx, args) =>
    await Promise.all(
      args.fingerprints.map(async (fingerprint) => {
        const existing = await ctx.db
          .query("questions")
          .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
          .take(2);
        return existing.length;
      }),
    ),
});

/**
 * The text of each question that is in the shared library, in the order given; null for
 * missing, personal, team and non-public questions.
 */
export const publicLibraryTexts = internalQuery({
  args: { questionIds: v.array(v.id("questions")) },
  returns: v.array(v.union(v.null(), v.string())),
  handler: async (ctx, args) =>
    await Promise.all(
      args.questionIds.map(async (questionId) => {
        const question = await ctx.db.get(questionId);
        if (!question || !question.text || question.authorId || question.organizationId) return null;
        return isQuestionPublic(question) && !question.duplicateOf ? question.text : null;
      }),
    ),
});

/**
 * The size of the shared library a run's duplicate check searched. Recorded with each run, since
 * the dev library changes and a duplicate rate means little without it.
 */
export const evalLibraryStats = internalQuery({
  args: {},
  returns: v.object({ publicQuestions: v.number(), withEmbedding: v.number() }),
  handler: async (ctx) => {
    assertEvalsEnabled();
    const questions = await ctx.db.query("questions").collect();
    const library = questions.filter(
      (question) =>
        question.text && !question.authorId && !question.organizationId && !question.duplicateOf && isQuestionPublic(question),
    );
    const embedded = await Promise.all(
      library.map((question) =>
        ctx.db
          .query("question_embeddings")
          .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
          .first(),
      ),
    );
    return { publicQuestions: library.length, withEmbedding: embedded.filter(Boolean).length };
  },
});

/**
 * Every generation run an eval run made since it started, oldest first, including the retries
 * the generator makes inside one call. Runs are tagged `eval:<run>:<seed>`.
 */
export const evalRunAttempts = internalQuery({
  args: { runLabel: v.string(), since: v.number() },
  returns: v.array(
    v.object({
      runId: v.id("generationRuns"),
      seedId: v.string(),
      status: v.string(),
      error: v.union(v.null(), v.string()),
      resolvedModel: v.union(v.null(), v.string()),
      costUsd: v.union(v.null(), v.number()),
      completionTokens: v.union(v.null(), v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    const prefix = `eval:${args.runLabel}:`;
    const runs = await ctx.db
      .query("generationRuns")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.since))
      .collect();
    return runs
      .filter((run) => run.requestedByUserId?.startsWith(prefix))
      .map((run) => ({
        runId: run._id,
        seedId: run.requestedByUserId!.slice(prefix.length),
        status: run.status,
        error: run.error ?? null,
        resolvedModel: run.resolvedModel ?? null,
        costUsd: run.costUsd ?? null,
        completionTokens: run.completionTokens ?? null,
      }));
  },
});
