/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Admin users", () => {
  test("admin can update user ai usage and newsletter status", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    // 1. Create a regular user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@example.com",
        aiUsage: { count: 5, cycleStart: 123456789 },
        newsletterSubscriptionStatus: "unsubscribed",
      });
    });

    // 3. Update user as admin
    await t.withIdentity({ metadata: { isAdmin: "true" } }).mutation(api.admin.users.updateUser, {
      userId,
      aiUsageCount: 10,
      newsletterSubscriptionStatus: "subscribed",
    });

    // 4. Verify updates
    const updatedUser = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });

    expect(updatedUser?.aiUsage?.count).toBe(10);
    expect(updatedUser?.aiUsage?.cycleStart).toBe(123456789); // should be preserved
    expect(updatedUser?.newsletterSubscriptionStatus).toBe("subscribed");
  });

  test("non-admin cannot update user", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    // 1. Create a regular user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@example.com",
      });
    });

    // 2. Attempt update as non-admin
    await expect(
      t.withIdentity({ metadata: { isAdmin: "false" } }).mutation(api.admin.users.updateUser, {
        userId,
        aiUsageCount: 10,
      })
    ).rejects.toThrow();
  });

  test("unauthenticated cannot update user", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    // 1. Create a regular user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@example.com",
      });
    });

    // 2. Attempt update without identity
    await expect(
      t.mutation(api.admin.users.updateUser, {
        userId,
        aiUsageCount: 10,
      })
    ).rejects.toThrow("Not authenticated");
  });
});
