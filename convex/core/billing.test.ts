import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

test("syncOrganizationFromClerk uses active Clerk org claims for membership role", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Existing User",
      email: "member@example.com",
    });
  });

  const identity = {
    subject: "user_123",
    tokenIdentifier: "https://clerk.example|user_123",
    email: "member@example.com",
    name: "Existing User",
    o: {
      id: "org_123",
      rol: "admin",
      name: "Acme Workspace",
    },
  };

  const organizationId = (await t.withIdentity(identity).mutation(
    api.core.billing.syncOrganizationFromClerk,
    {},
  )) as Id<"organizations">;

  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    const organization = await ctx.db.get(organizationId);
    const membership = await ctx.db
      .query("organization_members")
      .withIndex("by_userId_organizationId", (q) =>
        q.eq("userId", userId).eq("organizationId", organizationId!),
      )
      .unique();

    expect(user?.clerkId).toBe("user_123");
    expect(user?.tokenIdentifier).toBe("https://clerk.example|user_123");
    expect(organization?.clerkOrganizationId).toBe("org_123");
    expect(organization?.name).toBe("Acme Workspace");
    expect(membership?.role).toBe("admin");
  });
});

test("syncOrganizationFromClerk defaults role to member when org claim has no rol", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const organizationId = await t.withIdentity({
    subject: "user_roleless",
    tokenIdentifier: "https://clerk.example|user_roleless",
    email: "roleless@example.com",
    name: "Roleless User",
    o: {
      id: "org_no_role",
      name: "No Role Org",
    },
  }).mutation(api.core.billing.syncOrganizationFromClerk, {});

  expect(organizationId).not.toBeNull();

  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_roleless"))
      .unique();
    expect(user).not.toBeNull();
    const org = await ctx.db.get(organizationId!);
    expect(org?.name).toBe("No Role Org");
    const membership = await ctx.db
      .query("organization_members")
      .withIndex("by_userId_organizationId", (q) =>
        q.eq("userId", user!._id).eq("organizationId", organizationId!),
      )
      .unique();
    expect(membership?.role).toBe("member");
  });
});

test("syncOrganizationFromClerk returns null when user has no active Clerk organization", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const result = await t.withIdentity({
    subject: "user_456",
    tokenIdentifier: "https://clerk.example|user_456",
    email: "user@example.com",
  }).mutation(api.core.billing.syncOrganizationFromClerk, {});

  expect(result).toBe(null);
});
