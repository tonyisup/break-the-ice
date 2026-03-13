import { v } from "convex/values";
import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { defaultQualityRubric, defaultToneAxesValue, latestActiveVersion } from "../lib/taxonomy";

export const DEFAULT_TONE_COLOR = "#6B7280";
export const DEFAULT_TONE_ICON = "MessageCircle";

const publicToneFields = {
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

async function getLatestActiveToneBySlug(ctx: QueryCtx, slug: string) {
  const tones = await ctx.db
    .query("tones")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  return latestActiveVersion(tones);
}

async function getActiveTones(
  ctx: QueryCtx,
  organizationId?: Id<"organizations">,
  limit = 500,
) {
  const tones = organizationId
    ? await ctx.db
        .query("tones")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(limit)
    : await ctx.db.query("tones").take(limit);

  const bySlug = new Map<string, Doc<"tones">[]>();
  for (const tone of filtered) {
    const slug = tone.slug ?? tone.id;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(tone);
  }

  return Array.from(bySlug.values())
    .map((docs) => latestActiveVersion(docs))
    .filter((tone): tone is Doc<"tones"> => tone !== null)
    .map((tone) => mapTone(tone))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

export const getTone = query({
  args: { id: v.string() },
  returns: v.union(v.object(publicToneFields), v.null()),
  handler: async (ctx, args) => {
    const tone = await getLatestActiveToneBySlug(ctx, args.id);
    return tone ? mapTone(tone) : null;
  },
});

export const getTones = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object(publicToneFields)),
  handler: async (ctx, args) => {
    return await getActiveTones(ctx, args.organizationId);
  },
});

export const getFilteredTones = query({
  args: {
    excluded: v.array(v.string()),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object(publicToneFields)),
  handler: async (ctx, args) => {
    const tones = await getActiveTones(ctx, args.organizationId);
    return tones.filter((tone) => !args.excluded.includes(tone.slug));
  },
});

export const getRandomTone = query({
  args: { seed: v.optional(v.number()) },
  returns: v.object(publicToneFields),
  handler: async (ctx, args) => {
    const tones = await getActiveTones(ctx);
    if (tones.length === 0) throw new Error("No tones found in the database");
    const seed = args.seed ?? Math.random();
    const index = Math.floor(seed * tones.length) % tones.length;
    return tones[index];
  },
});

export const getRandomToneForUser = query({
  args: {},
  returns: v.object(publicToneFields),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) throw new Error("User not found");

    const tones = await getActiveTones(ctx);
    const userHiddenTones = await ctx.db
      .query("userTones")
      .withIndex("by_userId_status", (q) => q.eq("userId", user._id).eq("status", "hidden"))
      .collect();
    const hiddenToneDocs = await Promise.all(userHiddenTones.map((entry: any) => ctx.db.get(entry.toneId)));
    const hiddenSlugs = new Set(hiddenToneDocs.filter(Boolean).map((tone: any) => tone.slug ?? tone.id));
    const visible = tones.filter((tone) => !hiddenSlugs.has(tone.slug));
    if (visible.length === 0) throw new Error("No tones available for user");

    const seed = Math.random();
    const index = Math.floor(seed * visible.length) % visible.length;
    return visible[index];
  },
});
