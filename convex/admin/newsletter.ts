import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";

const subscriberFields = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	name: v.optional(v.string()),
	email: v.optional(v.string()),
	newsletterSubscriptionStatus: v.optional(
		v.union(v.literal("subscribed"), v.literal("unsubscribed")),
	),
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
	};
}

export const getSubscribers = query({
	args: {
		status: v.optional(
			v.union(v.literal("subscribed"), v.literal("unsubscribed"), v.literal("all")),
		),
	},
	returns: v.array(subscriberFields),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const status = args.status ?? "subscribed";

		if (status === "all") {
			const subscribed = await ctx.db
				.query("users")
				.withIndex("by_newsletterSubscriptionStatus", (q) =>
					q.eq("newsletterSubscriptionStatus", "subscribed"),
				)
				.collect();
			const unsubscribed = await ctx.db
				.query("users")
				.withIndex("by_newsletterSubscriptionStatus", (q) =>
					q.eq("newsletterSubscriptionStatus", "unsubscribed"),
				)
				.collect();
			return [...subscribed, ...unsubscribed].map(toSubscriber);
		}

		const users = await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", status),
			)
			.collect();
		return users.map(toSubscriber);
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

		const subscribed = await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", "subscribed"),
			)
			.collect();
		const unsubscribed = await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", "unsubscribed"),
			)
			.collect();
		const pendingVerifications = await ctx.db.query("pendingSubscriptions").collect();

		const deliveryCountsResult = {
			pending: 0,
			processing: 0,
			sent: 0,
			failed: 0,
		};

		for (const status of ["pending", "processing", "sent", "failed"] as const) {
			const rows = await ctx.db
				.query("newsletterDeliveries")
				.withIndex("by_deliveryDate_status", (q) =>
					q.eq("deliveryDate", args.deliveryDate).eq("status", status),
				)
				.collect();
			deliveryCountsResult[status] = rows.length;
		}

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
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) {
			throw new Error("User not found");
		}

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
