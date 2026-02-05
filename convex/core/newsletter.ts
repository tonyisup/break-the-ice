"use node"

import { action, ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
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
	handler: async (ctx, args): Promise<{
		success: boolean;
		question: string;
		questionUrl: string;
		imageUrl: string;
		unsubscribeUrl: string;
		email: string;
	}> => {
		// 1. Get user and their preferences
		const user: Doc<"users"> | null = await ctx.runQuery(internal.internal.users.getUserByEmail, { email: args.email });

		let question: Doc<"questions"> | null = null;

		if (user && (user.questionPreferenceEmbedding?.length ?? 0) > 0) {
			// 2 & 3. Try to get an existing question or generate one in a single call
			question = await ctx.runAction(api.core.questions.getQuestionForNewsletterWithFallback, {
				userId: user._id,
				randomSeed: Math.random(),
			});
		} else {
			// 4. For non-registered subscribers, just get any random question
			const randomQuestions: any[] = await ctx.runAction(api.core.questions.getNextRandomQuestions, {
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
				if (!identity.email) {
					return {
						success: false,
						status: "error",
						message: "Authenticated user has no email address.",
					};
				}
				const result = await subscribeUser(ctx, identity.email);
				return {
					success: result.success,
					status: result.success ? "subscribed" : "error",
					message: result.message,
				};
			}

			// If unauthenticated, initiate Double Opt-In
			const token = crypto.randomUUID();
			await ctx.runMutation(internal.internal.subscriptions.createPendingSubscription, {
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

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for webhook

			try {
				const response = await fetch(webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: args.email,
						verificationUrl,
						timestamp: new Date().toISOString(),
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					console.error(`Verification webhook failed: ${response.status}`);
					return { success: false, status: "error", message: "Failed to send verification email." };
				}

				return { success: false, status: "verification_required" };
			} finally {
				clearTimeout(timeoutId);
			}
		} catch (error: any) {
			if (error.name === "AbortError") {
				return { success: false, status: "error", message: "Verification request timed out." };
			}
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
		const result = await ctx.runMutation(internal.internal.subscriptions.consumePendingSubscription, {
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
		await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
			email: email,
			status: "subscribed",
		});
		return { success: true, message: "Simulated subscription" };
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

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
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`Webhook failed with status: ${response.status}`);
		}

		await ctx.runMutation(internal.internal.users.setNewsletterStatus, {
			email: email,
			status: "subscribed",
		});

		return { success: true };
	} catch (error: any) {
		if (error.name === "AbortError") {
			throw new Error("Subscription request timed out.");
		}
		console.error("Failed to subscribe to newsletter:", error);
		throw new Error("Failed to subscribe. Please try again later.");
	} finally {
		clearTimeout(timeoutId);
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

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minute timeout for bulk send

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
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Webhook failed with status: ${response.status}`);
			}

			return { success: true };
		} catch (error: any) {
			if (error.name === "AbortError") {
				throw new Error("Daily questions bulk send timed out.");
			}
			console.error("Failed to send daily questions:", error);
			throw new Error("Failed to send daily questions. Please try again later.");
		} finally {
			clearTimeout(timeoutId);
		}
	},
});
