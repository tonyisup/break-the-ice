import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all available tags
export const getTags = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("tags"),
    _creationTime: v.number(),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("tags").order("asc").collect();
  },
});

// Initialize tags in the database
export const initializeTags = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if tags already exist
    const existingTags = await ctx.db.query("tags").collect();
    if (existingTags.length > 0) {
      return null; // Tags already initialized
    }

    // Predefined tags for different categories
    const PREDEFINED_TAGS = [
      { name: "fitness", category: "health", description: "Questions about fitness and exercise" },
      { name: "work", category: "professional", description: "Questions about work and career" },
      { name: "travel", category: "lifestyle", description: "Questions about travel and adventures" },
      { name: "food", category: "lifestyle", description: "Questions about food and cooking" },
      { name: "music", category: "entertainment", description: "Questions about music and entertainment" },
      { name: "movies", category: "entertainment", description: "Questions about movies and TV shows" },
      { name: "books", category: "entertainment", description: "Questions about books and reading" },
      { name: "technology", category: "professional", description: "Questions about technology and gadgets" },
      { name: "family", category: "personal", description: "Questions about family and relationships" },
      { name: "hobbies", category: "personal", description: "Questions about hobbies and interests" },
      { name: "dreams", category: "personal", description: "Questions about dreams and aspirations" },
      { name: "childhood", category: "personal", description: "Questions about childhood memories" },
      { name: "learning", category: "personal", description: "Questions about learning and education" },
      { name: "adventure", category: "lifestyle", description: "Questions about adventure and exploration" },
      { name: "creativity", category: "personal", description: "Questions about creativity and art" },
    ];

    // Insert predefined tags
    for (const tag of PREDEFINED_TAGS) {
      await ctx.db.insert("tags", tag);
    }

    return null;
  },
});
