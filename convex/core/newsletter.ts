"use node"

import { action, ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import * as crypto from "crypto";
import {
	createSubscriptionNotificationEmail,
	createSubscriptionVerificationEmail,
} from "../lib/emails";
import { subscribeNewsletterContact } from "../lib/newsletterSubscription";
import { getResendApiKey } from "../lib/resend";

const RESEND_EMAIL_API_URL = "https://api.resend.com/emails";

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
			const resendApiKey = getResendApiKey();
			if (!resendApiKey) {
				throw new Error("A Resend email API key is not configured.");
			}

			const token = crypto.randomUUID();
			await ctx.runMutation(internal.internal.subscriptions.createPendingSubscription, {
				email: args.email,
				token,
			});

			const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://breaktheiceberg.com";
			const verificationUrl = `${baseUrl}/verify-subscription?token=${token}`;

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			try {
				const verificationEmail = createSubscriptionVerificationEmail(verificationUrl);
				const response = await fetch(RESEND_EMAIL_API_URL, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${resendApiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						from: "Daily Ice(berg) Breaker <newsletter@breaktheiceberg.com>",
						to: [args.email],
						subject: verificationEmail.subject,
						html: verificationEmail.html,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					console.error(`Resend verification email failed: ${response.status}`);
					await ctx.runMutation(internal.internal.subscriptions.consumePendingSubscription, {
						token,
					});
					return { success: false, status: "error", message: "Failed to send verification email." };
				}

				return { success: false, status: "verification_required" };
			} catch (error) {
				await ctx.runMutation(internal.internal.subscriptions.consumePendingSubscription, {
					token,
				});
				throw error;
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
	try {
		const result = await subscribeNewsletterContact(ctx, email);

		if (!result.success) throw new Error(result.message || "Resend rejected the subscription.");

		// Notify admin of new subscription
		try {
			const { subject, html } = createSubscriptionNotificationEmail(email);
			await ctx.runAction(internal.email.sendEmail, {
				subject,
				html,
				fromName: "Newsletter Notifier"
			});
		} catch (error) {
			console.error("Failed to send admin notification for subscription:", error);
			// We don't throw here to avoid failing the subscription itself
		}

		return result;
	} catch (error) {
		console.error("Failed to subscribe to newsletter:", error);
		throw new Error("Failed to subscribe. Please try again later.");
	}
}
