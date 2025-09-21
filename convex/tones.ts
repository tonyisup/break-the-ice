import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getTone = query({
  args: { id: v.string() },
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
    const tone = await ctx.db.query("tones").filter((q) => q.eq(q.field("id"), args.id)).first();
    if (!tone) {
      throw new Error("Tone not found");
    }
    return tone;
  },
});
// Get all available tones
export const getTones = query({
  args: {},
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
  handler: async (ctx) => {
    return await ctx.db.query("tones").withIndex("by_order").order("asc").collect();
  },
});

export const getFilteredTones = query({
  args: {
    excluded: v.array(v.string()),
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
    return await ctx.db.query("tones")
    .withIndex("by_order")
    .order("asc")
    .filter((q) => q.and(... args.excluded.map(toneId => q.neq(q.field("id"), toneId))))
    .collect();
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