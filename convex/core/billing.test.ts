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

test("entitlements don't change with a workspace an old app sends", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "7");
  const t = convexTest(schema, convexFunctionModules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      email: "member@example.com",
      clerkId: "user_123",
      tokenIdentifier: "https://clerk.example|user_123",
    });
  });

  const entitlements = await t
    .withIdentity(identity)
    .query(api.core.billing.getEffectiveEntitlements, { organizationId: "k57c3m8a9e2zq0organization" });
  expect(entitlements).toMatchObject({ planTier: "free", billingStatus: "inactive", aiLimit: 7 });
});

test("entitlements are null for a signed-out caller and for an account that isn't stored yet", async () => {
  const t = convexTest(schema, convexFunctionModules);

  expect(await t.query(api.core.billing.getEffectiveEntitlements, {})).toBeNull();
  expect(await t.withIdentity(identity).query(api.core.billing.getEffectiveEntitlements, {})).toBeNull();
});
