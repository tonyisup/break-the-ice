import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

test("syncOrganizationFromClerk uses active Clerk org claims for membership role", async () => {
  const t = convexTest(schema);

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
    },
  };

  const organizationId = await t.withIdentity(identity).mutation(
    api.core.billing.syncOrganizationFromClerk,
    { name: "Acme Workspace" },
  );

  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    const organization = await ctx.db.get(organizationId);
    const membership = await ctx.db
      .query("organization_members")
      .withIndex("by_userId_organizationId", (q) =>
        q.eq("userId", userId).eq("organizationId", organizationId),
      )
      .unique();

    expect(user?.clerkId).toBe("user_123");
    expect(user?.tokenIdentifier).toBe("https://clerk.example|user_123");
    expect(organization?.clerkOrganizationId).toBe("org_123");
    expect(membership?.role).toBe("admin");
  });
});

test("syncOrganizationFromClerk rejects users without an active Clerk organization", async () => {
  const t = convexTest(schema);

  await expect(
    t.withIdentity({
      subject: "user_456",
      tokenIdentifier: "https://clerk.example|user_456",
      email: "user@example.com",
    }).mutation(api.core.billing.syncOrganizationFromClerk, {
      name: "No Org Workspace",
    }),
  ).rejects.toThrow("No active Clerk organization found for this user");
});
