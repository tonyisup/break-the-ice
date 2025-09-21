import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getStyle = query({
  args: { id: v.string() },
  returns: v.object({
    _id: v.id("styles"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
  }),
  handler: async (ctx, args) => {
    const style = await ctx.db.query("styles").filter((q) => q.eq(q.field("id"), args.id)).first();
    if (!style) {
      throw new Error("Style not found");
    }
    return style;
  },
});

// Get all available styles
export const getStyles = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("styles"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("styles").withIndex("by_order").order("asc").collect();
  },
});

// Get all available styles
export const getFilteredStyles = query({
  args: {
    excluded: v.array(v.string()),
  },
  returns: v.array(v.object({
    _id: v.id("styles"),
    _creationTime: v.number(),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
  })),
  handler: async (ctx, args) => {
      return await ctx.db.query("styles")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.and(... args.excluded.map(styleId => q.neq(q.field("id"), styleId))))
      .collect();    
  },
});

export const createStyle = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
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
      id: args.id,
      name: args.name,
      description: args.description,
      structure: args.structure,
      color: args.color,
      icon: args.icon,
      example: args.example,
      promptGuidanceForAI: args.promptGuidanceForAI,
      order: args.order,
    });
    return styleId;
  },
});

export const updateStyle = mutation({
  args: {
    _id: v.id("styles"),
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existingStyle = await ctx.db.get(args._id);
    if (existingStyle) {
      await ctx.db.patch(args._id, {
        name: args.name,
        description: args.description,
        structure: args.structure,
        color: args.color,
        icon: args.icon,
        example: args.example,
        promptGuidanceForAI: args.promptGuidanceForAI,
        order: args.order,
      });
    }
  },
});

export const deleteStyle = mutation({
  args: { id: v.id("styles") },
  handler: async (ctx, args) => {
    const styleToDelete = await ctx.db.get(args.id);
    if (!styleToDelete) {
      throw new Error("Style not found");
    }

    const questionsToDelete = await ctx.db
      .query("questions")
      .withIndex("by_style", (q) => q.eq("style", styleToDelete.id))
      .collect();

    await Promise.all(questionsToDelete.map((q) => ctx.db.delete(q._id)));

    await ctx.db.delete(args.id);
  },
});