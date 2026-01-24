import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";

export const getStyle = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
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
    v.null(),
  ),
  handler: async (ctx, args) => {
    const style = await ctx.db.query("styles")
      .withIndex("by_my_id", (q) => q.eq("id", args.id))
      .unique();
    if (!style) {
      return null;
    }
    const { embedding, ...rest } = style;
    return rest;
  },
});

export const getStylesWithExamples = query({
  args: { id: v.string(), seed: v.optional(v.number()) },
  returns: v.union(
    v.object({
      _id: v.id("styles"),
      _creationTime: v.number(),
      id: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      structure: v.string(),
      color: v.string(),
      icon: v.string(),
      example: v.optional(v.string()),
      examples: v.optional(v.array(v.string())),
      promptGuidanceForAI: v.optional(v.string()),
      order: v.optional(v.float64()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const style = await ctx.db.query("styles")
      .withIndex("by_my_id", (q) => q.eq("id", args.id))
      .unique();
    if (!style) {
      return null;
    }

    const { embedding, ...rest } = style;

    const exampleQuestions = await ctx.db.query("questions")
      .withIndex("by_style", (q) => q.eq("style", args.id))
      .collect();

    const examples = exampleQuestions.map((q) => q.text).filter((q) => q !== undefined);

    if (examples.length === 0) {
      return { ...rest, examples: undefined };
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

    const maxExamples = process.env.MAX_EXAMPLES_PER_STYLE ? parseInt(process.env.MAX_EXAMPLES_PER_STYLE) : 3;
    const sortedExamples = [...examples].sort(() => 0.5 - rng());
    const sampledExamples = sortedExamples.slice(0, maxExamples);

    return {
      ...rest,
      examples: sampledExamples,
    };
  },
});

// Get all available styles
export const getStyles = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
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
    const styles = await ctx.db
      .query("styles")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
      .collect();
    return styles.map(({ embedding, ...rest }) => rest);
  },
});

// Get all available styles
export const getFilteredStyles = query({
  args: {
    excluded: v.array(v.string()),
    organizationId: v.optional(v.id("organizations")),
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
    const styles = await ctx.db.query("styles")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
      .filter((q) => q.and(...args.excluded.map(styleId => q.neq(q.field("id"), styleId))))
      .collect();
    return styles.map(({ embedding, ...rest }) => rest);
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

export const getStylesWithMissingEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const styles = await ctx.db.query("styles").collect();
    return styles.filter((s) => !s.embedding);
  },
});

export const getStyleBySystemId = internalQuery({
  args: { id: v.id("styles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const addStyleEmbedding = internalMutation({
  args: {
    styleId: v.id("styles"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.styleId, {
      embedding: args.embedding,
    });
  },
});

export const getRandomStyle = query({
  args: { seed: v.optional(v.number()) },
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
    examples: v.optional(v.array(v.string())),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.float64()),
  }),
  handler: async (ctx, args) => {
    const styles = await ctx.db.query("styles").withIndex("by_order").order("asc").collect();
    if (styles.length === 0) {
      throw new Error("No styles found in the database");
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

    const index = Math.floor(rng() * styles.length);
    const randomStyle = styles[index];
    const { embedding, ...rest } = randomStyle;
    return rest;
  },
});