import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

test("newsletter deliveries are created once per email per date and claimed once", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Newsletter User",
      email: "reader@example.com",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  const firstPlan = await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-02",
    subscribers: [{ userId, email: "Reader@Example.com" }],
  });

  expect(firstPlan).toMatchObject({
    targetCount: 1,
    createdCount: 1,
    existingCount: 0,
    pendingCount: 1,
  });

  const secondPlan = await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-02",
    subscribers: [{ userId, email: "reader@example.com" }],
  });

  expect(secondPlan).toMatchObject({
    targetCount: 1,
    createdCount: 0,
    existingCount: 1,
    pendingCount: 1,
  });

  const claimed = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-02",
    limit: 100,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(claimed).toHaveLength(1);
  expect(claimed[0]?.email).toBe("reader@example.com");

  const duplicateClaim = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-02",
    limit: 100,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(duplicateClaim).toHaveLength(0);
});

test("failed deliveries can be retried up to max attempts", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-03",
    subscribers: [{ userId, email: "test@example.com" }],
  });

  const firstClaim = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-03",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(firstClaim).toHaveLength(1);
  expect(firstClaim[0]?.attemptCount).toBe(1);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
    deliveryIds: [firstClaim[0]!._id],
    error: "Test failure",
  });

  const secondClaim = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-03",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(secondClaim).toHaveLength(1);
  expect(secondClaim[0]?.attemptCount).toBe(2);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
    deliveryIds: [secondClaim[0]!._id],
    error: "Test failure 2",
  });

  const thirdClaim = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-03",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(thirdClaim).toHaveLength(1);
  expect(thirdClaim[0]?.attemptCount).toBe(3);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
    deliveryIds: [thirdClaim[0]!._id],
    error: "Test failure 3",
  });

  const fourthClaim = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-03",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(fourthClaim).toHaveLength(0);
});

test("stale processing deliveries can be reclaimed", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Stale User",
      email: "stale@example.com",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-04",
    subscribers: [{ userId, email: "stale@example.com" }],
  });

  const oldTime = Date.now() - 20 * 60 * 1000;

  const claimed = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-04",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: oldTime,
  });

  expect(claimed).toHaveLength(1);

  const notStaleYet = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-04",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(notStaleYet).toHaveLength(0);

  const nowStale = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-04",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() + 1000,
  });

  expect(nowStale).toHaveLength(1);
  expect(nowStale[0]?.attemptCount).toBe(2);
});

test("markNewsletterDeliveriesSent marks deliveries as sent with question and resend IDs", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Sent User",
      email: "sent@example.com",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  const questionId = await t.run(async (ctx) => {
    return await ctx.db.insert("questions", {
      text: "Test question?",
      averageViewDuration: 0,
      totalLikes: 0,
      totalShows: 0,
    });
  });

  await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-05",
    subscribers: [{ userId, email: "sent@example.com" }],
  });

  const claimed = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-05",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(claimed).toHaveLength(1);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesSent, {
    deliveries: [{
      deliveryId: claimed[0]!._id,
      questionId: questionId,
      resendEmailId: "resend-123",
    }],
  });

  const delivery = await t.run(async (ctx) => {
    return await ctx.db.get(claimed[0]!._id);
  });

  expect(delivery?.status).toBe("sent");
  expect(delivery?.questionId).toBe(questionId);
  expect(delivery?.resendEmailId).toBe("resend-123");
  expect(delivery?.error).toBeUndefined();
  expect(delivery?.sentAt).toBeDefined();
});

test("markNewsletterDeliveriesFailed marks deliveries as failed with error message", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Failed User",
      email: "failed@example.com",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-06",
    subscribers: [{ userId, email: "failed@example.com" }],
  });

  const claimed = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-06",
    limit: 10,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(claimed).toHaveLength(1);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
    deliveryIds: [claimed[0]!._id],
    error: "Network timeout error",
  });

  const delivery = await t.run(async (ctx) => {
    return await ctx.db.get(claimed[0]!._id);
  });

  expect(delivery?.status).toBe("failed");
  expect(delivery?.error).toBe("Network timeout error");
});

test("getDeliveryCounts returns accurate counts for each status", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userIds = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await ctx.db.insert("users", {
        name: `User ${i}`,
        email: `user${i}@example.com`,
        newsletterSubscriptionStatus: "subscribed",
      }));
    }
    return ids;
  });

  const questionId = await t.run(async (ctx) => {
    return await ctx.db.insert("questions", {
      text: "Count test?",
      averageViewDuration: 0,
      totalLikes: 0,
      totalShows: 0,
    });
  });

  await t.mutation(internal.internal.newsletterDelivery.createPendingDeliveries, {
    deliveryDate: "2026-07-07",
    subscribers: userIds.map((userId, i) => ({ userId, email: `user${i}@example.com` })),
  });

  const claimed = await t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: "2026-07-07",
    limit: 3,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });

  expect(claimed).toHaveLength(3);

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesSent, {
    deliveries: [{
      deliveryId: claimed[0]!._id,
      questionId: questionId,
      resendEmailId: "id1",
    }],
  });

  await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
    deliveryIds: [claimed[1]!._id],
    error: "Test error",
  });

  const counts = await t.query(internal.internal.newsletterDelivery.getDeliveryCounts, {
    deliveryDate: "2026-07-07",
  });

  expect(counts.pending).toBe(2);
  expect(counts.processing).toBe(1);
  expect(counts.sent).toBe(1);
  expect(counts.failed).toBe(1);
});
