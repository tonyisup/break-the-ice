import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { canEmailNewsletterTo } from "../lib/newsletterSending";

export const MAX_DELIVERY_ATTEMPTS = 3;
export const PROCESSING_STALE_MS = 15 * 60 * 1000;
const UNKNOWN_SEND_OUTCOME = "Send outcome unknown. Not retried, so the reader can't get it twice.";
const OUT_OF_ATTEMPTS = "Stopped after repeated failed attempts.";

function canRetry(row: { attemptCount: number; safeToRetry?: boolean }, maxAttempts: number) {
  return row.safeToRetry === true && row.attemptCount < maxAttempts;
}

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
  questionId: v.optional(v.id("questions")),
});

export const createPendingDeliveries = internalMutation({
  args: {
    deliveryDate: v.string(),
    subscribers: v.array(v.object({
      userId: v.id("users"),
      email: v.string(),
    })),
    staleProcessingBefore: v.optional(v.number()),
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

    const existingDeliveries = await ctx.db
      .query("newsletterDeliveries")
      .withIndex("by_deliveryDate_email", (q) =>
        q.eq("deliveryDate", args.deliveryDate)
      )
      .collect();

    const existingEmails = new Set(
      existingDeliveries.map((d) => d.email.trim().toLowerCase())
    );

    for (const subscriber of args.subscribers) {
      const email = subscriber.email.trim().toLowerCase();
      if (!email) {
        continue;
      }

      if (existingEmails.has(email)) {
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

    // A batch that died leaves rows only a later claim can recover or close.
    const staleBefore = args.staleProcessingBefore;
    const staleProcessing = staleBefore === undefined
      ? []
      : (await ctx.db
          .query("newsletterDeliveries")
          .withIndex("by_deliveryDate_status", (q) =>
            q.eq("deliveryDate", args.deliveryDate).eq("status", "processing")
          )
          .collect()).filter((row) => (row.claimedAt ?? 0) < staleBefore);

    return {
      targetCount: args.subscribers.length,
      createdCount,
      existingCount,
      pendingCount:
        pending.length +
        retryableFailed.filter((row) => canRetry(row, MAX_DELIVERY_ATTEMPTS)).length +
        staleProcessing.length,
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
          .filter((row) => canRetry(row, args.maxAttempts))
          .slice(0, args.limit - candidates.length),
      );
    }

    const staleProcessing = (
      await ctx.db
        .query("newsletterDeliveries")
        .withIndex("by_deliveryDate_status", (q) =>
          q.eq("deliveryDate", args.deliveryDate).eq("status", "processing")
        )
        .collect()
    ).filter((row) => (row.claimedAt ?? 0) < args.staleProcessingBefore);

    // A batch that died mid-send may have delivered, and one that keeps dying has to stop.
    for (const row of staleProcessing) {
      if (!canRetry(row, args.maxAttempts)) {
        await ctx.db.patch(row._id, {
          status: "failed",
          error: row.safeToRetry === true ? OUT_OF_ATTEMPTS : UNKNOWN_SEND_OUTCOME,
          updatedAt: now,
        });
      }
    }

    if (candidates.length < args.limit) {
      candidates.push(
        ...staleProcessing
          .filter((row) => canRetry(row, args.maxAttempts))
          .slice(0, args.limit - candidates.length),
      );
    }

    for (const delivery of candidates.slice(0, args.limit)) {
      // A retry can run hours later: respect an unsubscribe made since the row was created.
      const user = await ctx.db.get(delivery.userId);
      if (user?.newsletterSubscriptionStatus !== "subscribed" || !canEmailNewsletterTo(delivery.email)) {
        await ctx.db.patch(delivery._id, {
          status: "failed",
          attemptCount: Math.max(delivery.attemptCount, args.maxAttempts),
          error: "Not sent: this address can no longer receive the newsletter from this deployment.",
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.patch(delivery._id, {
        status: "processing",
        attemptCount: delivery.attemptCount + 1,
        claimedAt: now,
        updatedAt: now,
        error: undefined,
        safeToRetry: true,
      });
      claimed.push({
        _id: delivery._id,
        email: delivery.email,
        userId: delivery.userId,
        attemptCount: delivery.attemptCount + 1,
        questionId: delivery.questionId,
      });
    }

    return claimed;
  },
});

export const markNewsletterDeliveriesSending = internalMutation({
  args: {
    deliveries: v.array(v.object({
      deliveryId: v.id("newsletterDeliveries"),
      questionId: v.id("questions"),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const { deliveryId, questionId } of args.deliveries) {
      if (!(await ctx.db.get(deliveryId))) continue;
      await ctx.db.patch(deliveryId, { safeToRetry: false, questionId, updatedAt: now });
    }
    return null;
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
      // Deleting an account removes its deliveries, even one a batch is sending.
      if (!(await ctx.db.get(delivery.deliveryId))) continue;
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
    // True only when Resend definitely refused the send, which makes a retry safe.
    sendRejected: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const error = args.error.slice(0, 1000);

    for (const deliveryId of args.deliveryIds) {
      if (!(await ctx.db.get(deliveryId))) continue;
      await ctx.db.patch(deliveryId, {
        status: "failed",
        error,
        updatedAt: now,
        ...(args.sendRejected ? { safeToRetry: true } : {}),
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
