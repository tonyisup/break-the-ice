import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { createDailyQuestionEmail } from "../lib/emails";
import { getResendApiKey } from "../lib/resend";
import { MAX_DELIVERY_ATTEMPTS, PROCESSING_STALE_MS } from "./newsletterDelivery";

const DEFAULT_BATCH_SIZE = 100;

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
	questionId?: Id<"questions">;
};

type PreparedDelivery = {
	deliveryId: Id<"newsletterDeliveries">;
	questionId: Id<"questions">;
	attemptCount: number;
	payload: {
		from: string;
		to: string;
		subject: string;
		html: string;
		headers: Record<string, string>;
	};
};

/** A 4xx means Resend refused the batch, except a timeout or a clash with an earlier request. */
function isDefiniteRejection(status: number) {
	return status >= 400 && status < 500 && status !== 408 && status !== 409;
}

/** Hashed so the key stays short for a full batch. A retry is a new attempt, so a new key. */
async function batchIdempotencyKey(deliveryDate: string, claimed: ClaimedDelivery[], sentIds: Set<string>) {
	const parts = claimed
		.filter((delivery) => sentIds.has(delivery._id))
		.map((delivery) => `${delivery._id}:${delivery.attemptCount}`)
		.sort()
		.join(",");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
	const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `newsletter-${deliveryDate}-${hash}`;
}

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
					{ email: delivery.email, reuseQuestionId: delivery.questionId },
				);
				const email = createDailyQuestionEmail({
					question: question.question,
					questionUrl: question.questionUrl,
					unsubscribeUrl: question.unsubscribeUrl,
				});

				prepared.push({
					deliveryId: delivery._id,
					questionId: question.questionId,
					attemptCount: delivery.attemptCount,
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

		const owned: Id<"newsletterDeliveries">[] = await ctx.runMutation(
			internal.internal.newsletterDelivery.markNewsletterDeliveriesSending,
			{
				deliveries: prepared.map(({ deliveryId, questionId, attemptCount }) => ({
					deliveryId,
					questionId,
					attemptCount,
				})),
			},
		);
		// Only rows this batch still owns are sent; a row reclaimed meanwhile is another batch's.
		const ownedIds = new Set<string>(owned);
		const sending = prepared.filter((item) => ownedIds.has(item.deliveryId));
		if (sending.length === 0) {
			return {
				success: questionFailures.length === 0,
				processedCount: claimed.length,
				sentCount: 0,
				failedCount: questionFailures.length,
			};
		}

		let sendRejected = false;
		try {
			const batchPayload = sending.map((item) => item.payload);
			const idempotencyKey = await batchIdempotencyKey(args.deliveryDate, claimed, ownedIds);

			const abortController = new AbortController();
			const timeoutId = setTimeout(() => abortController.abort(), 30000);

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
				sendRejected = isDefiniteRejection(response.status);
				throw new Error(result.message || result.body || `Resend batch failed with status ${response.status}`);
			}

			const resendResults = Array.isArray(result.data) ? result.data : [];
			await ctx.runMutation(
				internal.internal.newsletterDelivery.markNewsletterDeliveriesSent,
				{
					deliveries: sending.map((item, index) => ({
						deliveryId: item.deliveryId,
						questionId: item.questionId,
						resendEmailId: resendResults[index]?.id,
					})),
				},
			);

			return {
				success: questionFailures.length === 0,
				processedCount: claimed.length,
				sentCount: sending.length,
				failedCount: questionFailures.length,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to send Resend newsletter batch.";
			console.error("Failed to send newsletter batch:", error);
			await ctx.runMutation(
				internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed,
				{
					deliveryIds: sending.map((item) => item.deliveryId),
					error: message,
					sendRejected,
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
