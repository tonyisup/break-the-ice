import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { defaultQualityRubric, defaultToneAxesValue, latestActiveVersion } from "../lib/taxonomy";
import { DEFAULT_TONE_COLOR, DEFAULT_TONE_ICON } from "../core/tones";

const TONE_BACKFILL_BATCH_SIZE = 100;

const toneFields = v.object({
  _id: v.id("tones"),
  _creationTime: v.number(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  promptGuidanceForAI: v.string(),
  aiGuidance: v.string(),
  color: v.string(),
  icon: v.string(),
  order: v.optional(v.float64()),
  organizationId: v.optional(v.id("organizations")),
  version: v.number(),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  commonFailureModes: v.array(v.string()),
  distinctFrom: v.array(v.string()),
  examples: v.array(v.object({ text: v.string(), note: v.optional(v.string()) })),
  antiExamples: v.array(v.object({ text: v.string(), note: v.optional(v.string()) })),
  quality: v.object({
    distinctness: v.number(),
    generativity: v.number(),
    readability: v.number(),
    pairability: v.number(),
    storyYield: v.number(),
    safety: v.number(),
    embeddingValue: v.number(),
  }),
  languageCues: v.array(v.string()),
  avoidCues: v.array(v.string()),
  emotionalAxes: v.object({
    warmth: v.number(),
    playfulness: v.number(),
    seriousness: v.number(),
    surrealness: v.number(),
    sharpness: v.number(),
    intimacy: v.number(),
  }),
});

function mapTone(tone: Doc<"tones">) {
  const slug = tone.slug ?? tone.id;
  const promptGuidanceForAI = tone.promptGuidanceForAI ?? tone.aiGuidance ?? "";
  return {
    _id: tone._id,
    _creationTime: tone._creationTime,
    id: slug,
    slug,
    name: tone.name,
    description: tone.description,
    promptGuidanceForAI,
    aiGuidance: tone.aiGuidance ?? promptGuidanceForAI,
    color: tone.color ?? DEFAULT_TONE_COLOR,
    icon: tone.icon ?? DEFAULT_TONE_ICON,
    order: tone.order,
    organizationId: tone.organizationId,
    version: tone.version ?? 1,
    status: tone.status ?? "active",
    commonFailureModes: tone.commonFailureModes ?? [],
    distinctFrom: tone.distinctFrom ?? [],
    examples: tone.examples ?? [],
    antiExamples: tone.antiExamples ?? [],
    quality: tone.quality ?? defaultQualityRubric(),
    languageCues: tone.languageCues ?? [],
    avoidCues: tone.avoidCues ?? [],
    emotionalAxes: tone.emotionalAxes ?? defaultToneAxesValue(),
  };
}

export const getTonesWithMissingEmbeddings = internalQuery({
  args: {},
  returns: v.array(toneFields),
  handler: async (ctx) => {
    const withEmbeddingIds = new Set((await ctx.db.query("tone_embeddings").collect()).map((e) => e.toneId));
    const tones = await ctx.db.query("tones").collect();
    return tones.filter((tone) => !withEmbeddingIds.has(tone._id)).map(mapTone);
  },
});

export const addToneEmbedding = internalMutation({
  args: {
    toneId: v.id("tones"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tone_embeddings")
      .withIndex("by_toneId", (q) => q.eq("toneId", args.toneId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { embedding: args.embedding });
    } else {
      await ctx.db.insert("tone_embeddings", {
        toneId: args.toneId,
        embedding: args.embedding,
      });
    }
    return null;
  },
});

export const updateQuestionsWithMissingToneIds = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_tone_text", (q) => q)
      .take(TONE_BACKFILL_BATCH_SIZE);
    for (const question of questions) {
      if (!question.toneId && question.tone) {
        const tone = await ctx.db
          .query("tones")
          .withIndex("by_slug", (q) => q.eq("slug", question.tone!))
          .first();
        if (tone) {
          await ctx.db.patch(question._id, {
            toneId: tone._id,
            toneSlug: tone.slug ?? tone.id,
          });
          await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
            questionId: question._id,
          });
        }
      }
    }

    if (questions.length === TONE_BACKFILL_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.internal.tones.updateQuestionsWithMissingToneIds,
        {},
      );
    }
    return null;
  },
});

export const getToneById = internalQuery({
  args: { id: v.id("tones") },
  returns: v.nullable(toneFields),
  handler: async (ctx, args) => {
    const tone = await ctx.db.get(args.id);
    return tone ? mapTone(tone) : null;
  },
});

export const getAllTonesInternal = internalQuery({
  args: {},
  returns: v.array(toneFields),
  handler: async (ctx) => {
    return (await ctx.db.query("tones").collect()).map(mapTone);
  },
});

export const getRandomToneForUserId = internalQuery({
  args: {
    userId: v.id("users"),
    seed: v.optional(v.number()),
  },
  returns: v.nullable(toneFields),
  handler: async (ctx, args) => {
    const tones = await ctx.db.query("tones").take(200);
    const bySlug = new Map<string, Doc<"tones">[]>();
    for (const tone of tones) {
      const slug = tone.slug ?? tone.id;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push(tone);
    }

    const active = Array.from(bySlug.values())
      .map((docs) => latestActiveVersion(docs))
      .filter((tone): tone is Doc<"tones"> => tone !== null)
      .map(mapTone)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

    const userHiddenTones = await ctx.db
      .query("userTones")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "hidden"))
      .collect();
    const hiddenToneDocs = await Promise.all(
      userHiddenTones.map((entry) => ctx.db.get(entry.toneId)),
    );
    const hiddenSlugs = new Set(
      hiddenToneDocs
        .filter((tone): tone is Doc<"tones"> => tone !== null)
        .map((tone) => tone.slug ?? tone.id),
    );
    const visible = active.filter((tone) => !hiddenSlugs.has(tone.slug));

    if (visible.length === 0) {
      return null;
    }

    const seed = args.seed ?? Math.random();
    const index = Math.floor(seed * visible.length) % visible.length;
    return visible[index];
  },
});
