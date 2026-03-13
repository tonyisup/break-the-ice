import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { defaultQualityRubric } from "../lib/taxonomy";
import { getActiveTakeoverTopicsHelper } from "../lib/takeover";

const topicFields = v.object({
  _id: v.id("topics"),
  _creationTime: v.number(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  example: v.optional(v.string()),
  promptGuidanceForAI: v.optional(v.string()),
  aiGuidance: v.string(),
  order: v.optional(v.number()),
  organizationId: v.optional(v.id("organizations")),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  takeoverStartDate: v.optional(v.number()),
  takeoverEndDate: v.optional(v.number()),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
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
});

function mapTopic(topic: any) {
  const slug = topic.slug ?? topic.id;
  const promptGuidanceForAI = topic.promptGuidanceForAI ?? topic.aiGuidance ?? "";
  return {
    _id: topic._id,
    _creationTime: topic._creationTime,
    id: slug,
    slug,
    name: topic.name,
    description: topic.description,
    example: topic.example,
    promptGuidanceForAI,
    aiGuidance: topic.aiGuidance ?? promptGuidanceForAI,
    order: topic.order,
    organizationId: topic.organizationId,
    startDate: topic.startDate,
    endDate: topic.endDate,
    takeoverStartDate: topic.takeoverStartDate,
    takeoverEndDate: topic.takeoverEndDate,
    icon: topic.icon,
    color: topic.color,
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

export const addTopicEmbedding = internalMutation({
  args: {
    topicId: v.id("topics"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("topic_embeddings")
      .withIndex("by_topicId", (q) => q.eq("topicId", args.topicId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { embedding: args.embedding });
    } else {
      await ctx.db.insert("topic_embeddings", {
        topicId: args.topicId,
        embedding: args.embedding,
      });
    }
    return null;
  },
});

export const getTopicBySystemId = internalQuery({
  args: { id: v.id("topics") },
  returns: v.nullable(topicFields),
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.id);
    return topic ? mapTopic(topic) : null;
  },
});

export const getTopicById = getTopicBySystemId;

export const getTopCurrentTopic = internalQuery({
  args: {},
  returns: v.nullable(topicFields),
  handler: async (ctx) => {
    const now = Date.now();
    const topics = await ctx.db.query("topics").collect();
    const active = topics
      .filter((topic) => (topic.status ?? "active") === "active")
      .filter((topic) => topic.startDate === undefined || topic.startDate <= now)
      .filter((topic) => topic.endDate === undefined || topic.endDate >= now)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))[0];

    return active ? mapTopic(active) : null;
  },
});

export const getActiveTakeoverTopicsInternal = internalQuery({
  args: {},
  returns: v.array(topicFields),
  handler: async (ctx) => {
    const topics = await getActiveTakeoverTopicsHelper(ctx);
    return topics.map(mapTopic);
  },
});
