import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const PREDEFINED_TONES = [
  {
    "id": "fun-silly",
    "name": "Fun & Silly",
    "description": "Light-hearted, whimsical, and designed to spark laughter without deep introspection.",
    "promptGuidanceForAI": "Use playful language, absurd scenarios, and pop-culture references; keep stakes ultra-low.",
    "color": "#FFAB91",
    "icon": "Smile"
  },
  {
    "id": "deep-thoughtful",
    "name": "Deep & Thoughtful",
    "description": "Encourages vulnerability, values, and meaningful reflection; expect longer answers.",
    "promptGuidanceForAI": "Frame questions that invite 'why' and 'how' responses; allow space for emotion.",
    "color": "#6A67CE",
    "icon": "Brain"
  },
  {
    "id": "professional",
    "name": "Professional",
    "description": "Workplace-appropriate, career-focused, and safe for mixed hierarchies.",
    "promptGuidanceForAI": "Avoid politics, religion, or overly personal topics; tie to skills, goals, or industry.",
    "color": "#4CAF50",
    "icon": "Briefcase"
  },
  {
    "id": "nerdy-geeky",
    "name": "Nerdy & Geeky",
    "description": "Celebrates fandoms, tech, science, and niche passions; great for STEM or comic-con crowds.",
    "promptGuidanceForAI": "Reference sci-fi, fantasy, coding, board games, or latest tech memes.",
    "color": "#3F51B5",
    "icon": "Cpu"
  },
  {
    "id": "quick-energizer",
    "name": "Quick Energizer",
    "description": "30-60 second bursts to wake up a room; high energy, low cognitive load.",
    "promptGuidanceForAI": "Keep prompts ultra-short and binary; encourage shouting or hand-raising.",
    "color": "#FFC107",
    "icon": "Zap"
  },
  {
    "id": "nostalgic",
    "name": "Nostalgic",
    "description": "Taps into shared memories of childhood, past decades, or vintage trends.",
    "promptGuidanceForAI": "Use time references (90s, early 2000s, elementary school) to trigger stories.",
    "color": "#FF8A65",
    "icon": "Archive"
  },
  {
    "id": "mysterious-intriguing",
    "name": "Mysterious & Intriguing",
    "description": "Adds an aura of curiosity, riddles, or mild suspense; great for creative teams.",
    "promptGuidanceForAI": "Phrase questions like puzzles or secrets; invite speculation rather than facts.",
    "color": "#673AB7",
    "icon": "EyeOff"
  },
  {
    "id": "wholesome-uplifting",
    "name": "Wholesome & Uplifting",
    "description": "Spreads positivity, gratitude, and feel-good vibes; low snark tolerance.",
    "promptGuidanceForAI": "Focus on kindness, small joys, compliments, or shared wins.",
    "color": "#81C784",
    "icon": "HeartHands"
  },
  {
    "id": "edgy-provocative",
    "name": "Edgy & Provocative",
    "description": "Pushes comfort zones slightly; good for close teams that enjoy debate.",
    "promptGuidanceForAI": "Use controversial hypotheticals or hot takes, but keep it respectful and optional.",
    "color": "#E57373",
    "icon": "Flame"
  },
  {
    "id": "outdoorsy-adventurous",
    "name": "Outdoorsy & Adventurous",
    "description": "Centers on travel, nature, sports, and survival themes; appeals to explorers.",
    "promptGuidanceForAI": "Reference camping, hiking, national parks, or dream destinations.",
    "color": "#4DB6AC",
    "icon": "Mountain"
  }
];

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
  })),
  handler: async (ctx, args) => {
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
		color: v.string(),
		icon: v.string(),
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
			color: args.color,
			icon: args.icon,
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