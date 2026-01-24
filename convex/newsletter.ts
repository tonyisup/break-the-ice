"use node"

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const getQuestionForUser = action({
  args: { email: v.string() },
  returns: v.object({
    success: v.boolean(),
    question: v.string(),
    questionUrl: v.string(),
    imageUrl: v.string(),
    unsubscribeUrl: v.string(),
    email: v.string(),
  }),
  handler: async (ctx, args) => {
    // 1. Get user and their preferences
    const user = await ctx.runQuery(internal.users.getUserByEmail, { email: args.email });

    let question: any;

    if (user) {
      const style = user.defaultStyle || "Fun";
      const tone = user.defaultTone || "Casual";

      const userQuestions = await ctx.runQuery(internal.users.getUserLikedQuestions, { userId: user._id });
      const seenIds = userQuestions.map((uq: any) => uq.questionId);

      // 2. Try to get an existing question they haven't seen
      const questions: any[] = await ctx.runQuery(api.questions.getNextQuestions, {
        count: 1,
        style,
        tone,
        seen: seenIds,
      });
      question = questions[0];

      // 3. If no question found, generate a new one
      if (!question) {
        const generatedQuestions: any[] = await ctx.runAction(api.ai.generateAIQuestions, {
          style,
          tone,
          userId: user._id,
        });
        question = generatedQuestions[0];
      }
    } else {
      // 4. For non-registered subscribers, just get any random question
      const randomQuestions: any[] = await ctx.runQuery(api.questions.getNextRandomQuestions, {
        count: 1,
      });
      question = randomQuestions[0];
    }

    if (!question) {
      throw new Error("Could not find or generate a question.");
    }

    // 4. Return the question details
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://breaktheiceberg.com";
    const questionText: string = question.text || question.customText || "";
    return {
      success: true,
      question: questionText,
      questionUrl: `${baseUrl}/question/${question._id}`,
      imageUrl: `${baseUrl}/api/og?id=${question._id}`,
      unsubscribeUrl: `${baseUrl}/unsubscribe?email=${encodeURIComponent(args.email)}`,
      email: args.email,
    };
  },
});

export const subscribe = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_SUBSCRIBE_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn("N8N_SUBSCRIBE_WEBHOOK_URL is not set. Simulating success.");
      // For development, we simulate success if the env var isn't set.
      return { success: true, message: "Simulated subscription" };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: args.email,
          source: "daily_questions_feed",
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to subscribe to newsletter:", error);
      throw new Error("Failed to subscribe. Please try again later.");
    }
  },
});

export const sendDailyQuestions = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_DAILY_QUESTIONS_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn("N8N_DAILY_QUESTIONS_WEBHOOK_URL is not set. Simulating success.");
      // For development, we simulate success if the env var isn't set.
      return { success: true, message: "Simulated sending" };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "daily_questions_feed",
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to send daily questions:", error);
      throw new Error("Failed to send daily questions. Please try again later.");
    }
  },
});