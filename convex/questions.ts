import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
