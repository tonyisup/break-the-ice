import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { Doc } from "../_generated/dataModel";
import { defaultQualityRubric, latestActiveVersion, latestVersion } from "../lib/taxonomy";
import { internal } from "../_generated/api";

const topicFields = {
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

function sortTopics<T extends { order?: number; slug: string; version: number }>(topics: T[]) {
  return [...topics].sort((a, b) => {
    const orderDelta = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    if (orderDelta !== 0) return orderDelta;
    const slugDelta = a.slug.localeCompare(b.slug);
    if (slugDelta !== 0) return slugDelta;
    return b.version - a.version;
  });
}

function buildActiveTopicList(topics: Doc<"topics">[]) {
  const grouped = new Map<string, Doc<"topics">[]>();
  for (const topic of topics) {
    const slug = topic.slug ?? topic.id;
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(topic);
  }

  const mapped = Array.from(grouped.values())
    .map((docs) => {
      const active = docs.find((doc) => (doc.status ?? "active") === "active");
      const latestActive = active ?? latestActiveVersion(docs);
      return latestActive ? mapTopic(latestActive) : null;
    })
    .filter((topic): topic is ReturnType<typeof mapTopic> => topic !== null);

  return sortTopics(mapped);
}

export const listTopics = query({
  args: {},
  returns: v.array(v.object(topicFields)),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const topics = await ctx.db.query("topics").collect();
    return sortTopics(topics.map(mapTopic));
  },
});

export const getTopicVersions = query({
  args: { slug: v.string() },
  returns: v.array(v.object(topicFields)),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return topics.sort((a, b) => (b.version ?? 1) - (a.version ?? 1)).map(mapTopic);
  },
});

export const getTopics = query({
  args: {},
  returns: v.array(v.object(topicFields)),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const topics = await ctx.db.query("topics").collect();
    return buildActiveTopicList(topics);
  },
});

export const createTopic = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    aiGuidance: v.optional(v.string()),
    order: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    takeoverStartDate: v.optional(v.number()),
    takeoverEndDate: v.optional(v.number()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
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
    scopeBoundaries: v.optional(v.array(v.string())),
    referencePool: v.optional(v.array(v.string())),
    accessibilityNotes: v.optional(v.string()),
  },
  returns: v.id("topics"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existing = await ctx.db
      .query("topics")
      .withIndex("by_slug", (q) => q.eq("slug", args.id))
      .collect();
    if (existing.length > 0) {
      throw new Error(`Topic with slug ${args.id} already exists`);
    }

    const now = Date.now();
    const topicId = await ctx.db.insert("topics", {
      id: args.id,
      slug: args.id,
      name: args.name,
      description: args.description,
      example: args.example,
      promptGuidanceForAI: args.promptGuidanceForAI,
      aiGuidance: args.aiGuidance ?? args.promptGuidanceForAI ?? "",
      order: args.order,
      organizationId: args.organizationId,
      startDate: args.startDate,
      endDate: args.endDate,
      takeoverStartDate: args.takeoverStartDate,
      takeoverEndDate: args.takeoverEndDate,
      icon: args.icon,
      color: args.color,
      version: 1,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? [],
      examples: args.examples ?? [],
      antiExamples: args.antiExamples ?? [],
      quality: args.quality ?? defaultQualityRubric(),
      scopeBoundaries: args.scopeBoundaries ?? [],
      referencePool: args.referencePool ?? [],
      accessibilityNotes: args.accessibilityNotes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.lib.retriever.embedTopic, {
      topicId,
    });

    return topicId;
  },
});

