import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { defaultIdealPromptLength, defaultQualityRubric, latestVersion } from "../lib/taxonomy";
import { mapStyle, styleFields } from "../lib/styleHelpers";

const MAX_STYLES = 500;
const USER_STYLE_REASSIGN_BATCH_SIZE = 200;

export const listStyles = query({
  args: {},
  returns: v.array(v.object(styleFields)),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const styles = await ctx.db.query("styles").take(MAX_STYLES);
    const grouped = new Map<string, Doc<"styles">[]>();
    for (const style of styles) {
      const slug = style.slug ?? style.id;
      if (!grouped.has(slug)) grouped.set(slug, []);
      grouped.get(slug)!.push(style);
    }
    return Array.from(grouped.values())
      .map((docs) => {
        const active = docs.find((doc) => (doc.status ?? "active") === "active");
        return mapStyle(active ?? latestVersion(docs)!);
      })
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  },
});

export const getStyleVersions = query({
  args: { slug: v.string() },
  returns: v.array(v.object(styleFields)),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const styles = await ctx.db
      .query("styles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return styles.sort((a, b) => (b.version ?? 1) - (a.version ?? 1)).map(mapStyle);
  },
});

export const getStyleVersion = query({
  args: { id: v.id("styles") },
  returns: v.union(v.object(styleFields), v.null()),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const style = await ctx.db.get(args.id);
    return style ? mapStyle(style) : null;
  },
});

