import { ActionCtx, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { getResendApiKey } from "../lib/resend";

const DEFAULT_BATCH_SIZE = 100;
const NEWSLETTER_TIME_ZONE = "America/Los_Angeles";
const NEWSLETTER_SEND_HOUR = 10;

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

async function startNewsletterDelivery(
	ctx: ActionCtx,
	args: { deliveryDate?: string; force?: boolean; batchSize?: number },
): Promise<StartNewsletterDeliveryResult> {
	const { deliveryDate: localDeliveryDate, hour } = getLosAngelesDateParts(new Date());
	const deliveryDate = args.deliveryDate ?? localDeliveryDate;

	if (!args.force && hour !== NEWSLETTER_SEND_HOUR) {
		return {
			success: true,
			skipped: true,
			message: `Not newsletter hour in ${NEWSLETTER_TIME_ZONE}`,
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

	const subscribers: Array<Doc<"users">> = await ctx.runQuery(
		internal.internal.users.getNewsletterSubscribers,
		{},
	);
	const subscriberTargets = subscribers
		.filter((subscriber) => Boolean(subscriber.email))
		.map((subscriber) => ({
			userId: subscriber._id,
			email: subscriber.email!.trim().toLowerCase(),
		}));

	const deliveryPlan: {
		targetCount: number;
		createdCount: number;
		existingCount: number;
		pendingCount: number;
	} = await ctx.runMutation(
		internal.internal.newsletterDelivery.createPendingDeliveries,
		{ deliveryDate, subscribers: subscriberTargets },
	);

	if (deliveryPlan.pendingCount === 0) {
		return {
			success: true,
			skipped: true,
			message: "No pending newsletter deliveries.",
			deliveryDate,
			...deliveryPlan,
			scheduledBatchCount: 0,
		};
	}

	const batchSize = Math.max(1, Math.min(args.batchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE));
	const scheduledBatchCount = Math.ceil(deliveryPlan.pendingCount / batchSize);

	for (let i = 0; i < scheduledBatchCount; i++) {
		await ctx.scheduler.runAfter(
			i * 5000,
			internal.internal.newsletterBatch.processNewsletterBatch,
			{ deliveryDate, limit: batchSize },
		);
	}

	return {
		success: true,
		skipped: false,
		message: `Scheduled ${scheduledBatchCount} newsletter delivery batch(es).`,
		deliveryDate,
		...deliveryPlan,
		scheduledBatchCount,
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
