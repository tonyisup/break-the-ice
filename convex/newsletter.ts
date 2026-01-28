"use node"

import { action, ActionCtx, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import * as crypto from "crypto";

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
      // 2. Try to get an existing question they haven't seen
      question = await ctx.runQuery(api.questions.getQuestionForNewsletter, {
        userId: user._id
      });

      // 3. If no question found, generate a new one
      if (!question) {
        const generatedQuestion = await ctx.runAction(api.ai.generateAIQuestionForFeed, {
          userId: user._id,
        });
        question = Array.isArray(generatedQuestion) ? (generatedQuestion[0] || null) : generatedQuestion;
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
  returns: v.object({
    success: v.boolean(),
    status: v.optional(v.string()),
    message: v.optional(v.string()),
    debugUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Check if user is logged in
      const identity = await ctx.auth.getUserIdentity();

      // If authenticated, proceed with direct subscription (Legacy/Auth Flow)
      if (identity) {
        const result = await subscribeUser(ctx, args.email);
        return {
          success: result.success,
          status: result.success ? "subscribed" : "error",
          message: result.message,
        };
      }

      // If unauthenticated, initiate Double Opt-In
      const token = crypto.randomUUID();
      await ctx.runMutation(internal.subscriptions.createPendingSubscription, {
        email: args.email,
        token,
      });

      const webhookUrl = process.env.N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://breaktheiceberg.com";
      const verificationUrl = `${baseUrl}/verify-subscription?token=${token}`;

      if (!webhookUrl) {
        console.warn("N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL is not set. Simulating verification email sent.");
        return { success: false, status: "verification_required", debugUrl: verificationUrl };
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          verificationUrl,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(`Verification webhook failed: ${response.status}`);
        return { success: false, status: "error", message: "Failed to send verification email." };
      }

      return { success: false, status: "verification_required" };
    } catch (error) {
      console.error("Failed to initiate subscription:", error);
      return {
        success: false,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to initiate subscription. Please try again later.",
      };
    }
  },
});

export const confirmSubscription = action({
  args: { token: v.string() },
  returns: v.object({ success: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ success: boolean; message?: string }> => {
    const result = await ctx.runMutation(internal.subscriptions.consumePendingSubscription, {
      token: args.token,
    });

    if (!result) {
      throw new Error("Invalid or expired verification link.");
    }

    // Now actually subscribe them
    return await subscribeUser(ctx, result.email);
  }
});

// Helper function to reuse the logic
async function subscribeUser(ctx: ActionCtx, email: string): Promise<{ success: boolean; message?: string }> {
  const webhookUrl = process.env.N8N_SUBSCRIBE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("N8N_SUBSCRIBE_WEBHOOK_URL is not set. Simulating success.");
    // For development, we simulate success if the env var isn't set.
    await ctx.runMutation(internal.users.setNewsletterStatus, {
      email: email,
      status: "subscribed",
    });
    return { success: true, message: "Simulated subscription" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        source: "daily_questions_feed",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status: ${response.status}`);
    }

    await ctx.runMutation(internal.users.setNewsletterStatus, {
      email: email,
      status: "subscribed",
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to subscribe to newsletter:", error);
    throw new Error("Failed to subscribe. Please try again later.");
  }
}

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
