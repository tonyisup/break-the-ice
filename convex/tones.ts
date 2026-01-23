import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

export const getTone = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("tones"),
      _creationTime: v.number(),
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      promptGuidanceForAI: v.string(),
      color: v.string(),
      icon: v.string(),
      order: v.optional(v.float64()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const tone = await ctx.db.query("tones")
      .withIndex("by_my_id", (q) => q.eq("id", args.id))
      .unique();
    if (!tone) {
      return null;
    }
    const { embedding, ...rest } = tone;
    return rest;
  },
});
// Get all available tones
export const getTones = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object({
    _id: v.id("tones"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
    order: v.optional(v.float64()),
  })),
  handler: async (ctx, args) => {
    const tones = await ctx.db
      .query("tones")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
      .collect();
    return tones.map(({ embedding, ...rest }) => rest);
  },
});

export const getFilteredTones = query({
  args: {
    excluded: v.array(v.string()),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.object({
    _id: v.id("tones"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
    order: v.optional(v.float64()),
  })),
  handler: async (ctx, args) => {
    const tones = await ctx.db.query("tones")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
      .filter((q) => q.and(...args.excluded.map(toneId => q.neq(q.field("id"), toneId))))
      .collect();
    return tones.map(({ embedding, ...rest }) => rest);
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
  },
  handler: async (ctx, args) => {
    const existingTone = await ctx.db
      .query("tones")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (existingTone) {
      throw new Error("Tone with this name already exists");
    }
    const toneId = await ctx.db.insert("tones", {
      id: args.id,
      name: args.name,
      description: args.description,
      promptGuidanceForAI: args.promptGuidanceForAI,
      color: args.color,
      icon: args.icon,
      order: args.order,
    });
    return toneId;
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
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingTone = await ctx.db.get(args._id);
    if (existingTone) {
      await ctx.db.patch(args._id, {
        name: args.name,
        description: args.description,
        promptGuidanceForAI: args.promptGuidanceForAI,
        color: args.color,
        icon: args.icon,
        order: args.order,
      });
    }
  },
});

export const deleteTone = mutation({
  args: { id: v.id("tones") },
  handler: async (ctx, args) => {
    const toneToDelete = await ctx.db.get(args.id);
    if (!toneToDelete) {
      throw new Error("Tone not found");
    }

    const questionsToDelete = await ctx.db
      .query("questions")
      .withIndex("by_tone", (q) => q.eq("tone", toneToDelete.id))
      .collect();

    await Promise.all(questionsToDelete.map((q) => ctx.db.delete(q._id)));

    await ctx.db.delete(args.id);
  },
});

export const getTonesWithMissingEmbeddings = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tones"),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
    order: v.optional(v.float64()),
  })),
  handler: async (ctx) => {
    const tones = await ctx.db.query("tones").filter((q) => q.eq(q.field("embedding"), undefined)).collect();
    return tones.map(({ embedding, ...rest }) => rest);
  },
});

export const addToneEmbedding = internalMutation({
  args: {
    toneId: v.id("tones"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.toneId, {
      embedding: args.embedding,
    });
  },
});

export const getRandomTone = query({
  args: { seed: v.optional(v.number()) },
  returns: v.object({
    _id: v.id("tones"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
    order: v.optional(v.float64()),
  }),
  handler: async (ctx, args) => {
    const tones = await ctx.db.query("tones").withIndex("by_order").order("asc").collect();
    if (tones.length === 0) {
      throw new Error("No tones found in the database");
    }

    const seed = args.seed ?? Math.random() * 0xFFFFFFFF;
    const mulberry32 = (a: number) => {
      return () => {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      }
    };
    const rng = mulberry32(seed);

    const index = Math.floor(rng() * tones.length);
    const randomTone = tones[index];
    const { embedding, ...rest } = randomTone;
    return rest;
  },
});
