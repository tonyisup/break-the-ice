import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { defaultIdealPromptLength, defaultQualityRubric } from "../lib/taxonomy";

export const styleFields = v.object({
  _id: v.id("styles"),
  _creationTime: v.number(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  structure: v.string(),
  structuralInstruction: v.string(),
  color: v.string(),
  icon: v.string(),
  promptGuidanceForAI: v.optional(v.string()),
  aiGuidance: v.string(),
  example: v.optional(v.string()),
  order: v.optional(v.number()),
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
  cognitiveMove: v.string(),
  socialFunction: v.string(),
  answerShape: v.string(),
  idealPromptLength: v.object({
    minChars: v.number(),
    maxChars: v.number(),
  }),
  riskLevel: v.union(v.literal("low"), v.literal("medium")),
});

function mapStyle(style: any) {
  const slug = style.slug ?? style.id;
  const promptGuidanceForAI = style.promptGuidanceForAI ?? style.aiGuidance ?? "";
  const structuralInstruction = style.structuralInstruction ?? style.structure ?? "";

  return {
    _id: style._id,
    _creationTime: style._creationTime,
    id: slug,
    slug,
    name: style.name,
    description: style.description,
    structure: style.structure ?? structuralInstruction,
    structuralInstruction,
    color: style.color,
    icon: style.icon,
    promptGuidanceForAI,
    aiGuidance: style.aiGuidance ?? promptGuidanceForAI,
    example: style.example,
    order: style.order,
    organizationId: style.organizationId,
    version: style.version ?? 1,
    status: style.status ?? "active",
    commonFailureModes: style.commonFailureModes ?? [],
    distinctFrom: style.distinctFrom ?? [],
    examples: style.examples ?? [],
    antiExamples: style.antiExamples ?? [],
    quality: style.quality ?? defaultQualityRubric(),
    cognitiveMove: style.cognitiveMove ?? "reflect",
    socialFunction: style.socialFunction ?? "Reveals taste and priorities through conversation.",
    answerShape: style.answerShape ?? "short conversational answer",
    idealPromptLength: style.idealPromptLength ?? defaultIdealPromptLength(),
    riskLevel: style.riskLevel ?? "low",
  };
}

export const getStylesWithMissingEmbeddings = internalQuery({
  args: {},
  returns: v.array(styleFields),
  handler: async (ctx) => {
    const withEmbeddingIds = new Set((await ctx.db.query("style_embeddings").collect()).map((e) => e.styleId));
    const styles = await ctx.db.query("styles").collect();
    return styles.filter((style) => !withEmbeddingIds.has(style._id)).map(mapStyle);
  },
});

export const getStyleBySystemId = internalQuery({
  args: { id: v.id("styles") },
  returns: v.nullable(styleFields),
  handler: async (ctx, args) => {
    const style = await ctx.db.get(args.id);
    return style ? mapStyle(style) : null;
  },
});

export const getStyleById = getStyleBySystemId;

export const addStyleEmbedding = internalMutation({
  args: {
    styleId: v.id("styles"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("style_embeddings")
      .withIndex("by_styleId", (q) => q.eq("styleId", args.styleId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { embedding: args.embedding });
    } else {
      await ctx.db.insert("style_embeddings", {
        styleId: args.styleId,
        embedding: args.embedding,
      });
    }
    return null;
  },
});

export const updateQuestionsWithMissingStyleIds = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    for (const question of questions) {
      if (!question.styleId && question.style) {
        const style = await ctx.db
          .query("styles")
          .withIndex("by_slug", (q) => q.eq("slug", question.style!))
          .first();

        if (style) {
          await ctx.db.patch(question._id, { styleId: style._id, styleSlug: style.slug ?? style.id });
          await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
            questionId: question._id,
          });
        }
      }
    }
    return null;
  },
});

export const getAllStylesInternal = internalQuery({
  args: {},
  returns: v.array(styleFields),
  handler: async (ctx) => {
    return (await ctx.db.query("styles").collect()).map(mapStyle);
  },
});
