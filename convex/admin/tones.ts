import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { defaultQualityRubric, defaultToneAxesValue } from "../lib/taxonomy";

const toneFields = {
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
};

function mapTone(tone: any) {
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
    color: tone.color,
    icon: tone.icon,
    order: tone.order,
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

function latestVersion<T extends { version?: number }>(docs: T[]) {
  return [...docs].sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0] ?? null;
}

export const listTones = query({
  args: {},
  returns: v.array(v.object(toneFields)),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const tones = await ctx.db.query("tones").collect();
    const grouped = new Map<string, any[]>();
    for (const tone of tones) {
      const slug = tone.slug ?? tone.id;
      if (!grouped.has(slug)) grouped.set(slug, []);
      grouped.get(slug)!.push(tone);
    }

    return Array.from(grouped.values())
      .map((docs) => {
        const active = docs.find((doc) => (doc.status ?? "active") === "active");
        return mapTone(active ?? latestVersion(docs)!);
      })
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  },
});

export const getToneVersions = query({
  args: { slug: v.string() },
  returns: v.array(v.object(toneFields)),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const tones = await ctx.db
      .query("tones")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return tones.sort((a, b) => (b.version ?? 1) - (a.version ?? 1)).map(mapTone);
  },
});

export const createTone = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
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
    languageCues: v.optional(v.array(v.string())),
    avoidCues: v.optional(v.array(v.string())),
    emotionalAxes: v.optional(
      v.object({
        warmth: v.number(),
        playfulness: v.number(),
        seriousness: v.number(),
        surrealness: v.number(),
        sharpness: v.number(),
        intimacy: v.number(),
      }),
    ),
  },
  returns: v.id("tones"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existing = await ctx.db
      .query("tones")
      .withIndex("by_slug", (q) => q.eq("slug", args.id))
      .collect();
    if (existing.length > 0) {
      throw new Error("Tone with this slug already exists");
    }

    const now = Date.now();
    return await ctx.db.insert("tones", {
      id: args.id,
      slug: args.id,
      name: args.name,
      description: args.description,
      promptGuidanceForAI: args.promptGuidanceForAI,
      aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI,
      color: args.color,
      icon: args.icon,
      order: args.order,
      version: 1,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? [],
      examples: args.examples ?? [],
      antiExamples: args.antiExamples ?? [],
      quality: args.quality ?? defaultQualityRubric(),
      languageCues: args.languageCues ?? [],
      avoidCues: args.avoidCues ?? [],
      emotionalAxes: args.emotionalAxes ?? defaultToneAxesValue(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTone = mutation({
  args: {
    _id: v.id("tones"),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
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
    languageCues: v.optional(v.array(v.string())),
    avoidCues: v.optional(v.array(v.string())),
    emotionalAxes: v.optional(
      v.object({
        warmth: v.number(),
        playfulness: v.number(),
        seriousness: v.number(),
        surrealness: v.number(),
        sharpness: v.number(),
        intimacy: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existingTone = await ctx.db.get(args._id);
    if (!existingTone) throw new Error("Tone not found");

    const now = Date.now();
    if ((existingTone.status ?? "active") === "draft") {
      await ctx.db.patch(args._id, {
        name: args.name,
        description: args.description,
        promptGuidanceForAI: args.promptGuidanceForAI,
        aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI,
        color: args.color,
        icon: args.icon,
        order: args.order,
        commonFailureModes: args.commonFailureModes ?? [],
        distinctFrom: args.distinctFrom ?? [],
        examples: args.examples ?? [],
        antiExamples: args.antiExamples ?? [],
        quality: args.quality ?? defaultQualityRubric(),
        languageCues: args.languageCues ?? [],
        avoidCues: args.avoidCues ?? [],
        emotionalAxes: args.emotionalAxes ?? defaultToneAxesValue(),
        updatedAt: now,
      });
      return null;
    }

    const siblings = await ctx.db
      .query("tones")
      .withIndex("by_slug", (q) => q.eq("slug", existingTone.slug ?? existingTone.id))
      .collect();
    const nextVersion = (latestVersion(siblings)?.version ?? 1) + 1;

    await ctx.db.insert("tones", {
      id: existingTone.slug ?? existingTone.id,
      slug: existingTone.slug ?? existingTone.id,
      name: args.name,
      description: args.description,
      promptGuidanceForAI: args.promptGuidanceForAI,
      aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI,
      color: args.color,
      icon: args.icon,
      order: args.order,
      version: nextVersion,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? [],
      examples: args.examples ?? [],
      antiExamples: args.antiExamples ?? [],
      quality: args.quality ?? defaultQualityRubric(),
      languageCues: args.languageCues ?? [],
      avoidCues: args.avoidCues ?? [],
      emotionalAxes: args.emotionalAxes ?? defaultToneAxesValue(),
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const activateToneVersion = mutation({
  args: { id: v.id("tones") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const toneToActivate = await ctx.db.get(args.id);
    if (!toneToActivate) throw new Error("Tone not found");
    const slug = toneToActivate.slug ?? toneToActivate.id;
    const siblings = await ctx.db
      .query("tones")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const previousActive = siblings.find((tone) => tone.status === "active");
    if (previousActive && previousActive._id !== args.id) {
      await ctx.db.patch(previousActive._id, { status: "archived", updatedAt: Date.now() });

      const userTones = await ctx.db
        .query("userTones")
        .withIndex("by_toneId", (q) => q.eq("toneId", previousActive._id))
        .collect();
      for (const userTone of userTones) {
        await ctx.db.patch(userTone._id, { toneId: args.id, updatedAt: Date.now() });
      }
    }
    await ctx.db.patch(args.id, { status: "active", updatedAt: Date.now() });
    return null;
  },
});

export const deleteTone = mutation({
  args: { id: v.id("tones") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const tone = await ctx.db.get(args.id);
    if (!tone) throw new Error("Tone not found");
    await ctx.db.patch(args.id, { status: "archived", updatedAt: Date.now() });
    return null;
  },
});
