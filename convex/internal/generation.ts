import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, internalQuery, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  BRIEF_KEPT_EXAMPLES,
  BRIEF_OTHER_STYLE_EXAMPLES,
  BRIEF_PROMPT_LABEL,
  BRIEF_REJECTED_EXAMPLES,
  buildBriefPrompts,
  seededRandom,
  shuffled,
  type BriefExamples,
} from "../lib/brief";
import {
  clampBatchSize,
  fingerprintText,
  normalizeQuestion,
  validateGeneratedQuestion,
} from "../lib/promptArchitecture";
import { qualityCheckMode } from "../lib/qualityCheck";
import { isQuestionPublic, isUserWrittenQuestion } from "../lib/questionAccess";
import { byLatestVersion, latestActiveVersion } from "../lib/taxonomy";

async function getLatestActiveBySlug(
  ctx: QueryCtx,
  table: "styles",
  slug: string,
): Promise<Doc<"styles">>;
async function getLatestActiveBySlug(
  ctx: QueryCtx,
  table: "tones",
  slug: string,
): Promise<Doc<"tones">>;
async function getLatestActiveBySlug(
  ctx: QueryCtx,
  table: "topics",
  slug: string,
): Promise<Doc<"topics">>;
async function getLatestActiveBySlug(
  ctx: QueryCtx,
  table: "styles" | "tones" | "topics",
  slug: string,
): Promise<Doc<"styles"> | Doc<"tones"> | Doc<"topics">> {
  // The three tables share these indexes and fields; "styles" stands in for whichever it is.
  const bySlug = await ctx.db
    .query(table as "styles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  // Legacy style, tone and topic rows may carry only the old `id` field.
  const byLegacyId = await ctx.db.query(table as "styles").withIndex("by_my_id", (q) => q.eq("id", slug)).collect();
  const docs: Array<Doc<"styles"> | Doc<"tones"> | Doc<"topics">> = [
    ...new Map([...bySlug, ...byLegacyId].map((doc) => [doc._id, doc])).values(),
  ];

  const latest = docs
    .filter((doc) => (doc.status ?? "active") === "active")
    .sort(byLatestVersion)[0];

  if (!latest) {
    throw new ConvexError(`No active ${table} entry found for slug "${slug}".`);
  }

  return latest;
}

type TaxonomyTable = "styles" | "tones" | "topics";
type TaxonomyDoc = Doc<"styles"> | Doc<"tones"> | Doc<"topics">;

/**
 * The latest active version of the entry an id points to. Versions of one entry share
 * a slug (legacy rows only an `id`), so both are searched, within the same
 * organization. An id is only a way to find the entry: prompts must never be built
 * from a draft or archived version, which is why they said "Good examples: none".
 * Returns null when the id doesn't exist or the entry has no active version.
 */
async function getLatestActiveSibling(
  ctx: QueryCtx,
  table: TaxonomyTable,
  id: Id<TaxonomyTable>,
): Promise<TaxonomyDoc | null> {
  const doc = (await ctx.db.get(id)) as TaxonomyDoc | null;
  if (!doc) return null;
  const key = doc.slug ?? doc.id;
  const query = ctx.db.query(table as "styles");
  const [bySlug, byLegacyId] = await Promise.all([
    query.withIndex("by_slug", (q) => q.eq("slug", key)).collect(),
    ctx.db.query(table as "styles").withIndex("by_my_id", (q) => q.eq("id", key)).collect(),
  ]);
  const siblings = new Map<string, TaxonomyDoc>();
  for (const sibling of [...bySlug, ...byLegacyId] as TaxonomyDoc[]) siblings.set(sibling._id, sibling);
  return (
    [...siblings.values()]
      .filter((sibling) => sibling.organizationId === doc.organizationId)
      .filter((sibling) => (sibling.status ?? "active") === "active")
      .sort(byLatestVersion)[0] ?? null
  );
}

async function getTaxonomyDoc(
  ctx: QueryCtx,
  table: "styles",
  args: { id?: Id<"styles">; slug?: string } | undefined,
): Promise<Doc<"styles"> | null>;
async function getTaxonomyDoc(
  ctx: QueryCtx,
  table: "tones",
  args: { id?: Id<"tones">; slug?: string } | undefined,
): Promise<Doc<"tones"> | null>;
async function getTaxonomyDoc(
  ctx: QueryCtx,
  table: "topics",
  args: { id?: Id<"topics">; slug?: string } | undefined,
): Promise<Doc<"topics"> | null>;
async function getTaxonomyDoc(
  ctx: QueryCtx,
  table: TaxonomyTable,
  args: { id?: Id<"styles"> | Id<"tones"> | Id<"topics">; slug?: string } | undefined,
) {
  if (!args?.id && !args?.slug) {
    return null;
  }

  if (args?.id) {
    const doc = await ctx.db.get(args.id as Id<TaxonomyTable>);
    if (doc) {
      const active = await getLatestActiveSibling(ctx, table, args.id as Id<TaxonomyTable>);
      if (!active) {
        throw new ConvexError(`No active ${table} entry found for slug "${doc.slug ?? doc.id}".`);
      }
      return active;
    }
  }

  if (args?.slug) {
    return await getLatestActiveBySlug(ctx, table as any, args.slug);
  }

  return null;
}

/** For remix: the active version of a question's stored style, tone or topic, or null. */
export const getActiveTaxonomyById = internalQuery({
  args: {
    table: v.union(v.literal("styles"), v.literal("tones"), v.literal("topics")),
    id: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId(args.table, args.id);
    return id ? await getLatestActiveSibling(ctx, args.table, id) : null;
  },
});

/** Public questions read per version of a style, for each of the three statuses a public question can have. */
const EXAMPLE_POOL = 200;
/** How far back the rejected examples look, in retired questions of the style. */
const REJECTED_LOOKBACK = 60;
/** Public questions read per version of another style, to find one from the shared library. */
const OTHER_STYLE_POOL = 30;

/**
 * The owner's decisions the brief shows for a style, read from the library: public questions
 * of the style, retired ones a reviewer gave a reason for, and one public question from each of
 * a few other live styles. Only the shared library counts, never a team's or a person's
 * questions. Which ones are shown is drawn with `sampleSeed`, so one seed gives one prompt.
 */
async function readBriefExamples(
  ctx: QueryCtx,
  style: Doc<"styles">,
  sampleSeed: number,
  withoutRejected = false,
): Promise<BriefExamples> {
  const random = seededRandom(sampleSeed);
  const slugOf = (row: Doc<"styles">) => row.slug ?? row.id;
  // Never a team's or a person's question, and never a copy that was retired as a duplicate.
  const inSharedLibrary = (question: Doc<"questions">) =>
    Boolean(question.text) && !isUserWrittenQuestion(question) && !question.duplicateOf;
  // A question keeps the id of the style version it was written for, so every version of a
  // style is searched. The styles table is a few dozen rows.
  const allStyles = await ctx.db.query("styles").collect();
  const versionsOf = (slug: string, organizationId: Doc<"styles">["organizationId"]) =>
    allStyles.filter((row) => slugOf(row) === slug && row.organizationId === organizationId);
  const questionsOf = async (rows: Doc<"styles">[], statuses: Array<Doc<"questions">["status"]>, count: number) => {
    const pages = await Promise.all(
      rows.flatMap((row) =>
        statuses.map((status) =>
          ctx.db
            .query("questions")
            .withIndex("by_styleId_status", (q) => q.eq("styleId", row._id).eq("status", status))
            .order("desc")
            .take(count),
        ),
      ),
    );
    return pages.flat().filter(inSharedLibrary);
  };
  // A public question is one the lists show: older rows are public with "approved" or no status.
  const publicOf = async (rows: Doc<"styles">[], count: number) =>
    (await questionsOf(rows, ["public", "approved", undefined], count)).filter(isQuestionPublic);

  const ownVersions = versionsOf(slugOf(style), style.organizationId);
  const kept = shuffled(await publicOf(ownVersions, EXAMPLE_POOL), random)
    .slice(0, BRIEF_KEPT_EXAMPLES)
    .map((question) => question.text ?? "");

  const retired = withoutRejected
    ? []
    : (await questionsOf(ownVersions, ["pruned"], REJECTED_LOOKBACK))
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, REJECTED_LOOKBACK);
  const withReasons = (
    await Promise.all(
      retired.map(async (question) => {
        const reviews = await ctx.db
          .query("pruning")
          .withIndex("by_questionId_and_status", (q) => q.eq("questionId", question._id).eq("status", "approved"))
          .collect();
        const reasons = [...new Set(reviews.flatMap((review) => review.editorialReasons ?? []))];
        return reasons.length ? [{ text: question.text ?? "", reasons }] : [];
      }),
    )
  ).flat();
  const rejected = shuffled(withReasons, random).slice(0, BRIEF_REJECTED_EXAMPLES);

  const otherLiveSlugs = [
    ...new Set(allStyles.filter((row) => !row.organizationId && (row.status ?? "active") === "active").map(slugOf)),
  ]
    .filter((slug) => slug !== slugOf(style))
    .sort();
  const otherStyles: BriefExamples["otherStyles"] = [];
  for (const slug of shuffled(otherLiveSlugs, random)) {
    if (otherStyles.length === BRIEF_OTHER_STYLE_EXAMPLES) break;
    const versions = versionsOf(slug, undefined);
    const pool = await publicOf(versions, OTHER_STYLE_POOL);
    if (pool.length === 0) continue;
    const picked = pool[Math.floor(random() * pool.length)];
    otherStyles.push({ text: picked.text ?? "", style: latestActiveVersion(versions)?.name ?? slug });
  }

  return { kept, rejected, otherStyles };
}

