import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

afterEach(() => vi.unstubAllEnvs());

const identity = {
  subject: "user_123",
  tokenIdentifier: "https://clerk.example|user_123",
  email: "member@example.com",
};

test("entitlements are the person's own: the one plan's allowance and the billing status on their account", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "7");
  const t = convexTest(schema, convexFunctionModules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      email: "member@example.com",
      clerkId: "user_123",
      tokenIdentifier: "https://clerk.example|user_123",
      billingStatus: "active",
      billingSubjectType: "user",
    }),
  );

  expect(await t.withIdentity(identity).query(api.core.billing.getEffectiveEntitlements, {})).toEqual({
    userId,
    planTier: "free",
    billingStatus: "active",
    aiLimit: 7,
    billingSubjectType: "user",
  });
});

test("entitlements don't change with a paying team the person belonged to, or with a workspace an old app sends", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "7");
  const t = convexTest(schema, convexFunctionModules);
  const organizationId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "member@example.com",
      clerkId: "user_123",
      tokenIdentifier: "https://clerk.example|user_123",
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Acme Workspace",
      planTier: "team",
      billingStatus: "active",
    });
    await ctx.db.insert("organization_members", { userId, organizationId, role: "admin" });
    return organizationId;
  });

  const entitlements = await t
    .withIdentity(identity)
    .query(api.core.billing.getEffectiveEntitlements, { organizationId });
  expect(entitlements).toMatchObject({ planTier: "free", billingStatus: "inactive", aiLimit: 7 });
});

test("entitlements are null for a signed-out caller and for an account that isn't stored yet", async () => {
  const t = convexTest(schema, convexFunctionModules);

  expect(await t.query(api.core.billing.getEffectiveEntitlements, {})).toBeNull();
  expect(await t.withIdentity(identity).query(api.core.billing.getEffectiveEntitlements, {})).toBeNull();
});
