"use node"

import { action } from "./_generated/server";
import { v } from "convex/values";

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
      return { success: true, message: "Simulated subscription" };
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