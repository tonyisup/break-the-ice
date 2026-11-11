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

    // 2. Update user as admin
    await t.withIdentity({ metadata: { isAdmin: "true" } }).mutation(api.admin.users.updateUser, {
      userId,
      aiUsageCount: 10,
      newsletterSubscriptionStatus: "subscribed",
    });

    // 3. Verify updates
    const updatedUser = await t.run(async (ctx) => {
      return await ctx.db.get(userId);
    });

    expect(updatedUser?.aiUsage?.count).toBe(10);
    expect(updatedUser?.aiUsage?.cycleStart).toBe(123456789); // should be preserved
    expect(updatedUser?.newsletterSubscriptionStatus).toBe("subscribed");
  });

  // Value: protects=an admin's AI usage edit lands on that person's one usage row, the row their quota is read from, and leaves everyone else's alone;
  // fails_when=the edit finds the row by something other than the person (another user's row is patched) or adds a second row for them (the quota's unique read then fails on every AI request);
  // why_new=the edit moved to the by_userId index and no test checked the usage table, only users.aiUsage;
  // seam=none; no_claim=how the quota cycle resets.
  test("admin AI usage edit patches that person's usage row, adds one when missing, and leaves others alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await t.run(async (ctx) => {
      const editedId = await ctx.db.insert("users", { email: "edited@example.com", aiUsage: { count: 3, cycleStart: 1_000 } });
      const otherId = await ctx.db.insert("users", { email: "other@example.com", aiUsage: { count: 7, cycleStart: 2_000 } });
      const noRowId = await ctx.db.insert("users", { email: "norow@example.com" });
      // The other person's row is inserted first, so a read that ignores the person finds it first.
      await ctx.db.insert("userAiUsage", { userId: otherId, count: 7, cycleStart: 2_000 });
      await ctx.db.insert("userAiUsage", { userId: editedId, count: 3, cycleStart: 1_000 });
      return { editedId, otherId, noRowId };
    });
    const admin = t.withIdentity({ metadata: { isAdmin: "true" } });

    await admin.mutation(api.admin.users.updateUser, { userId: ids.editedId, aiUsageCount: 10 });
    await admin.mutation(api.admin.users.updateUser, { userId: ids.noRowId, aiUsageCount: 4 });

    const rows = await t.run(async (ctx) => await ctx.db.query("userAiUsage").collect());
    const byUser = (userId: string) => rows.filter((row) => row.userId === userId).map((row) => ({ count: row.count, cycleStart: row.cycleStart }));
    expect(byUser(ids.editedId)).toEqual([{ count: 10, cycleStart: 1_000 }]);
    expect(byUser(ids.otherId)).toEqual([{ count: 7, cycleStart: 2_000 }]);
    expect(byUser(ids.noRowId)).toEqual([{ count: 4, cycleStart: expect.any(Number) }]);
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
    ).rejects.toThrow("Not an admin");
  });

  test("admin cannot set negative ai usage", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    // 1. Create a regular user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@example.com",
      });
    });

    // 2. Attempt negative update
    await expect(
      t.withIdentity({ metadata: { isAdmin: "true" } }).mutation(api.admin.users.updateUser, {
        userId,
        aiUsageCount: -5,
      })
    ).rejects.toThrow("AI usage count cannot be negative");
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
