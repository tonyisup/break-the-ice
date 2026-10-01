import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { assertEvalsEnabled, evalDefinitionsResult } from "../lib/evalChecks";
import { isQuestionPublic } from "../lib/questionAccess";

/** Jev reads these next to each question, and gets less accurate as its input grows. */
const MAX_DEFINITION_CHARS = 300;

/** Questions read per page when measuring the library, to stay well within a query's limits. */
const LIBRARY_PAGE_SIZE = 500;

function shortDefinition(parts: Array<string | undefined>): string {
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.length > MAX_DEFINITION_CHARS ? `${text.slice(0, MAX_DEFINITION_CHARS - 1)}…` : text;
}

/** The shared library a duplicate check searches: public, global, non-personal questions with text. */
function isSharedLibraryQuestion(question: Doc<"questions">): boolean {
  return Boolean(question.text) && !question.authorId && !question.organizationId && !question.duplicateOf && isQuestionPublic(question);
}

/**
 * Short definitions of the exact style, tone and topic versions a prompt was built from, using
 * the fields the generator is given, so Jev judges fit against what the model was asked to do.
 */
export const evalDefinitions = internalQuery({
  args: { styleId: v.id("styles"), toneId: v.id("tones"), topicId: v.optional(v.id("topics")) },
  returns: evalDefinitionsResult,
  handler: async (ctx, args) => {
    assertEvalsEnabled();
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
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    return await Promise.all(
      args.fingerprints.map(async (fingerprint) => {
        const existing = await ctx.db
          .query("questions")
          .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
          .take(2);
        return existing.length;
      }),
    );
  },
});

/**
 * The text of each question that is in the shared library, in the order given; null for
 * missing, personal, team and non-public questions.
 */
export const publicLibraryTexts = internalQuery({
  args: { questionIds: v.array(v.id("questions")) },
  returns: v.array(v.union(v.null(), v.string())),
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    return await Promise.all(
      args.questionIds.map(async (questionId) => {
        const question = await ctx.db.get(questionId);
        return question && isSharedLibraryQuestion(question) ? question.text! : null;
      }),
    );
  },
});

/**
 * One page of the library-size count: how many shared library questions the page holds and how
 * many of those have an embedding (so the duplicate search can find them). The evalLibraryStats
 * action adds the pages up.
 */
export const evalLibraryPage = internalQuery({
  args: { cursor: v.union(v.null(), v.string()) },
  returns: v.object({ publicQuestions: v.number(), withEmbedding: v.number(), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    assertEvalsEnabled();
    const page = await ctx.db.query("questions").paginate({ numItems: LIBRARY_PAGE_SIZE, cursor: args.cursor });
    const library = page.page.filter(isSharedLibraryQuestion);
    const embedded = await Promise.all(
      library.map((question) =>
        ctx.db
          .query("question_embeddings")
          .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
          .first(),
      ),
    );
    return {
      publicQuestions: library.length,
      withEmbedding: embedded.filter(Boolean).length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Every generation run an eval run made since it started, oldest first, including the retries
 * the generator makes inside one call. Runs are tagged `eval:<run>:<seed>`.
 */
export const evalRunAttempts = internalQuery({
  args: { runLabel: v.string(), since: v.number(), until: v.optional(v.number()) },
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
    // Only this eval run's rows (a few per seed), found by the tag's prefix, then the time window.
    const runs = await ctx.db
      .query("generationRuns")
      .withIndex("by_requestedByUserId", (q) => q.gte("requestedByUserId", prefix).lt("requestedByUserId", `${prefix}\uffff`))
      .collect();
    return runs
      .filter((run) => run._creationTime >= args.since && (args.until === undefined || run._creationTime <= args.until))
      .sort((a, b) => a._creationTime - b._creationTime)
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