export const updateTopic = mutation({
  args: {
    _id: v.id("topics"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    aiGuidance: v.optional(v.string()),
    order: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    takeoverStartDate: v.optional(v.number()),
    takeoverEndDate: v.optional(v.number()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
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
    scopeBoundaries: v.optional(v.array(v.string())),
    referencePool: v.optional(v.array(v.string())),
    accessibilityNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const existingTopic = await ctx.db.get(args._id);
    if (!existingTopic) throw new Error("Topic not found");

    const now = Date.now();
    const promptGuidanceForAI = args.promptGuidanceForAI ?? existingTopic.promptGuidanceForAI;
    const aiGuidance = args.aiGuidance ?? promptGuidanceForAI ?? "";

    if ((existingTopic.status ?? "active") === "draft") {
      const { _id, ...updates } = args;
      await ctx.db.patch(args._id, {
        ...updates,
        aiGuidance,
        updatedAt: now,
      });

      if (
        updates.name !== undefined ||
        updates.description !== undefined ||
        updates.promptGuidanceForAI !== undefined ||
        updates.aiGuidance !== undefined
      ) {
        await ctx.scheduler.runAfter(0, internal.lib.retriever.embedTopic, {
          topicId: args._id,
        });
      }
      return null;
    }

    const siblings = await ctx.db
      .query("topics")
      .withIndex("by_slug", (q) => q.eq("slug", existingTopic.slug ?? existingTopic.id))
      .collect();
    const nextVersion = (latestVersion(siblings)?.version ?? 1) + 1;

    const topicId = await ctx.db.insert("topics", {
      id: existingTopic.slug ?? existingTopic.id,
      slug: existingTopic.slug ?? existingTopic.id,
      name: args.name ?? existingTopic.name,
      description: args.description ?? existingTopic.description,
      example: args.example ?? existingTopic.example,
      promptGuidanceForAI,
      aiGuidance,
      order: args.order ?? existingTopic.order,
      organizationId: args.organizationId ?? existingTopic.organizationId,
      startDate: args.startDate ?? existingTopic.startDate,
      endDate: args.endDate ?? existingTopic.endDate,
      takeoverStartDate: args.takeoverStartDate ?? existingTopic.takeoverStartDate,
      takeoverEndDate: args.takeoverEndDate ?? existingTopic.takeoverEndDate,
      icon: args.icon ?? existingTopic.icon,
      color: args.color ?? existingTopic.color,
      version: nextVersion,
      status: "draft",
      commonFailureModes: args.commonFailureModes ?? existingTopic.commonFailureModes ?? [],
      distinctFrom: args.distinctFrom ?? existingTopic.distinctFrom ?? [],
      examples: args.examples ?? existingTopic.examples ?? [],
      antiExamples: args.antiExamples ?? existingTopic.antiExamples ?? [],
      quality: args.quality ?? existingTopic.quality ?? defaultQualityRubric(),
      scopeBoundaries: args.scopeBoundaries ?? existingTopic.scopeBoundaries ?? [],
      referencePool: args.referencePool ?? existingTopic.referencePool ?? [],
      accessibilityNotes: args.accessibilityNotes ?? existingTopic.accessibilityNotes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.lib.retriever.embedTopic, {
      topicId,
    });
    return null;
  },
});

export const activateTopicVersion = mutation({
  args: { _id: v.id("topics") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const topicToActivate = await ctx.db.get(args._id);
    if (!topicToActivate) throw new Error("Topic not found");
    const slug = topicToActivate.slug ?? topicToActivate.id;
    const siblings = await ctx.db
      .query("topics")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const previousActive = siblings.find((topic) => topic.status === "active");
    if (previousActive && previousActive._id !== args._id) {
      await ctx.db.patch(previousActive._id, { status: "archived", updatedAt: Date.now() });
    }
    await ctx.db.patch(args._id, { status: "active", updatedAt: Date.now() });
    return null;
  },
});

export const deleteTopic = mutation({
  args: {
    _id: v.id("topics"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const topic = await ctx.db.get(args._id);
    if (!topic) throw new Error("Topic not found");
    await ctx.db.patch(args._id, { status: "archived", updatedAt: Date.now() });
    return null;
  },
});
