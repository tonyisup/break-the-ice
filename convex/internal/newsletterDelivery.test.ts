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
