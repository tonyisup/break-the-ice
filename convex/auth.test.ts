/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { isPaidTeamMember, type BillingStatus } from "./auth";
import schema from "./schema";

const identity = { subject: "paid-member", tokenIdentifier: "test|paid-member" };

async function setup(unpaidCount: number, paidStatus?: BillingStatus) {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: identity.subject });
    const unpaidId = await ctx.db.insert("organizations", {
      name: "Inactive team", planTier: "team", billingStatus: "inactive",
    });
    for (let i = 0; i < unpaidCount; i++) {
      await ctx.db.insert("organization_members", { userId, organizationId: unpaidId, role: "member" });
    }
    if (paidStatus) {
      const paidId = await ctx.db.insert("organizations", {
        name: "Paid team", planTier: "team", billingStatus: paidStatus,
      });
      await ctx.db.insert("organization_members", { userId, organizationId: paidId, role: "member" });
    }
    return userId;
  });
  return { t, userId };
}

describe("isPaidTeamMember", () => {
  test.each(["active", "trialing"] as const)("finds a %s team after two unpaid pages", async (status) => {
    const { t } = await setup(201, status);
    await t.withIdentity(identity).run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      expect(await isPaidTeamMember(ctx)).toBe(true);
      expect(query.mock.calls.filter(([table]) => table === "organization_members")).toHaveLength(3);
    });
  });

  test("stops reading memberships and organizations as soon as a paid team is found", async () => {
    const { t, userId } = await setup(0, "active");
    await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { name: "Later team" });
      for (let i = 0; i < 201; i++) {
        await ctx.db.insert("organization_members", { userId, organizationId, role: "member" });
      }
    });
    await t.withIdentity(identity).run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      const get = vi.spyOn(ctx.db, "get");
      expect(await isPaidTeamMember(ctx)).toBe(true);
      expect(query.mock.calls.filter(([table]) => table === "organization_members")).toHaveLength(1);
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  test.each([0, 201])("returns false after exhausting %s unpaid memberships", async (count) => {
    const { t } = await setup(count);
    expect(await t.withIdentity(identity).run(isPaidTeamMember)).toBe(false);
  });

  test("starts from the first page for each matching user", async () => {
    const { t } = await setup(201);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: identity.subject });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Paid team", planTier: "team", billingStatus: "active",
      });
      await ctx.db.insert("organization_members", { userId, organizationId, role: "member" });
    });
    expect(await t.withIdentity(identity).run(isPaidTeamMember)).toBe(true);
  });

  test("returns false for an anonymous caller", async () => {
    const { t } = await setup(0, "active");
    expect(await t.run(isPaidTeamMember)).toBe(false);
  });
});
