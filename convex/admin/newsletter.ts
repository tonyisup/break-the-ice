import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import {
	assertSubscribeAllowed,
	assertValidNewsletterSendHour,
} from "../lib/newsletterSending";

const DELIVERY_HISTORY_LIMIT = 14;

const subscriberFields = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	name: v.optional(v.string()),
	email: v.optional(v.string()),
	newsletterSubscriptionStatus: v.optional(
		v.union(v.literal("subscribed"), v.literal("unsubscribed")),
	),
	newsletterSendHour: v.optional(v.number()),
});

const deliveryCounts = v.object({
	pending: v.number(),
	processing: v.number(),
	sent: v.number(),
	failed: v.number(),
});

const triggerResult = v.object({
	success: v.boolean(),
	skipped: v.boolean(),
	message: v.string(),
	deliveryDate: v.string(),
	targetCount: v.number(),
	createdCount: v.number(),
	existingCount: v.number(),
	pendingCount: v.number(),
	scheduledBatchCount: v.number(),
});

type TriggerNewsletterResult = {
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

function toSubscriber(user: Doc<"users">) {
	return {
		_id: user._id,
		_creationTime: user._creationTime,
		name: user.name,
		email: user.email,
		newsletterSubscriptionStatus: user.newsletterSubscriptionStatus,
		newsletterSendHour: user.newsletterSendHour,
	};
}

export const getSubscribers = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("subscribed"),
				v.literal("unsubscribed"),
				v.literal("never"),
				v.literal("all"),
			),
		),
	},
	returns: v.array(subscriberFields),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const status = args.status ?? "subscribed";

		if (status === "all") {
			const users = await ctx.db.query("users").collect();
			return users.map(toSubscriber);
		}

		const indexedStatus = status === "never" ? undefined : status;
		const users = await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", indexedStatus),
			)
			.collect();
		return users.map(toSubscriber);
	},
});

export const getPendingSubscriptions = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("pendingSubscriptions"),
			_creationTime: v.number(),
			email: v.string(),
		}),
	),
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		const pending = await ctx.db.query("pendingSubscriptions").order("desc").collect();
		// The token is left out: it would let whoever reads it confirm the sign-up.
		return pending.map(({ _id, _creationTime, email }) => ({ _id, _creationTime, email }));
	},
});

export const removePendingSubscription = mutation({
	args: { pendingId: v.id("pendingSubscriptions") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		if (await ctx.db.get(args.pendingId)) {
			await ctx.db.delete(args.pendingId);
		}
		return null;
	},
});

export const getDeliveryHistory = query({
	args: { userId: v.id("users") },
	returns: v.array(
		v.object({
			_id: v.id("newsletterDeliveries"),
			deliveryDate: v.string(),
			status: v.union(
				v.literal("pending"),
				v.literal("processing"),
				v.literal("sent"),
				v.literal("failed"),
			),
			attemptCount: v.number(),
			error: v.optional(v.string()),
			sentAt: v.optional(v.number()),
			questionText: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const rows = await ctx.db
			.query("newsletterDeliveries")
			.withIndex("by_userId_deliveryDate", (q) => q.eq("userId", args.userId))
			.order("desc")
			.take(DELIVERY_HISTORY_LIMIT);

		return await Promise.all(
			rows.map(async (row) => {
				const question = row.questionId ? await ctx.db.get(row.questionId) : null;
				return {
					_id: row._id,
					deliveryDate: row.deliveryDate,
					status: row.status,
					attemptCount: row.attemptCount,
					error: row.error,
					sentAt: row.sentAt,
					questionText: question?.text ?? question?.customText,
				};
			}),
		);
	},
});

export const setSendHour = mutation({
	args: {
		userId: v.id("users"),
		// null returns them to the default send time.
		hour: v.union(v.number(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		if (args.hour !== null) assertValidNewsletterSendHour(args.hour);
		if (!(await ctx.db.get(args.userId))) {
			throw new Error("User not found");
		}
		await ctx.db.patch(args.userId, { newsletterSendHour: args.hour ?? undefined });
		return null;
	},
});

export const getStats = query({
	args: { deliveryDate: v.string() },
	returns: v.object({
		subscribedCount: v.number(),
		unsubscribedCount: v.number(),
		pendingVerificationCount: v.number(),
		deliveryDate: v.string(),
		deliveryCounts: deliveryCounts,
	}),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		// Run all database queries in parallel
		const [subscribed, unsubscribed, pendingVerifications, deliveryCountsResult] = await Promise.all([
			ctx.db
				.query("users")
				.withIndex("by_newsletterSubscriptionStatus", (q) =>
					q.eq("newsletterSubscriptionStatus", "subscribed"),
				)
				.collect(),
			ctx.db
				.query("users")
				.withIndex("by_newsletterSubscriptionStatus", (q) =>
					q.eq("newsletterSubscriptionStatus", "unsubscribed"),
				)
				.collect(),
			ctx.db.query("pendingSubscriptions").collect(),
			Promise.all([
				ctx.db
					.query("newsletterDeliveries")
					.withIndex("by_deliveryDate_status", (q) =>
						q.eq("deliveryDate", args.deliveryDate).eq("status", "pending"),
					)
					.collect(),
				ctx.db
					.query("newsletterDeliveries")
					.withIndex("by_deliveryDate_status", (q) =>
						q.eq("deliveryDate", args.deliveryDate).eq("status", "processing"),
					)
					.collect(),
				ctx.db
					.query("newsletterDeliveries")
					.withIndex("by_deliveryDate_status", (q) =>
						q.eq("deliveryDate", args.deliveryDate).eq("status", "sent"),
					)
					.collect(),
				ctx.db
					.query("newsletterDeliveries")
					.withIndex("by_deliveryDate_status", (q) =>
						q.eq("deliveryDate", args.deliveryDate).eq("status", "failed"),
					)
					.collect(),
			]).then(([pending, processing, sent, failed]) => ({
				pending: pending.length,
				processing: processing.length,
				sent: sent.length,
				failed: failed.length,
			})),
		]);

		return {
			subscribedCount: subscribed.length,
			unsubscribedCount: unsubscribed.length,
			pendingVerificationCount: pendingVerifications.length,
			deliveryDate: args.deliveryDate,
			deliveryCounts: deliveryCountsResult,
		};
	},
});

export const setSubscriptionStatus = mutation({
	args: {
		userId: v.id("users"),
		status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
		confirmSubscribe: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) {
			throw new Error("User not found");
		}
		assertSubscribeAllowed(user, args.status, args.confirmSubscribe);

		await ctx.db.patch(args.userId, {
			newsletterSubscriptionStatus: args.status,
		});
		return null;
	},
});

export const triggerDailyNewsletter = action({
	args: {
		deliveryDate: v.optional(v.string()),
		batchSize: v.optional(v.number()),
	},
	returns: triggerResult,
	handler: async (ctx, args): Promise<TriggerNewsletterResult> => {
		await ensureAdmin(ctx);

		const result: TriggerNewsletterResult = await ctx.runAction(
			internal.internal.newsletterStart.startDailyNewsletter,
			{
				deliveryDate: args.deliveryDate,
				batchSize: args.batchSize,
				force: true,
			},
		);
		return result;
	},
});
