import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { useQuery } from "convex/react";

export const seedQuestions = mutation({
  args: {},
  handler: async (ctx) => {
    const questions = [
      "If you could master any skill instantly, what would it be?",
      "What's the best piece of advice you've ever received?",
      "If you could have dinner with any historical figure, who would it be and why?",
      "What's the most adventurous thing you've ever done?",
      "If you could live anywhere in the world for a year, where would you choose?",
      "What's a hobby you've always wanted to try but haven't yet?",
      "What's the most interesting documentary you've watched?",
      "If you could instantly become an expert in one subject, what would it be?",
      "What's the best gift you've ever given someone?",
      "If you could have any animal as a pet (real or mythical), what would you choose?",
      "What's a small thing that always brightens your day?",
      "If you could solve one global problem instantly, what would it be?",
      "What's a tradition from your culture that you really appreciate?",
      "If you could time travel, would you go to the past or future?",
      "What's the most beautiful place you've ever been to?",
    ];

    for (const text of questions) {
      const question = await ctx.db.query("questions").filter((q) => q.eq(q.field("text"), text)).first();
      if (question) {
        continue;
      }
      await ctx.db.insert("questions", {
        text,
        totalLikes: 0,
        totalShows: 0,
        averageViewDuration: 0,
      });
    }
  },
});
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
export const getRandomQuestions = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const { count } = args;
    let questions = await ctx.db.query("questions").collect();

    questions = questions.sort((a, b) =>
      (a.lastShownAt ?? 0) - (b.lastShownAt ?? 0)
      + (b.averageViewDuration ?? 0) - (a.averageViewDuration ?? 0)
      + (b.totalLikes ?? 0) - (a.totalLikes ?? 0)
    ).slice(0, count);

    for (const question of questions) {
      await ctx.db.patch(question._id, {
        lastShownAt: Date.now(),
      });
    }

    return questions;
  },
});

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
