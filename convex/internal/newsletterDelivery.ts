import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

const deliveryStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("sent"),
  v.literal("failed"),
);

const claimedDelivery = v.object({
  _id: v.id("newsletterDeliveries"),
  email: v.string(),
  userId: v.id("users"),
  attemptCount: v.number(),
});

export const createPendingDeliveries = internalMutation({
  args: {
    deliveryDate: v.string(),
    subscribers: v.array(v.object({
      userId: v.id("users"),
      email: v.string(),
    })),
  },
  returns: v.object({
    targetCount: v.number(),
    createdCount: v.number(),
    existingCount: v.number(),
    pendingCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let createdCount = 0;
    let existingCount = 0;

    for (const subscriber of args.subscribers) {
      const email = subscriber.email.trim().toLowerCase();
      if (!email) {
        continue;
      }

      const existing = await ctx.db
        .query("newsletterDeliveries")
        .withIndex("by_deliveryDate_email", (q) =>
          q.eq("deliveryDate", args.deliveryDate).eq("email", email)
        )
        .first();

      if (existing) {
        existingCount++;
        continue;
      }

      await ctx.db.insert("newsletterDeliveries", {
        deliveryDate: args.deliveryDate,
        email,
        userId: subscriber.userId,
        status: "pending",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      createdCount++;
    }

    const pending = await ctx.db
      .query("newsletterDeliveries")
      .withIndex("by_deliveryDate_status", (q) =>
        q.eq("deliveryDate", args.deliveryDate).eq("status", "pending")
      )
      .collect();

    const retryableFailed = await ctx.db
      .query("newsletterDeliveries")
      .withIndex("by_deliveryDate_status", (q) =>
        q.eq("deliveryDate", args.deliveryDate).eq("status", "failed")
      )
      .collect();

    return {
      targetCount: args.subscribers.length,
      createdCount,
      existingCount,
      pendingCount: pending.length + retryableFailed.filter((row) => row.attemptCount < 3).length,
    };
  },
});

export const claimNewsletterDeliveries = internalMutation({
  args: {
    deliveryDate: v.string(),
    limit: v.number(),
    maxAttempts: v.number(),
    staleProcessingBefore: v.number(),
  },
  returns: v.array(claimedDelivery),
  handler: async (ctx, args) => {
    const now = Date.now();
    const claimed = [];

    const candidates = [];

    const pending = await ctx.db
      .query("newsletterDeliveries")
      .withIndex("by_deliveryDate_status", (q) =>
        q.eq("deliveryDate", args.deliveryDate).eq("status", "pending")
      )
      .take(args.limit);
    candidates.push(...pending);

    if (candidates.length < args.limit) {
      const failed = await ctx.db
        .query("newsletterDeliveries")
        .withIndex("by_deliveryDate_status", (q) =>
          q.eq("deliveryDate", args.deliveryDate).eq("status", "failed")
        )
        .collect();
      candidates.push(
        ...failed
          .filter((row) => row.attemptCount < args.maxAttempts)
          .slice(0, args.limit - candidates.length),
      );
    }

    if (candidates.length < args.limit) {
      const staleProcessing = await ctx.db
        .query("newsletterDeliveries")
        .withIndex("by_deliveryDate_status", (q) =>
          q.eq("deliveryDate", args.deliveryDate).eq("status", "processing")
        )
        .collect();
      candidates.push(
        ...staleProcessing
          .filter((row) => (row.claimedAt ?? 0) < args.staleProcessingBefore)
          .slice(0, args.limit - candidates.length),
      );
    }

    for (const delivery of candidates.slice(0, args.limit)) {
      await ctx.db.patch(delivery._id, {
        status: "processing",
        attemptCount: delivery.attemptCount + 1,
        claimedAt: now,
        updatedAt: now,
        error: undefined,
      });
      claimed.push({
        _id: delivery._id,
        email: delivery.email,
        userId: delivery.userId,
        attemptCount: delivery.attemptCount + 1,
      });
    }

    return claimed;
  },
});

export const markNewsletterDeliveriesSent = internalMutation({
  args: {
    deliveries: v.array(v.object({
      deliveryId: v.id("newsletterDeliveries"),
      questionId: v.id("questions"),
      resendEmailId: v.optional(v.string()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const delivery of args.deliveries) {
      await ctx.db.patch(delivery.deliveryId, {
        status: "sent",
        questionId: delivery.questionId,
        resendEmailId: delivery.resendEmailId,
        error: undefined,
        sentAt: now,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const markNewsletterDeliveriesFailed = internalMutation({
  args: {
    deliveryIds: v.array(v.id("newsletterDeliveries")),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const error = args.error.slice(0, 1000);

    for (const deliveryId of args.deliveryIds) {
      await ctx.db.patch(deliveryId, {
        status: "failed",
        error,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const getDeliveryCounts = internalQuery({
  args: { deliveryDate: v.string() },
  returns: v.object({
    pending: v.number(),
    processing: v.number(),
    sent: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const counts = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };

    for (const status of ["pending", "processing", "sent", "failed"] as const) {
      const rows = await ctx.db
        .query("newsletterDeliveries")
        .withIndex("by_deliveryDate_status", (q) =>
          q.eq("deliveryDate", args.deliveryDate).eq("status", status)
        )
        .collect();
      counts[status] = rows.length;
    }

    return counts;
  },
});
