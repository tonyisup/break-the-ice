import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all available styles
export const getStyles = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("styles"),
    _creationTime: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("styles").order("asc").collect();
  },
});

export const createStyle = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingStyle = await ctx.db
      .query("styles")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (existingStyle) {
      throw new Error("Style with this name already exists");
    }
    const styleId = await ctx.db.insert("styles", {
      name: args.name,
      description: args.description,
      structure: args.structure,
      color: args.color,
      icon: args.icon,
      example: args.example,
      promptGuidanceForAI: args.promptGuidanceForAI,
    });
    return styleId;
  },
});

export const updateStyle = mutation({
  args: {
    id: v.id("styles"),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingStyle = await ctx.db.get(args.id);
    if (existingStyle) {
      await ctx.db.patch(args.id, {
        name: args.name,
        description: args.description,
        structure: args.structure,
        color: args.color,
        icon: args.icon,
        example: args.example,
        promptGuidanceForAI: args.promptGuidanceForAI,
      });
    }
  },
});

export const deleteStyle = mutation({
  args: { id: v.id("styles") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});