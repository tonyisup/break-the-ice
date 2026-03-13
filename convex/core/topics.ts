import { v } from "convex/values";
import { query, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { defaultQualityRubric, latestActiveVersion } from "../lib/taxonomy";
import { getActiveTakeoverTopicsHelper } from "../lib/takeover";

const DEFAULT_TOPIC_LIMIT = 500;

const publicTopicFields = {
  _id: v.id("topics"),
  _creationTime: v.number(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  promptGuidanceForAI: v.optional(v.string()),
  aiGuidance: v.string(),
  order: v.optional(v.float64()),
  organizationId: v.optional(v.id("organizations")),
  icon: v.optional(v.string()),
  takeoverStartDate: v.optional(v.number()),
  takeoverEndDate: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  color: v.optional(v.string()),
  example: v.optional(v.string()),
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
  scopeBoundaries: v.array(v.string()),
  referencePool: v.array(v.string()),
  accessibilityNotes: v.optional(v.string()),
};

function mapTopic(topic: Doc<"topics">) {
  const slug = topic.slug ?? topic.id;
  const promptGuidanceForAI = topic.promptGuidanceForAI ?? topic.aiGuidance ?? "";
  return {
    _id: topic._id,
    _creationTime: topic._creationTime,
    id: slug,
    slug,
    name: topic.name,
    description: topic.description,
    promptGuidanceForAI,
    aiGuidance: topic.aiGuidance ?? promptGuidanceForAI,
    order: topic.order,
    organizationId: topic.organizationId,
    icon: topic.icon,
    takeoverStartDate: topic.takeoverStartDate,
    takeoverEndDate: topic.takeoverEndDate,
    startDate: topic.startDate,
    endDate: topic.endDate,
    color: topic.color,
    example: topic.example,
    version: topic.version ?? 1,
    status: topic.status ?? "active",
    commonFailureModes: topic.commonFailureModes ?? [],
    distinctFrom: topic.distinctFrom ?? [],
    examples: topic.examples ?? [],
    antiExamples: topic.antiExamples ?? [],
    quality: topic.quality ?? defaultQualityRubric(),
    scopeBoundaries: topic.scopeBoundaries ?? [],
    referencePool: topic.referencePool ?? [],
    accessibilityNotes: topic.accessibilityNotes,
  };
}

async function getLatestActiveTopicBySlug(ctx: QueryCtx, slug: string) {
  const topics = await ctx.db
    .query("topics")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
  return latestActiveVersion(topics);
}

async function getActiveTopics(ctx: QueryCtx, organizationId?: Id<"organizations">) {
  const topics = organizationId
    ? await ctx.db
        .query("topics")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(DEFAULT_TOPIC_LIMIT)
    : await ctx.db.query("topics").take(DEFAULT_TOPIC_LIMIT);

  const bySlug = new Map<string, Doc<"topics">[]>();
  for (const topic of topics) {
    const slug = topic.slug ?? topic.id;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(topic);
  }

  return Array.from(bySlug.values())
    .map((docs) => latestActiveVersion(docs))
    .filter((topic): topic is Doc<"topics"> => topic !== null)
    .map((topic) => mapTopic(topic))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

export const getTopics = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object(publicTopicFields)),
  handler: async (ctx, args) => {
    return await getActiveTopics(ctx, args.organizationId);
  },
});

export const getTopic = query({
  args: {
    id: v.string(),
  },
  returns: v.union(v.object(publicTopicFields), v.null()),
  handler: async (ctx, args) => {
    const topic = await getLatestActiveTopicBySlug(ctx, args.id);
    return topic ? mapTopic(topic) : null;
  },
});

export const getActiveTakeoverTopics = query({
  args: {},
  returns: v.array(v.object(publicTopicFields)),
  handler: async (ctx) => {
    const topics = await getActiveTakeoverTopicsHelper(ctx);
    return topics
      .filter((topic): topic is Doc<"topics"> => topic !== null)
      .map(mapTopic);
  },
});

export const getTopicBySystemId = query({
  args: {
    id: v.id("topics"),
  },
  returns: v.union(v.object(publicTopicFields), v.null()),
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.id);
    return topic ? mapTopic(topic) : null;
  },
});

export const getTopicById = query({
  args: {
    id: v.optional(v.id("topics")),
  },
  returns: v.union(v.object(publicTopicFields), v.null()),
  handler: async (ctx, args) => {
    if (!args.id) return null;
    const topic = await ctx.db.get(args.id);
    return topic ? mapTopic(topic) : null;
  },
});
