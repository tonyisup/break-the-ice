import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const discardQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { questionId, startTime } = args;

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
  },
});
export const getNextQuestions = query({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const { count } = args;
    
    return await ctx.db
      .query("questions")
      .withIndex("by_last_shown_at")
      .order("asc")
      .take(count);
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
    promptUsed: v.string(),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const { text, tags, promptUsed } = args;
    const oldestQuestion = await getOldestQuestion(ctx);
    const lastShownAt = oldestQuestion ? oldestQuestion[0]?.lastShownAt ?? 0 : 0;
    return await ctx.db.insert("questions", {
      text,
      tags,
      promptUsed,
      isAIGenerated: true,
      // Seed lastShownAt with a small negative value so it is included
      // at the front of the by_last_shown_at ascending index and shows up immediately.
      lastShownAt: lastShownAt - 1,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

async function getOldestQuestion(ctx: QueryCtx) {
  return await ctx.db.query("questions").withIndex("by_last_shown_at").order("asc").take(1);
}
