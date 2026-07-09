import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { createDailyQuestionEmail } from "../lib/emails";
import { getResendApiKey } from "../lib/resend";
import { MAX_DELIVERY_ATTEMPTS } from "./newsletterDelivery";

const DEFAULT_BATCH_SIZE = 100;
const PROCESSING_STALE_MS = 15 * 60 * 1000;

type BatchResult = {
	success: boolean;
	processedCount: number;
	sentCount: number;
	failedCount: number;
};

type ClaimedDelivery = {
	_id: Id<"newsletterDeliveries">;
	email: string;
	userId: Id<"users">;
	attemptCount: number;
};

type PreparedDelivery = {
	deliveryId: Id<"newsletterDeliveries">;
	questionId: Id<"questions">;
	payload: {
		from: string;
		to: string;
		subject: string;
		html: string;
		headers: Record<string, string>;
	};
};

export const processNewsletterBatch = internalAction({
	args: {
		deliveryDate: v.string(),
		limit: v.number(),
	},
	returns: v.object({
		success: v.boolean(),
		processedCount: v.number(),
		sentCount: v.number(),
		failedCount: v.number(),
	}),
	handler: async (ctx, args): Promise<BatchResult> => {
		const resendApiKey = getResendApiKey();
		if (!resendApiKey) {
			return { success: false, processedCount: 0, sentCount: 0, failedCount: 0 };
		}

		const claimed: ClaimedDelivery[] = await ctx.runMutation(
			internal.internal.newsletterDelivery.claimNewsletterDeliveries,
			{
				deliveryDate: args.deliveryDate,
				limit: Math.min(args.limit, DEFAULT_BATCH_SIZE),
				maxAttempts: MAX_DELIVERY_ATTEMPTS,
				staleProcessingBefore: Date.now() - PROCESSING_STALE_MS,
			},
		);

		if (claimed.length === 0) {
			return { success: true, processedCount: 0, sentCount: 0, failedCount: 0 };
		}

		const prepared: PreparedDelivery[] = [];
		const questionFailures: Id<"newsletterDeliveries">[] = [];

		for (const delivery of claimed) {
			try {
				const question: {
					questionId: Id<"questions">;
					question: string;
					questionUrl: string;
					unsubscribeUrl: string;
				} = await ctx.runAction(
					internal.internal.newsletter.getQuestionForUser,
					{ email: delivery.email },
				);
				const email = createDailyQuestionEmail({
					question: question.question,
					questionUrl: question.questionUrl,
					unsubscribeUrl: question.unsubscribeUrl,
				});

				prepared.push({
					deliveryId: delivery._id,
					questionId: question.questionId,
					payload: {
						from: "Daily Ice(berg) Breaker <newsletter@breaktheiceberg.com>",
						to: delivery.email,
						subject: email.subject,
						html: email.html,
						headers: {
							"List-Unsubscribe": `<${question.unsubscribeUrl}>`,
						},
					},
				});
			} catch (error) {
				questionFailures.push(delivery._id);
				console.error(`Failed to prepare newsletter delivery for ${delivery.email}:`, error);
			}
		}

		if (questionFailures.length > 0) {
			await ctx.runMutation(
				internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed,
				{
					deliveryIds: questionFailures,
					error: "Failed to prepare personalized newsletter question.",
				},
			);
		}

		if (prepared.length === 0) {
			return {
				success: questionFailures.length === 0,
				processedCount: claimed.length,
				sentCount: 0,
				failedCount: questionFailures.length,
			};
		}

		try {
			const abortController = new AbortController();
			const timeoutId = setTimeout(() => abortController.abort(), 30000);

			const batchPayload = prepared.map((item) => item.payload);
			const deliveryIds = prepared.map((item) => item.deliveryId).sort().join(",");
			const idempotencyKey = `newsletter-${args.deliveryDate}-${deliveryIds}`;

			const response = await fetch("https://api.resend.com/emails/batch", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${resendApiKey.trim()}`,
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify(batchPayload),
				signal: abortController.signal,
			}).finally(() => clearTimeout(timeoutId));

			const responseText = await response.text();
			let result: { data?: Array<{ id?: string }>; message?: string; body?: string } = {};
			try {
				result = responseText ? JSON.parse(responseText) : {};
			} catch {
				result = { body: responseText };
			}

			if (!response.ok) {
				throw new Error(result.message || result.body || `Resend batch failed with status ${response.status}`);
			}

			const resendResults = Array.isArray(result.data) ? result.data : [];
			await ctx.runMutation(
				internal.internal.newsletterDelivery.markNewsletterDeliveriesSent,
				{
					deliveries: prepared.map((item, index) => ({
						deliveryId: item.deliveryId,
						questionId: item.questionId,
						resendEmailId: resendResults[index]?.id,
					})),
				},
			);

			return {
				success: questionFailures.length === 0,
				processedCount: claimed.length,
				sentCount: prepared.length,
				failedCount: questionFailures.length,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to send Resend newsletter batch.";
			console.error("Failed to send newsletter batch:", error);
			await ctx.runMutation(
				internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed,
				{
					deliveryIds: prepared.map((item) => item.deliveryId),
					error: message,
				},
			);
			return {
				success: false,
				processedCount: claimed.length,
				sentCount: 0,
				failedCount: claimed.length,
			};
		}
	},
});
