import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all available tones
export const getTones = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tones"),
    _creationTime: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("tones").order("asc").collect();
  },
});

export const createTone = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
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
      name: args.name,
      description: args.description,
      promptGuidanceForAI: args.promptGuidanceForAI,
      color: args.color,
      icon: args.icon,
    });
    return toneId;
  },
});

export const updateTone = mutation({
  args: {
    id: v.id("tones"),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingTone = await ctx.db.get(args.id);
    if (existingTone) {
      await ctx.db.patch(args.id, {
        name: args.name,
        description: args.description,
        promptGuidanceForAI: args.promptGuidanceForAI,
        color: args.color,
        icon: args.icon,
      });
    }
  },
});

export const deleteTone = mutation({
  args: { id: v.id("tones") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});