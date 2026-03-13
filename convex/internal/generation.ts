import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, internalQuery, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  DEFAULT_BLUEPRINT_SLUG,
  buildGenerationPrompts,
  clampBatchSize,
  fingerprintText,
  normalizeQuestion,
  validateGeneratedQuestion,
} from "../lib/promptArchitecture";

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
  table: "promptBlueprints",
  slug: string,
): Promise<Doc<"promptBlueprints">>;
async function getLatestActiveBySlug(
  ctx: QueryCtx,
  table: "styles" | "tones" | "topics" | "promptBlueprints",
  slug: string,
) {
  const docs = await ctx.db
    .query(table)
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();

  const latest = docs
    .filter((doc: any) => (doc.status ?? "active") === "active")
    .sort((a: any, b: any) => (b.version ?? 1) - (a.version ?? 1))[0];

  if (!latest) {
    throw new ConvexError(`No active ${table} entry found for slug "${slug}".`);
  }

  return latest;
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
  table: "styles" | "tones" | "topics",
  args: { id?: Id<"styles"> | Id<"tones"> | Id<"topics">; slug?: string } | undefined,
) {
  if (!args?.id && !args?.slug) {
    return null;
  }

  if (args?.id) {
    const doc = await ctx.db.get(args.id as any);
    if (doc) return doc;
  }

  if (args?.slug) {
    return await getLatestActiveBySlug(ctx, table as any, args.slug);
  }

  return null;
}

export const getDefaultPromptBlueprint = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("promptBlueprints"),
      slug: v.string(),
      version: v.number(),
      systemInstruction: v.string(),
      safetyChecklist: v.array(v.string()),
      qualityChecklist: v.array(v.string()),
      outputFormatInstruction: v.string(),
    }),
  ),
  handler: async (ctx) => {
    try {
      const blueprint = await getLatestActiveBySlug(ctx, "promptBlueprints", DEFAULT_BLUEPRINT_SLUG);
      return {
        _id: blueprint._id,
        slug: blueprint.slug,
        version: blueprint.version,
        systemInstruction: blueprint.systemInstruction,
        safetyChecklist: blueprint.safetyChecklist,
        qualityChecklist: blueprint.qualityChecklist,
        outputFormatInstruction: blueprint.outputFormatInstruction,
      };
    } catch {
      return null;
    }
  },
});

export const buildGenerationPrompt = internalQuery({
  args: {
    styleId: v.optional(v.id("styles")),
    styleSlug: v.optional(v.string()),
    toneId: v.optional(v.id("tones")),
    toneSlug: v.optional(v.string()),
    topicId: v.optional(v.id("topics")),
    topicSlug: v.optional(v.string()),
    blueprintSlug: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    excludedQuestions: v.optional(v.array(v.string())),
    currentQuestion: v.optional(v.string()),
    userContext: v.optional(v.string()),
  },
  returns: v.object({
    batchSize: v.number(),
    systemPrompt: v.string(),
    userPrompt: v.string(),
    blueprint: v.object({
      _id: v.id("promptBlueprints"),
      slug: v.string(),
      version: v.number(),
    }),
    style: v.object({
      _id: v.id("styles"),
      slug: v.string(),
      version: v.number(),
      name: v.string(),
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
    const blueprintSlug = args.blueprintSlug ?? DEFAULT_BLUEPRINT_SLUG;

    const [style, tone, topic, blueprint] = await Promise.all([
      getTaxonomyDoc(ctx, "styles", { id: args.styleId, slug: args.styleSlug }),
      getTaxonomyDoc(ctx, "tones", { id: args.toneId, slug: args.toneSlug }),
      getTaxonomyDoc(ctx, "topics", { id: args.topicId, slug: args.topicSlug }),
      getLatestActiveBySlug(ctx, "promptBlueprints", blueprintSlug),
    ]);

    if (!style || !tone) {
      throw new ConvexError("Style and tone are required to build a generation prompt.");
    }

    const prompts = buildGenerationPrompts({
      style,
      tone,
      topic,
      blueprint,
      batchSize,
      excludedQuestions: args.excludedQuestions,
      currentQuestion: args.currentQuestion,
      userContext: args.userContext,
    });

    return {
      batchSize,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      blueprint: {
        _id: blueprint._id,
        slug: blueprint.slug,
        version: blueprint.version,
      },
      style: {
        _id: style._id,
        slug: style.slug ?? style.id,
        version: style.version ?? 1,
        name: style.name,
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
    ),
    requestedByUserId: v.optional(v.string()),
    blueprintId: v.id("promptBlueprints"),
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
    return await ctx.db.insert("generationRuns", {
      status: "running",
      purpose: args.purpose,
      requestedByUserId: args.requestedByUserId,
      blueprintId: args.blueprintId,
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

export const completeGenerationRun = internalMutation({
  args: {
    runId: v.id("generationRuns"),
    rawResponse: v.optional(v.string()),
    resultQuestionIds: v.optional(v.array(v.id("questions"))),
    previewText: v.optional(v.string()),
    acceptedQuestionId: v.optional(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "succeeded",
      rawResponse: args.rawResponse,
      resultQuestionIds: args.resultQuestionIds ?? [],
      previewText: args.previewText,
      acceptedQuestionId: args.acceptedQuestionId,
      finishedAt: Date.now(),
    });
    return null;
  },
});

export const failGenerationRun = internalMutation({
  args: {
    runId: v.id("generationRuns"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
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
        rationale: v.optional(v.string()),
      }),
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("public"),
        v.literal("private"),
        v.literal("pruning"),
        v.literal("pruned"),
      ),
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
    const insertedQuestionIds: Id<"questions">[] = [];
    const duplicates: Array<{ text: string; reason: string }> = [];
    const rejected: Array<{ text: string; reasons: string[] }> = [];
    const seenFingerprints = new Set<string>();

    for (const candidate of args.candidates) {
      const text = normalizeQuestion(candidate.text);
      const fingerprint = fingerprintText(text);
      const reasons = validateGeneratedQuestion(text);

      if (seenFingerprints.has(fingerprint)) {
        duplicates.push({ text, reason: "duplicate within batch" });
        continue;
      }
      seenFingerprints.add(fingerprint);

      const existing = await ctx.db
        .query("questions")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .unique();

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
        moderationNotes: candidate.rationale,
        quality: {},
        status: args.status ?? "public",
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
    }

    if (args.runId) {
      await ctx.db.patch(args.runId, {
        resultQuestionIds: insertedQuestionIds,
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
      resultQuestionIds: run.resultQuestionIds,
    };
  },
});
