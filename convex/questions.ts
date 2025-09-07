import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { ensureAdmin } from "./auth";

export const discardQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    startTime: v.number(),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { questionId, startTime, style, tone } = args;

    const question = await ctx.db.get(questionId);
    if (question) {

      const analytics = ctx.db.insert("analytics", {
        questionId,
        viewDuration: Date.now() - startTime,
        event: "discard",
        timestamp: Date.now(),
      });

      const updateQuestion = ctx.db.patch(questionId, {
        totalShows: question.totalShows + 1,
        lastShownAt: Date.now(),
      });

      await Promise.all([analytics, updateQuestion]);
    }

    //we only discard AND supply style and tone when running out of questions on the main page
    if (style && tone) { 
      void ctx.scheduler.runAfter(0, api.ai.generateAIQuestion, {
        style,
        tone,
        selectedTags: [],
      });
    }
  },
});
export const getNextQuestions = query({
  args: {
    count: v.number(),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    seen: v.optional(v.array(v.id("questions"))),
  },
  handler: async (ctx, args) => {
    const { count, style, tone, seen } = args;
    const seenIds = new Set(seen ?? []);

    // Get all questions first, and filter out seen ones.
    const allQuestions = (await ctx.db.query("questions").collect()).filter(
      (q) => !seenIds.has(q._id)
    );

    // Filter by category if specified
    let filteredQuestions = allQuestions;
    filteredQuestions = allQuestions.filter(q => (style === undefined || q.style === style) && (tone === undefined || q.tone === tone));

    // Sort by lastShownAt (oldest first) if available, otherwise random
    filteredQuestions.sort((a, b) => {
      const aTime = a.lastShownAt ?? 0;
      const bTime = b.lastShownAt ?? 0;
      return aTime - bTime;
    });

    // Return the requested number of questions
    const result = filteredQuestions.slice(0, count);
    // console.log('Returning questions:', result.length);
    
    return result;
  }
})

export const recordAnalytics = mutation({
  args: {
    questionId: v.id("questions"),
    event: v.union(v.literal("like"), v.literal("discard")),
    viewDuration: v.number(),
  },
  handler: async (ctx, args) => {
    const { questionId, event, viewDuration } = args;
    const question = await ctx.db.get(questionId);
    if (!question) return;

    await ctx.db.insert("analytics", {
      questionId,
      event,
      viewDuration,
      timestamp: Date.now(),
    });

    if (event === "like") {
      await ctx.db.patch(questionId, {
        totalLikes: question.totalLikes + 1,
      });
    }

    // Update average view duration
    const newAverage =
      (question.averageViewDuration * question.totalShows + viewDuration) /
      (question.totalShows + 1);

    await ctx.db.patch(questionId, {
      averageViewDuration: newAverage,
    });
  },
});

export const getQuestionsByIds = query({
  args: {
    ids: v.array(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const { ids } = args;
    const questions = await Promise.all(
      ids.map((id) => ctx.db.get(id))
    );
    return questions.filter((q): q is Doc<"questions"> => q !== null);
  },
});

// Save the generated AI question to the database
export const saveAIQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.array(v.string()),  
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { text, tags, style, tone } = args;
    const oldestQuestion = await getOldestQuestion(ctx);
    const lastShownAt = oldestQuestion ? oldestQuestion[0]?.lastShownAt ?? 0 : 0;
    const id = await ctx.db.insert("questions", {
      text,
      tags,
      style,
      tone,
      isAIGenerated: true,
      // Seed lastShownAt with a small negative value so it is included
      // at the front of the by_last_shown_at ascending index and shows up immediately.
      lastShownAt: lastShownAt - 1,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    return await ctx.db.get(id);
  },
});

async function getOldestQuestion(ctx: QueryCtx) {
  return await ctx.db.query("questions").withIndex("by_last_shown_at").order("asc").take(1);
}

export const getQuestions = query({
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    return await ctx.db.query("questions").collect();
  },
});

export const createQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { text, tags, style, tone } = args;
    return await ctx.db.insert("questions", {
      text,
      tags,
      style,
      tone,
      isAIGenerated: false,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

export const updateQuestion = mutation({
  args: {
    id: v.id("questions"),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { id, text, tags, style, tone } = args;
    await ctx.db.patch(id, { text, tags, style, tone });
  },
});

export const deleteQuestion = mutation({
  args: {
    id: v.id("questions"),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});


// Function to fix existing questions by adding lastShownAt field
export const fixExistingQuestions = mutation({
  handler: async (ctx) => {
    const allQuestions = await ctx.db.query("questions").collect();
    const now = Date.now();
    let fixedCount = 0;
    
    for (const question of allQuestions) {
      if (question.lastShownAt === undefined) {
        await ctx.db.patch(question._id, {
          lastShownAt: now - Math.random() * 10000000 // Random time in the past
        });
        fixedCount++;
      }
    }
    
    return { totalQuestions: allQuestions.length, fixedCount };
  },
});

// Temporary function to add test questions
export const addTestQuestions = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const testQuestions = [
      {
        text: "What's your favorite childhood memory?",
        category: "deep",
        tags: ["memory", "childhood"],
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 1000000, // 1 hour ago
        isAIGenerated: false,
      },
      {
        text: "If you could have any superpower, what would it be?",
        category: "fun",
        tags: ["superpower", "fantasy"],
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 2000000, // 2 hours ago
        isAIGenerated: false,
      },
      {
        text: "What's your biggest professional achievement?",
        category: "professional",
        tags: ["career", "achievement"],
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 3000000, // 3 hours ago
        isAIGenerated: false,
      },
      {
        text: "Would you rather travel to the past or the future?",
        category: "wouldYouRather",
        tags: ["time travel", "choice"],
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 4000000, // 4 hours ago
        isAIGenerated: false,
      },
      {
        text: "Coffee or tea?",
        category: "thisOrThat",
        tags: ["preference", "drink"],
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: now - 5000000, // 5 hours ago
        isAIGenerated: false,
      }
    ];

    const results = [];
    for (const question of testQuestions) {
      const id = await ctx.db.insert("questions", question);
      results.push({ id, text: question.text, category: question.category });
    }
    return results;
  },
});



// Function to update multiple question categories at once
export const updateCategories = mutation({
  args: {
    updates: v.array(v.object({
      id: v.id("questions"),
      style: v.optional(v.string()),
      tone: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const update of args.updates) {
      try {
        await ctx.db.patch(update.id, { style: update.style, tone: update.tone });
        results.push({ id: update.id, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ id: update.id, success: false, error: errorMessage });
      }
    }
    return results;
  },
});