export const buildGenerationPrompt = internalQuery({
  args: {
    styleId: v.optional(v.id("styles")),
    styleSlug: v.optional(v.string()),
    toneId: v.optional(v.id("tones")),
    toneSlug: v.optional(v.string()),
    topicId: v.optional(v.id("topics")),
    topicSlug: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    excludedQuestions: v.optional(v.array(v.string())),
    currentQuestion: v.optional(v.string()),
    userContext: v.optional(v.string()),
    /** Draws which of the owner's decisions the prompt shows. The calling action picks it at random. */
    sampleSeed: v.optional(v.number()),
    /**
     * Leaves the owner's rejections and their reasons out. A team's preview sets it: its notes
     * are the team's own words and its answer goes straight back to the team.
     */
    withoutRejected: v.optional(v.boolean()),
  },
  returns: v.object({
    batchSize: v.number(),
    systemPrompt: v.string(),
    userPrompt: v.string(),
    promptLabel: v.string(),
    style: v.object({
      _id: v.id("styles"),
      slug: v.string(),
      version: v.number(),
      name: v.string(),
      /** The style has a set form, so the save step lets its short questions through. */
      setForm: v.boolean(),
    }),
    tone: v.object({
      _id: v.id("tones"),
      slug: v.string(),
      version: v.number(),
      name: v.string(),
    }),
    topic: v.union(
      v.null(),
      v.object({
        _id: v.id("topics"),
        slug: v.string(),
        version: v.number(),
        name: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const batchSize = clampBatchSize(args.batchSize ?? 1);

    const [style, tone, topic] = await Promise.all([
      getTaxonomyDoc(ctx, "styles", { id: args.styleId, slug: args.styleSlug }),
      getTaxonomyDoc(ctx, "tones", { id: args.toneId, slug: args.toneSlug }),
      getTaxonomyDoc(ctx, "topics", { id: args.topicId, slug: args.topicSlug }),
    ]);

    if (!style || !tone) {
      throw new ConvexError("Style and tone are required to build a generation prompt.");
    }

    const prompts = buildBriefPrompts({
      style,
      tone,
      topic,
      batchSize,
      examples: await readBriefExamples(ctx, style, args.sampleSeed ?? 0, args.withoutRejected ?? false),
      seen: [...(args.excludedQuestions ?? []), ...(args.currentQuestion ? [args.currentQuestion] : [])],
      notes: args.userContext,
    });

    return {
      batchSize,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      promptLabel: BRIEF_PROMPT_LABEL,
      style: {
        _id: style._id,
        slug: style.slug ?? style.id,
        version: style.version ?? 1,
        name: style.name,
        setForm: Boolean(style.form?.trim()),
      },
      tone: {
        _id: tone._id,
        slug: tone.slug ?? tone.id,
        version: tone.version ?? 1,
        name: tone.name,
      },
      topic: topic
        ? {
            _id: topic._id,
            slug: topic.slug ?? topic.id,
            version: topic.version ?? 1,
            name: topic.name,
          }
        : null,
    };
  },
});

export const createGenerationRun = internalMutation({
  args: {
    purpose: v.union(
      v.literal("feed"),
      v.literal("admin_preview"),
      v.literal("admin_accept"),
      v.literal("nightly_pool"),
      v.literal("newsletter"),
      v.literal("remix"),
      v.literal("quality_check"),
    ),
    requestedByUserId: v.optional(v.string()),
    // No caller sends one since the short brief. Still accepted, for an action that started
    // before a deploy and creates its run after it.
    blueprintId: v.optional(v.id("promptBlueprints")),
    promptLabel: v.optional(v.string()),
    styleId: v.optional(v.id("styles")),
    toneId: v.optional(v.id("tones")),
    topicId: v.optional(v.id("topics")),
    styleSlug: v.optional(v.string()),
    toneSlug: v.optional(v.string()),
    topicSlug: v.optional(v.string()),
    styleVersion: v.optional(v.number()),
    toneVersion: v.optional(v.number()),
    topicVersion: v.optional(v.number()),
    batchSize: v.number(),
    model: v.string(),
    provider: v.optional(v.string()),
    temperature: v.number(),
    assembledPrompt: v.string(),
    sourceQuestionId: v.optional(v.id("questions")),
  },
  returns: v.id("generationRuns"),
  handler: async (ctx, args) => {
    // Only a check has neither: a generation's run always says what wrote its prompt.
    if (args.purpose !== "quality_check" && !args.promptLabel && !args.blueprintId) {
      throw new Error(`A ${args.purpose} run needs its prompt label`);
    }
    return await ctx.db.insert("generationRuns", {
      status: "running",
      purpose: args.purpose,
      requestedByUserId: args.requestedByUserId,
      blueprintId: args.blueprintId,
      promptLabel: args.promptLabel,
      styleId: args.styleId,
      toneId: args.toneId,
      topicId: args.topicId,
      styleSlug: args.styleSlug,
      toneSlug: args.toneSlug,
      topicSlug: args.topicSlug,
      styleVersion: args.styleVersion,
      toneVersion: args.toneVersion,
      topicVersion: args.topicVersion,
      batchSize: args.batchSize,
      model: args.model,
      provider: args.provider,
      temperature: args.temperature,
      assembledPrompt: args.assembledPrompt,
      sourceQuestionId: args.sourceQuestionId,
      resultQuestionIds: [],
      createdAt: Date.now(),
    });
  },
});

const runCounts = {
  parsedCount: v.optional(v.number()),
  insertedCount: v.optional(v.number()),
  duplicateCount: v.optional(v.number()),
  rejectedCount: v.optional(v.number()),
};

export const completeGenerationRun = internalMutation({
  args: {
    runId: v.id("generationRuns"),
    rawResponse: v.optional(v.string()),
    resultQuestionIds: v.optional(v.array(v.id("questions"))),
    previewText: v.optional(v.string()),
    acceptedQuestionId: v.optional(v.id("questions")),
    ...runCounts,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "succeeded",
      rawResponse: args.rawResponse,
      resultQuestionIds: args.resultQuestionIds ?? [],
      previewText: args.previewText,
      acceptedQuestionId: args.acceptedQuestionId,
      parsedCount: args.parsedCount,
      insertedCount: args.insertedCount,
      duplicateCount: args.duplicateCount,
      rejectedCount: args.rejectedCount,
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const failGenerationRun = internalMutation({
  args: {
    runId: v.id("generationRuns"),
    error: v.string(),
    rawResponse: v.optional(v.string()),
    ...runCounts,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      rawResponse: args.rawResponse,
      parsedCount: args.parsedCount,
      insertedCount: args.insertedCount,
      duplicateCount: args.duplicateCount,
      rejectedCount: args.rejectedCount,
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const markAcceptedGenerationRun = internalMutation({
  args: {
    runId: v.id("generationRuns"),
    questionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const question = await ctx.db.get(args.questionId);
    if (!question || question.generationRunId !== args.runId) {
      return null;
    }
    const safeResultQuestionIds = Array.isArray(run.resultQuestionIds)
      ? run.resultQuestionIds
      : [];
    const resultQuestionIds = safeResultQuestionIds.includes(args.questionId)
      ? safeResultQuestionIds
      : [...safeResultQuestionIds, args.questionId];
    await ctx.db.patch(args.runId, {
      acceptedQuestionId: args.questionId,
      resultQuestionIds,
    });
    return null;
  },
});

export const insertGeneratedQuestions = internalMutation({
  args: {
    runId: v.optional(v.id("generationRuns")),
    styleId: v.id("styles"),
    toneId: v.id("tones"),
    topicId: v.optional(v.id("topics")),
    styleSlug: v.string(),
    toneSlug: v.string(),
    topicSlug: v.optional(v.string()),
    styleVersion: v.number(),
    toneVersion: v.number(),
    topicVersion: v.optional(v.number()),
    candidates: v.array(
      v.object({
        text: v.string(),
        // Accepted and not kept: the brief asks for no note, and what a model adds unasked
        // isn't stored or sent back with the question.
        rationale: v.optional(v.string()),
      }),
    ),
    // Required: the runner always holds its questions ("pending"), and nothing saves a
    // generated question as public by leaving this out.
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("public"),
      v.literal("private"),
      v.literal("pruning"),
      v.literal("pruned"),
    ),
    poolDate: v.optional(v.string()),
    poolStatus: v.optional(v.union(v.literal("available"), v.literal("distributed"))),
  },
  returns: v.object({
    insertedQuestionIds: v.array(v.id("questions")),
    insertedCount: v.number(),
    duplicates: v.array(v.object({ text: v.string(), reason: v.string() })),
    duplicateCount: v.number(),
    rejected: v.array(v.object({ text: v.string(), reasons: v.array(v.string()) })),
    rejectedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const checksQuality = qualityCheckMode() !== "off";
    const insertedQuestionIds: Id<"questions">[] = [];
    const duplicates: Array<{ text: string; reason: string }> = [];
    const rejected: Array<{ text: string; reasons: string[] }> = [];
    // A style with a set form asks for short questions, so it has a lower floor.
    const setForm = Boolean((await ctx.db.get(args.styleId))?.form?.trim());
    const seenFingerprints = new Set<string>();

    for (const candidate of args.candidates) {
      const text = normalizeQuestion(candidate.text);
      const fingerprint = fingerprintText(text);
      const reasons = validateGeneratedQuestion(text, { setForm });

      if (seenFingerprints.has(fingerprint)) {
        duplicates.push({ text, reason: "duplicate within batch" });
        continue;
      }
      seenFingerprints.add(fingerprint);

      // Not .unique(): duplicate library questions can share a fingerprint (an admin edit, an
      // older copy), and any of them makes this candidate a duplicate.
      const existing = await ctx.db
        .query("questions")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .first();

      if (existing) {
        duplicates.push({ text, reason: "duplicate of existing question" });
        continue;
      }

      if (reasons.length > 0) {
        rejected.push({ text, reasons });
        continue;
      }

      const questionId = await ctx.db.insert("questions", {
        text,
        fingerprint,
        source: "ai",
        isAIGenerated: true,
        tags: [],
        style: args.styleSlug,
        styleId: args.styleId,
        tone: args.toneSlug,
        toneId: args.toneId,
        topic: args.topicSlug,
        topicId: args.topicId,
        styleSlug: args.styleSlug,
        toneSlug: args.toneSlug,
        topicSlug: args.topicSlug,
        styleVersion: args.styleVersion,
        toneVersion: args.toneVersion,
        topicVersion: args.topicVersion,
        generationRunId: args.runId,
        safetyFlags: [],
        quality: {},
        status: args.status,
        heldForReview: args.status === "pending" ? true : undefined,
        poolDate: args.poolDate,
        poolStatus: args.poolStatus,
        totalLikes: 0,
        totalThumbsDown: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });

      insertedQuestionIds.push(questionId);
      await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
        questionId,
      });
      // Scheduled, not awaited, so whoever is waiting for this question waits no longer.
      if (checksQuality) {
        await ctx.scheduler.runAfter(0, internal.internal.qualityCheck.checkQuestion, { questionId });
      }
    }

    if (args.runId) {
      const run = await ctx.db.get(args.runId);
      const existingIds = Array.isArray(run?.resultQuestionIds)
        ? run.resultQuestionIds
        : [];
      const seen = new Set(existingIds);
      const mergedIds = [...existingIds];
      for (const id of insertedQuestionIds) {
        if (!seen.has(id)) {
          seen.add(id);
          mergedIds.push(id);
        }
      }
      await ctx.db.patch(args.runId, {
        resultQuestionIds: mergedIds,
      });
    }

    return {
      insertedQuestionIds,
      insertedCount: insertedQuestionIds.length,
      duplicates,
      duplicateCount: duplicates.length,
      rejected,
      rejectedCount: rejected.length,
    };
  },
});

export const getGenerationRun = internalQuery({
  args: { runId: v.id("generationRuns") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("generationRuns"),
      status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
      purpose: v.union(
        v.literal("feed"),
        v.literal("admin_preview"),
        v.literal("admin_accept"),
        v.literal("nightly_pool"),
        v.literal("newsletter"),
        v.literal("remix"),
        v.literal("quality_check"),
      ),
      previewText: v.optional(v.string()),
      acceptedQuestionId: v.optional(v.id("questions")),
      resultQuestionIds: v.array(v.id("questions")),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    return {
      _id: run._id,
      status: run.status,
      purpose: run.purpose,
      previewText: run.previewText,
      acceptedQuestionId: run.acceptedQuestionId,
      resultQuestionIds: Array.isArray(run.resultQuestionIds)
        ? run.resultQuestionIds
        : [],
    };
  },
});
