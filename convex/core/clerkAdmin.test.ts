import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

const originalFetch = global.fetch;
const originalClerkSecret = process.env.CLERK_SECRET_KEY;

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "test-secret";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalClerkSecret;
  vi.restoreAllMocks();
});

describe("Clerk billing authorization", () => {
  test("admin billing actions reject anonymous callers before contacting Clerk", async () => {
    const t = convexTest(schema, convexFunctionModules);
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(
      t.action(api.core.clerkAdmin.adminCancelOrgSubscription, {
        clerkOrganizationId: "org_customer",
      }),
    ).rejects.toThrow("Not authenticated");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("admin billing actions reject authenticated non-admins", async () => {
    const t = convexTest(schema, convexFunctionModules);
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(
      t.withIdentity({ subject: "user_member", email: "member@example.com" }).action(
        api.core.clerkAdmin.adminListOrganizations,
        {},
      ),
    ).rejects.toThrow("Not an admin");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("subscription sync rejects callers outside the requested Clerk organization", async () => {
    const t = convexTest(schema, convexFunctionModules);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ role: "org:member", organization: { id: "org_other" } }],
      }),
      text: async () => "",
    });

    await expect(
      t.withIdentity({ subject: "user_member", email: "member@example.com" }).action(
        api.core.clerkAdmin.forceSyncOrgSubscription,
        { clerkOrganizationId: "org_customer" },
      ),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("subscription sync preserves the verified Clerk role", async () => {
    const t = convexTest(schema, convexFunctionModules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_member",
        email: "member@example.com",
      }),
    );
    global.fetch = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.href;
      if (url.includes("organization_memberships")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ role: "org:member", organization: { id: "org_customer" } }],
          }),
          text: async () => "",
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => "not found",
      };
    });

    const organizationId = await t
      .withIdentity({ subject: "user_member", email: "member@example.com" })
      .action(api.core.clerkAdmin.forceSyncOrgSubscription, {
        clerkOrganizationId: "org_customer",
        organizationName: "Customer Studio",
      });

    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("organization_members")
        .withIndex("by_userId_organizationId", (q) =>
          q.eq("userId", userId).eq("organizationId", organizationId!),
        )
        .unique(),
    );
    expect(membership?.role).toBe("member");
  });
});