export const createStyle = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
    aiGuidance: v.optional(v.string()),
    commonFailureModes: v.optional(v.array(v.string())),
    distinctFrom: v.optional(v.array(v.string())),
    examples: v.optional(v.array(v.object({ text: v.string(), note: v.optional(v.string()) }))),
    antiExamples: v.optional(v.array(v.object({ text: v.string(), note: v.optional(v.string()) }))),
    quality: v.optional(
      v.object({
        distinctness: v.number(),
        generativity: v.number(),
        readability: v.number(),
        pairability: v.number(),
        storyYield: v.number(),
        safety: v.number(),
        embeddingValue: v.number(),
      }),
    ),
    cognitiveMove: v.optional(v.string()),
    socialFunction: v.optional(v.string()),
    structuralInstruction: v.optional(v.string()),
    answerShape: v.optional(v.string()),
    idealPromptLength: v.optional(v.object({ minChars: v.number(), maxChars: v.number() })),
    riskLevel: v.optional(v.union(v.literal("low"), v.literal("medium"))),
  },
  returns: v.id("styles"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existing = await ctx.db
      .query("styles")
      .withIndex("by_slug", (q) => q.eq("slug", args.id))
      .collect();
    if (existing.length > 0) {
      throw new Error("Style with this slug already exists");
    }

    const now = Date.now();
    return await ctx.db.insert("styles", {
      id: args.id,
      slug: args.id,
      name: args.name,
      description: args.description,
      structure: args.structure,
      structuralInstruction: args.structuralInstruction ?? args.structure,
      color: args.color,
      icon: args.icon,
      example: args.example,
      promptGuidanceForAI: args.promptGuidanceForAI,
      aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI ?? "",
      order: args.order,
      version: 1,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? [],
      examples: args.examples ?? [],
      antiExamples: args.antiExamples ?? [],
      quality: args.quality ?? defaultQualityRubric(),
      cognitiveMove: args.cognitiveMove ?? "reflect",
      socialFunction: args.socialFunction ?? "Reveals taste and priorities through conversation.",
      answerShape: args.answerShape ?? "short conversational answer",
      idealPromptLength: args.idealPromptLength ?? defaultIdealPromptLength(),
      riskLevel: args.riskLevel ?? "low",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStyle = mutation({
  args: {
    _id: v.id("styles"),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
    aiGuidance: v.optional(v.string()),
    commonFailureModes: v.optional(v.array(v.string())),
    distinctFrom: v.optional(v.array(v.string())),
    examples: v.optional(v.array(v.object({ text: v.string(), note: v.optional(v.string()) }))),
    antiExamples: v.optional(v.array(v.object({ text: v.string(), note: v.optional(v.string()) }))),
    quality: v.optional(
      v.object({
        distinctness: v.number(),
        generativity: v.number(),
        readability: v.number(),
        pairability: v.number(),
        storyYield: v.number(),
        safety: v.number(),
        embeddingValue: v.number(),
      }),
    ),
    cognitiveMove: v.optional(v.string()),
    socialFunction: v.optional(v.string()),
    structuralInstruction: v.optional(v.string()),
    answerShape: v.optional(v.string()),
    idealPromptLength: v.optional(v.object({ minChars: v.number(), maxChars: v.number() })),
    riskLevel: v.optional(v.union(v.literal("low"), v.literal("medium"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existingStyle = await ctx.db.get(args._id);
    if (!existingStyle) {
      throw new Error("Style not found");
    }

    const now = Date.now();
    if ((existingStyle.status ?? "active") === "draft") {
      await ctx.db.patch(args._id, {
        name: args.name,
        description: args.description,
        structure: args.structure,
        structuralInstruction: args.structuralInstruction ?? args.structure,
        color: args.color,
        icon: args.icon,
        example: args.example,
        promptGuidanceForAI: args.promptGuidanceForAI,
        aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI ?? "",
        order: args.order,
        commonFailureModes: args.commonFailureModes ?? [],
        distinctFrom: args.distinctFrom ?? [],
        examples: args.examples ?? [],
        antiExamples: args.antiExamples ?? [],
        quality: args.quality ?? defaultQualityRubric(),
        cognitiveMove: args.cognitiveMove ?? "reflect",
        socialFunction: args.socialFunction ?? "Reveals taste and priorities through conversation.",
        answerShape: args.answerShape ?? "short conversational answer",
        idealPromptLength: args.idealPromptLength ?? defaultIdealPromptLength(),
        riskLevel: args.riskLevel ?? "low",
        updatedAt: now,
      });
      return null;
    }

    const siblings = await ctx.db
      .query("styles")
      .withIndex("by_slug", (q) => q.eq("slug", existingStyle.slug ?? existingStyle.id))
      .collect();
    const nextVersion = (latestVersion(siblings)?.version ?? 1) + 1;
    await ctx.db.insert("styles", {
      id: existingStyle.slug ?? existingStyle.id,
      slug: existingStyle.slug ?? existingStyle.id,
      name: args.name,
      description: args.description,
      structure: args.structure,
      structuralInstruction: args.structuralInstruction ?? args.structure,
      color: args.color,
      icon: args.icon,
      example: args.example,
      promptGuidanceForAI: args.promptGuidanceForAI,
      aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI ?? "",
      order: args.order,
      version: nextVersion,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? [],
      examples: args.examples ?? [],
      antiExamples: args.antiExamples ?? [],
      quality: args.quality ?? defaultQualityRubric(),
      cognitiveMove: args.cognitiveMove ?? "reflect",
      socialFunction: args.socialFunction ?? "Reveals taste and priorities through conversation.",
      answerShape: args.answerShape ?? "short conversational answer",
      idealPromptLength: args.idealPromptLength ?? defaultIdealPromptLength(),
      riskLevel: args.riskLevel ?? "low",
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const activateStyleVersion = mutation({
  args: { id: v.id("styles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const styleToActivate = await ctx.db.get(args.id);
    if (!styleToActivate) throw new Error("Style not found");
    const slug = styleToActivate.slug ?? styleToActivate.id;

    const siblings = await ctx.db
      .query("styles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();

    const previousActive = siblings.find((style) => style.status === "active");
    if (previousActive && previousActive._id !== args.id) {
      await ctx.db.patch(previousActive._id, { status: "archived", updatedAt: Date.now() });

      const userStyles = await ctx.db
        .query("userStyles")
        .withIndex("by_styleId", (q) => q.eq("styleId", previousActive._id))
        .take(USER_STYLE_REASSIGN_BATCH_SIZE);
      for (const userStyle of userStyles) {
        await ctx.db.patch(userStyle._id, { styleId: args.id, updatedAt: Date.now() });
      }
      if (userStyles.length === USER_STYLE_REASSIGN_BATCH_SIZE) {
        await ctx.scheduler.runAfter(0, internal.admin.styles.reassignUserStylesBatch, {
          previousStyleId: previousActive._id,
          nextStyleId: args.id,
        });
      }
    }

    await ctx.db.patch(args.id, { status: "active", updatedAt: Date.now() });
    return null;
  },
});

export const archiveStyle = mutation({
  args: { id: v.id("styles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const style = await ctx.db.get(args.id);
    if (!style) throw new Error("Style not found");
    await ctx.db.patch(args.id, { status: "archived", updatedAt: Date.now() });
    return null;
  },
});

export const reassignUserStylesBatch = internalMutation({
  args: {
    previousStyleId: v.id("styles"),
    nextStyleId: v.id("styles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userStyles = await ctx.db
      .query("userStyles")
      .withIndex("by_styleId", (q) => q.eq("styleId", args.previousStyleId))
      .take(USER_STYLE_REASSIGN_BATCH_SIZE);

    for (const userStyle of userStyles) {
      await ctx.db.patch(userStyle._id, {
        styleId: args.nextStyleId,
        updatedAt: Date.now(),
      });
    }

    if (userStyles.length === USER_STYLE_REASSIGN_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.admin.styles.reassignUserStylesBatch, args);
    }

    return null;
  },
});
