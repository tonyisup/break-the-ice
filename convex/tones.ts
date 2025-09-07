import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const PREDEFINED_TONES = [
	{
		"id": "fun-silly",
		"name": "Fun & Silly",
		"description": "Light-hearted, whimsical, and meme-friendly; lowers defenses through laughter.",
		"promptGuidanceForAI": "Use playful language, emojis, pop-culture references, and absurd hypotheticals."
	},
	{
		"id": "deep-thoughtful",
		"name": "Deep & Thoughtful",
		"description": "Encourages reflection on values, identity, or life purpose; creates emotional intimacy.",
		"promptGuidanceForAI": "Frame questions that ask 'why' and 'what does it mean', avoiding surface-level answers."
	},
	{
		"id": "professional",
		"name": "Professional",
		"description": "Safe for workplace settings; focuses on skills, goals, and industry-relevant topics.",
		"promptGuidanceForAI": "Keep language jargon-appropriate, avoid polarizing or overly personal topics."
	},
	{
		"id": "nerdy-geeky",
		"name": "Nerdy & Geeky",
		"description": "Celebrates fandoms, science, tech, and niche passions; sparks enthusiastic deep dives.",
		"promptGuidanceForAI": "Reference sci-fi, fantasy, coding, board games, or latest tech memes."
	},
	{
		"id": "wholesome-heartwarming",
		"name": "Wholesome & Heartwarming",
		"description": "Spreads positivity and gratitude; leaves participants feeling uplifted.",
		"promptGuidanceForAI": "Use gentle wording, highlight kindness, small joys, or community spirit."
	},
	{
		"id": "edgy-provocative",
		"name": "Edgy & Provocative",
		"description": "Pushes comfort zones slightly; stimulates bold opinions and debate.",
		"promptGuidanceForAI": "Ask about controversial preferences or taboo topics while keeping it respectful."
	},
	{
		"id": "nostalgic-retro",
		"name": "Nostalgic & Retro",
		"description": "Taps into shared memories from childhood or past decades; evokes collective warmth.",
		"promptGuidanceForAI": "Reference 80s/90s/00s culture, vintage tech, or childhood snacks."
	},
	{
		"id": "competitive-trivia",
		"name": "Competitive & Trivia",
		"description": "Gamified and score-oriented; energizes groups who love challenges.",
		"promptGuidanceForAI": "Phrase questions as rapid quizzes or ranking challenges with clear 'win' conditions."
	},
	{
		"id": "mindful-calm",
		"name": "Mindful & Calm",
		"description": "Slows the pace, encourages presence and breathing; ideal for stress relief.",
		"promptGuidanceForAI": "Use soothing language, sensory details, or brief meditation hooks."
	},
	{
		"id": "mysterious-intriguing",
		"name": "Mysterious & Intriguing",
		"description": "Adds suspense or secrecy; invites curiosity and imaginative answers.",
		"promptGuidanceForAI": "Pose questions with unknown outcomes, hidden motives, or enigmatic choices."
	}
];

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
  })),
  handler: async (ctx) => {
    return await ctx.db.query("tones").order("asc").collect();
  },
});

// Initialize tones in the database
export const initializeTones = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if tones already exist
    const existingTones = await ctx.db.query("tones").collect();
    if (existingTones.length > 0) {
      return null; // Tones already initialized
    }

    // Insert predefined tones
    for (const tone of PREDEFINED_TONES) {
      await ctx.db.insert("tones", tone);
    }

    return null;
  },
});

export const createTone = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTone = await ctx.db
      .query("tones")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    if (existingTone) {
      throw new Error("Tone with this id already exists");
    }
    const toneId = await ctx.db.insert("tones", {
      id: args.id,
      name: args.name,
      description: args.description,
      promptGuidanceForAI: args.promptGuidanceForAI,
    });
    return toneId;
  },
});

export const updateTone = mutation({
  args: {
    id: v.id("tones"),
    toneId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptGuidanceForAI: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTone = await ctx.db.get(args.id);
    if (existingTone) {
      await ctx.db.patch(args.id, {
        id: args.toneId,
        name: args.name,
        description: args.description,
        promptGuidanceForAI: args.promptGuidanceForAI,
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