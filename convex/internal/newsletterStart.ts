import { ActionCtx, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { getResendApiKey } from "../lib/resend";
import {
	NEWSLETTER_TIME_ZONE,
	canEmailNewsletterTo,
	isLiveNewsletterDeployment,
	newsletterSendHourFor,
} from "../lib/newsletterSending";
import { PROCESSING_STALE_MS } from "./newsletterDelivery";

const DEFAULT_BATCH_SIZE = 100;
// A send that fails late in the evening still has retries left after midnight Pacific, when the
// date has moved on. Each failed row retries once an hour, at most MAX_DELIVERY_ATTEMPTS times,
// so only sends from the last hours of the day can still be retryable this early.
const RETRY_PREVIOUS_DAY_BEFORE_HOUR = 3;

type StartNewsletterDeliveryResult = {
	success: boolean;
	skipped: boolean;
	message: string;
	deliveryDate: string;
	targetCount: number;
	createdCount: number;
	existingCount: number;
	pendingCount: number;
	scheduledBatchCount: number;
};

function getLosAngelesDateParts(now: Date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: NEWSLETTER_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);

	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return {
		deliveryDate: `${values.year}-${values.month}-${values.day}`,
		hour: Number(values.hour),
	};
}

function previousDate(deliveryDate: string) {
	const [year, month, day] = deliveryDate.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** Due in its own hour, or in the first hour after it when the clocks skip it in spring. */
function isDueThisHour(sendHour: number, hour: number, previousHour: number) {
	return sendHour === hour || (previousHour < sendHour && sendHour < hour);
}

async function startNewsletterDelivery(
	ctx: ActionCtx,
	args: { deliveryDate?: string; force?: boolean; batchSize?: number },
): Promise<StartNewsletterDeliveryResult> {
	const now = new Date();
	const { deliveryDate: localDeliveryDate, hour } = getLosAngelesDateParts(now);
	const { hour: previousHour } = getLosAngelesDateParts(new Date(now.getTime() - 60 * 60 * 1000));
	const deliveryDate = args.deliveryDate ?? localDeliveryDate;

	if (!args.force && !isLiveNewsletterDeployment()) {
		return {
			success: true,
			skipped: true,
			message: "Scheduled newsletter sending is off on this deployment.",
			deliveryDate,
			targetCount: 0,
			createdCount: 0,
			existingCount: 0,
			pendingCount: 0,
			scheduledBatchCount: 0,
		};
	}

	const resendApiKey = getResendApiKey();
	if (!resendApiKey) {
		return {
			success: false,
			skipped: true,
			message: "RESEND_API_TOKEN or RESEND_API_KEY is not configured.",
			deliveryDate,
			targetCount: 0,
			createdCount: 0,
			existingCount: 0,
			pendingCount: 0,
			scheduledBatchCount: 0,
		};
	}

	const batchSize = Math.max(1, Math.min(args.batchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE));

	// Only the scheduled run looks back a day: a manual send names the date it means.
	let previousDayBatchCount = 0;
	if (!args.force && !args.deliveryDate && hour < RETRY_PREVIOUS_DAY_BEFORE_HOUR) {
		const retryDate = previousDate(localDeliveryDate);
		const retryPlan: { pendingCount: number } = await ctx.runMutation(
			internal.internal.newsletterDelivery.createPendingDeliveries,
			{
				deliveryDate: retryDate,
				subscribers: [],
				staleProcessingBefore: now.getTime() - PROCESSING_STALE_MS,
			},
		);
		previousDayBatchCount = Math.ceil(retryPlan.pendingCount / batchSize);
		for (let i = 0; i < previousDayBatchCount; i++) {
			await ctx.scheduler.runAfter(
				i * 5000,
				internal.internal.newsletterBatch.processNewsletterBatch,
				{ deliveryDate: retryDate, limit: batchSize },
			);
		}
	}

	const subscribers: Array<Doc<"users">> = await ctx.runQuery(
		internal.internal.users.getNewsletterSubscribers,
		{},
	);
	const subscriberTargets = subscribers
		.filter((subscriber) => Boolean(subscriber.email))
		.filter((subscriber) => args.force || isDueThisHour(newsletterSendHourFor(subscriber), hour, previousHour))
		.filter((subscriber) => canEmailNewsletterTo(subscriber.email!))
		.map((subscriber) => ({
			userId: subscriber._id,
			email: subscriber.email!.trim().toLowerCase(),
		}));

	if (!isLiveNewsletterDeployment() && subscriberTargets.length === 0) {
		return {
			success: true,
			skipped: true,
			message: "No subscribed test recipients. Add them to NEWSLETTER_TEST_RECIPIENTS on this deployment.",
			deliveryDate,
			targetCount: 0,
			createdCount: 0,
			existingCount: 0,
			pendingCount: 0,
			scheduledBatchCount: 0,
		};
	}

	const deliveryPlan: {
		targetCount: number;
		createdCount: number;
		existingCount: number;
		pendingCount: number;
	} = await ctx.runMutation(
		internal.internal.newsletterDelivery.createPendingDeliveries,
		{
			deliveryDate,
			subscribers: subscriberTargets,
			staleProcessingBefore: now.getTime() - PROCESSING_STALE_MS,
		},
	);

	const previousDayNote = previousDayBatchCount > 0
		? ` Also scheduled ${previousDayBatchCount} retry batch(es) for yesterday.`
		: "";

	if (deliveryPlan.pendingCount === 0) {
		return {
			success: true,
			skipped: previousDayBatchCount === 0,
			message: `No pending newsletter deliveries.${previousDayNote}`,
			deliveryDate,
			...deliveryPlan,
			scheduledBatchCount: previousDayBatchCount,
		};
	}

	const todayBatchCount = Math.ceil(deliveryPlan.pendingCount / batchSize);

	for (let i = 0; i < todayBatchCount; i++) {
		await ctx.scheduler.runAfter(
			(previousDayBatchCount + i) * 5000,
			internal.internal.newsletterBatch.processNewsletterBatch,
			{ deliveryDate, limit: batchSize },
		);
	}

	return {
		success: true,
		skipped: false,
		message: `Scheduled ${todayBatchCount} newsletter delivery batch(es).${previousDayNote}`,
		deliveryDate,
		...deliveryPlan,
		scheduledBatchCount: previousDayBatchCount + todayBatchCount,
	};
}

export const startDailyNewsletterIfDue = internalAction({
	args: {},
	returns: v.object({
		success: v.boolean(),
		skipped: v.boolean(),
		message: v.string(),
		deliveryDate: v.string(),
		targetCount: v.number(),
		createdCount: v.number(),
		existingCount: v.number(),
		pendingCount: v.number(),
		scheduledBatchCount: v.number(),
	}),
	handler: async (ctx): Promise<StartNewsletterDeliveryResult> => {
		return startNewsletterDelivery(ctx, { force: false });
	},
});

export const startDailyNewsletter = internalAction({
	args: {
		deliveryDate: v.optional(v.string()),
		batchSize: v.optional(v.number()),
		force: v.optional(v.boolean()),
	},
	returns: v.object({
		success: v.boolean(),
		skipped: v.boolean(),
		message: v.string(),
		deliveryDate: v.string(),
		targetCount: v.number(),
		createdCount: v.number(),
		existingCount: v.number(),
		pendingCount: v.number(),
		scheduledBatchCount: v.number(),
	}),
	handler: async (ctx, args): Promise<StartNewsletterDeliveryResult> => {
		return startNewsletterDelivery(ctx, {
			deliveryDate: args.deliveryDate,
			batchSize: args.batchSize,
			force: args.force ?? true,
		});
	},
});
