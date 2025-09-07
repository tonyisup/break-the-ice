import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Shared predefined styles configuration
export const PREDEFINED_STYLES = [
	{
		"id": "open-ended",
		"name": "Open Ended",
		"description": "Invites narrative and personal storytelling; low risk of a 'wrong' answer, so people open up quickly.",
		"structure": "What's the best / worst / strangest ___ you've ever ___?",
		"color": "#FF6B6B",
		"icon": "HelpCircle",
		"example": "What's the best accidental meal you've ever cooked?",
		"promptGuidanceForAI": "The style of this question should be open-ended and invite interesting thoughts and conversation."
	},
	{
		"id": "would-you-rather",
		"name": "Would You Rather",
		"description": "Forces a binary choice, sparks instant debate and reveals priorities.",
		"structure": "Would you rather A or B? (make A and B equally plausible)",
		"color": "#4ECDC4",
		"icon": "GitBranch",
		"example": "Would you rather speak every language fluently or play every instrument?",
		"promptGuidanceForAI": "Present two equally tempting or equally awful options to create playful tension."
	},
	{
		"id": "hypothetical-time",
		"name": "Hypothetical Time Warp",
		"description": "Safe escapism that uncovers values and dreams without real-world stakes.",
		"structure": "If you could ___ for one day/week/hour, what would you ___?",
		"color": "#FFE66D",
		"icon": "Clock",
		"example": "If you could swap lives with any historical figure for 24 h, who and why?",
		"promptGuidanceForAI": "Keep the timeframe short and the premise imaginative to maximize creativity."
	},
	{
		"id": "desert-island",
		"name": "Desert Island",
		"description": "Prioritization game that shows practical versus sentimental sides.",
		"structure": "You're stranded on an island; you can only bring/keep/eat ___.",
		"color": "#95E1D3",
		"icon": "Anchor",
		"example": "Three albums, one book, one luxury—go.",
		"promptGuidanceForAI": "Limit the items to a clear, small number to force tough choices."
	},
	{
		"id": "super-power-caveat",
		"name": "Super-Power Caveats",
		"description": "Creativity plus risk assessment; people weigh gain against quirky drawbacks.",
		"structure": "You get X power but Y drawback—take it?",
		"color": "#F38181",
		"icon": "Zap",
		"example": "You can fly, but every time you land you forget the last five minutes—still in?",
		"promptGuidanceForAI": "Balance an appealing power with an amusing but non-trivial downside."
	},
	{
		"id": "rapid-fire-either",
		"name": "Rapid-Fire Either/Or",
		"description": "Momentum and laughter via quick micro-choices; lowers stakes.",
		"structure": "Hot or cold? Coffee or tea? Elevator or stairs? (≤2 s each)",
		"color": "#AA96DA",
		"icon": "Shuffle",
		"example": "Hot or cold? Coffee or tea? Zoom or phone?",
		"promptGuidanceForAI": "Keep choices binary and pace snappy to maintain energy."
	},
	{
		"id": "bucket-list-rank",
		"name": "Bucket-List Ranking",
		"description": "Future-oriented and aspirational; surfaces deep goals.",
		"structure": "Top three ___ you still need to ___.",
		"color": "#FCBAD3",
		"icon": "List",
		"example": "Top three concerts still on your bucket list?",
		"promptGuidanceForAI": "Ask for a small, ranked set to keep answers focused and comparable."
	},
	{
		"id": "guilty-pleasure",
		"name": "Guilty-Pleasure Confession",
		"description": "Vulnerability creates fast intimacy through shared embarrassment.",
		"structure": "What's your most embarrassing/guilty pleasure ___?",
		"color": "#A8E6CF",
		"icon": "Heart",
		"example": "What's your go-to trash-TV show?",
		"promptGuidanceForAI": "Keep the topic light to ensure safety while sharing."
	},
	{
		"id": "time-capsule",
		"name": "Time-Capsule Snapshot",
		"description": "Nostalgia and self-reflection; objects trigger rich stories.",
		"structure": "If we opened a capsule from your life X years ago, what three objects would be inside?",
		"color": "#FFD93D",
		"icon": "Box",
		"example": "2019-you packed a shoebox—what's in it?",
		"promptGuidanceForAI": "Limit to a handful of tangible items to spark concrete memories."
	},
	{
		"id": "reverse-interview",
		"name": "Reverse Interview",
		"description": "Shifts responsibility to the group, encouraging curiosity about each other.",
		"structure": "You have to interview the person next to you—what's your first question?",
		"color": "#6C5CE7",
		"icon": "MessageCircle",
		"example": "Turn to the person on your right—what's the first thing you want to know about them?",
		"promptGuidanceForAI": "Encourage questions that move beyond small talk."
	},
	{
		"id": "one-word-whip",
		"name": "One-Word Whip-Around",
		"description": "Brevity equals safety; ensures everyone speaks early.",
		"structure": "In one word, how do you feel about ___? (go around the circle)",
		"color": "#FD79A8",
		"icon": "Type",
		"example": "One word for Mondays?",
		"promptGuidanceForAI": "Choose a universal topic so any single word is meaningful."
	},
	{
		"id": "most-likely-badge",
		"name": "Most-Likely Badge",
		"description": "Metaphorical self-labeling adds humor and quick identity reveals.",
		"structure": "Which Marvel hero/kitchen appliance/90s song are you most like and why?",
		"color": "#FDCB6E",
		"icon": "Award",
		"example": "Which kitchen appliance captures your work style?",
		"promptGuidanceForAI": "Pick a fun category that lends itself to creative comparisons."
	},
	{
		"id": "micro-prediction",
		"name": "Micro-Prediction",
		"description": "Future reflection lowers present anxiety and sparks insight.",
		"structure": "Five minutes from now, what will you wish you had said/done?",
		"color": "#74B9FF",
		"icon": "TrendingUp",
		"example": "When this call ends, what will you wish you'd shared?",
		"promptGuidanceForAI": "Keep the timeframe short to maintain immediacy."
	},
	{
		"id": "gratitude-lightning",
		"name": "Gratitude Lightning Round",
		"description": "Positive affect and accessibility; everyone can name something cheap.",
		"structure": "Name one cheap thing under $5 that improved your life.",
		"color": "#81ECEC",
		"icon": "Smile",
		"example": "Best under-$5 purchase you've ever made?",
		"promptGuidanceForAI": "Set a low price cap so answers stay humble and relatable."
	},
	{
		"id": "third-option",
		"name": "Take the Third Option",
		"description": "Breaks binary thinking and rewards creativity.",
		"structure": "Present two obvious choices, then require a creative third.",
		"color": "#A29BFE",
		"icon": "GitPullRequest",
		"example": "Text only in emojis OR movie quotes—OR invent a third style.",
		"promptGuidanceForAI": "Encourage answers that reject both choices in a fun way."
	}
];

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
  })),
  handler: async (ctx) => {
    return await ctx.db.query("styles").order("asc").collect();
  },
});

// Initialize styles in the database
export const initializeStyles = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if styles already exist
    const existingStyles = await ctx.db.query("styles").collect();
    if (existingStyles.length > 0) {
      return null; // Styles already initialized
    }

    // Insert predefined styles
    for (const style of PREDEFINED_STYLES) {
      await ctx.db.insert("styles", style);
    }

    return null;
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
  },
  handler: async (ctx, args) => {
    const existingStyle = await ctx.db
      .query("styles")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    if (existingStyle) {
      throw new Error("Style with this id already exists");
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
    });
    return styleId;
  },
});

export const updateStyle = mutation({
  args: {
    id: v.id("styles"),
    styleId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingStyle = await ctx.db.get(args.id);
    if (existingStyle) {
      await ctx.db.patch(args.id, {
        id: args.styleId,
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