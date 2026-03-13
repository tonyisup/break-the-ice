import { v } from "convex/values";
import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { defaultIdealPromptLength, defaultQualityRubric, latestActiveVersion } from "../lib/taxonomy";

const STYLE_EXAMPLE_LIMIT = 50;

const publicStyleFields = {
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
  example: v.optional(v.string()),
  promptGuidanceForAI: v.optional(v.string()),
  aiGuidance: v.string(),
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
  cognitiveMove: v.string(),
  socialFunction: v.string(),
  answerShape: v.string(),
  idealPromptLength: v.object({
    minChars: v.number(),
    maxChars: v.number(),
  }),
  riskLevel: v.union(v.literal("low"), v.literal("medium")),
};

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
    example: style.example,
    promptGuidanceForAI,
    aiGuidance: style.aiGuidance ?? promptGuidanceForAI,
    order: style.order,
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

async function getLatestActiveStyleBySlug(ctx: QueryCtx, slug: string) {
  const styles = await ctx.db
    .query("styles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();

  return latestActiveVersion(styles);
}

async function getActiveStyles(ctx: QueryCtx, organizationId?: Id<"organizations">) {
  const styles = await ctx.db.query("styles").collect();
  const filtered = organizationId
    ? styles.filter((style) => style.organizationId === organizationId)
    : styles;

  const bySlug = new Map<string, Doc<"styles">[]>();
  for (const style of filtered) {
    const slug = style.slug ?? style.id;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(style);
  }

  const active = Array.from(bySlug.values())
    .map((docs) => latestActiveVersion<any>(docs))
    .filter(Boolean)
    .map((style) => mapStyle(style))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

  return active;
}

export const getStyle = query({
  args: { id: v.string() },
  returns: v.union(v.object(publicStyleFields), v.null()),
	handler: async (ctx, args) => {
		const style = await getLatestActiveStyleBySlug(ctx, args.id) as any;
    return style ? mapStyle(style) : null;
  },
});

export const getStyleById = query({
  args: { id: v.id("styles") },
  returns: v.union(v.object(publicStyleFields), v.null()),
  handler: async (ctx, args) => {
    const style = await ctx.db.get(args.id);
    return style ? mapStyle(style) : null;
  },
});

export const getStylesWithExamples = query({
  args: { id: v.string(), seed: v.optional(v.number()) },
  returns: v.union(
    v.object({
      ...publicStyleFields,
      examples: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const style = await getLatestActiveStyleBySlug(ctx, args.id);
    if (!style) return null;

    const exampleQuestions = await ctx.db
      .query("questions")
      .withIndex("by_styleId_status", (q) =>
        q.eq("styleId", style._id).eq("status", "public"),
      )
      .take(STYLE_EXAMPLE_LIMIT);
    const examples = exampleQuestions
      .map((question) => question.text)
      .filter((text: string | undefined): text is string => text !== undefined);

    const base = mapStyle(style);
    if (examples.length === 0) {
      return { ...base, examples: [] };
    }

    const seed = args.seed ?? Math.random() * 0xffffffff;
    let state = seed;
    const rand = () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const maxExamples = process.env.MAX_EXAMPLES_PER_STYLE ? parseInt(process.env.MAX_EXAMPLES_PER_STYLE, 10) : 3;
    const sampled = [...examples].sort(() => 0.5 - rand()).slice(0, maxExamples);
    return { ...base, examples: sampled };
  },
});

export const getStyles = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object(publicStyleFields)),
  handler: async (ctx, args) => {
    return await getActiveStyles(ctx, args.organizationId);
  },
});

export const getFilteredStyles = query({
  args: {
    excluded: v.array(v.string()),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object(publicStyleFields)),
  handler: async (ctx, args) => {
    const styles = await getActiveStyles(ctx, args.organizationId);
    return styles.filter((style) => !args.excluded.includes(style.slug));
  },
});

export const getRandomStyle = query({
  args: { seed: v.optional(v.number()) },
  returns: v.object(publicStyleFields),
  handler: async (ctx, args) => {
    const styles = await getActiveStyles(ctx);
    if (styles.length === 0) {
      throw new Error("No styles found in the database");
    }

    const seed = args.seed ?? Math.random();
    const index = Math.floor(seed * styles.length) % styles.length;
    return styles[index];
  },
});

export const getRandomStyleForUser = query({
  args: { userId: v.id("users") },
  returns: v.object(publicStyleFields),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const styles = await getActiveStyles(ctx);
    const userHiddenStyles = await ctx.db
      .query("userStyles")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "hidden"))
      .collect();

    const hiddenStyleDocs = await Promise.all(userHiddenStyles.map((entry: any) => ctx.db.get(entry.styleId)));
    const hiddenSlugs = new Set(hiddenStyleDocs.filter(Boolean).map((style: any) => style.slug ?? style.id));
    const visible = styles.filter((style) => !hiddenSlugs.has(style.slug));

    if (visible.length === 0) {
      throw new Error("No styles available for user");
    }

    const seed = Math.random();
    const index = Math.floor(seed * visible.length) % visible.length;
    return visible[index];
  },
});
