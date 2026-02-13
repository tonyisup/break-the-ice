import { convexTest } from "convex-test";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.RESEND_API_KEY = "test_key";
  process.env.CRONS_NOTICE_EMAIL = "admin@example.com";
  process.env.N8N_SUBSCRIBE_WEBHOOK_URL = "https://webhook.example.com";
  process.env.N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL = "https://verify.example.com";
  process.env.ENVIRONMENT = "Test";
});

afterEach(() => {
  global.fetch = originalFetch;
});

test("newsletter subscription triggers admin notification", async () => {
  const t = convexTest(schema);

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
  global.fetch = mockFetch;

  // Trigger subscription (authenticated flow)
  const identity = { subject: "user1", email: "user@example.com", name: "User One" };
  const authenticatedT = t.withIdentity(identity);

  // Pre-create the user as setNewsletterStatus expects it to exist
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: identity.name,
      email: identity.email,
    });
  });

  await authenticatedT.action(api.core.newsletter.subscribe, { email: "user@example.com" });

  // Verify fetch calls
  // 1st call: N8N_SUBSCRIBE_WEBHOOK_URL
  // 2nd call: Resend API for notification
  expect(mockFetch).toHaveBeenCalledTimes(2);

  const resendCall = mockFetch.mock.calls.find(call => call[0] === "https://api.resend.com/emails");
  expect(resendCall).toBeDefined();

  const resendBody = JSON.parse(resendCall![1].body);
  expect(resendBody.subject).toContain("New Newsletter Subscription");
  expect(resendBody.html).toContain("user@example.com");
  expect(resendBody.from).toContain("Newsletter Notifier");

  // Verify user status in DB
  const user = await t.run(async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "user@example.com"))
      .unique();
  });
  expect(user?.newsletterSubscriptionStatus).toBe("subscribed");
});

test("newsletter subscription unauthenticated flow triggers notification on confirmation", async () => {
  const t = convexTest(schema);
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
  global.fetch = mockFetch;

  // 1. Subscribe (unauthenticated)
  await t.action(api.core.newsletter.subscribe, { email: "new@example.com" });

  // Verify verify webhook called
  expect(mockFetch).toHaveBeenCalledWith("https://verify.example.com", expect.anything());
  mockFetch.mockClear();

  // Get the token from DB
  const pending = await t.run(async (ctx) => {
    return await ctx.db.query("pendingSubscriptions").first();
  });
  expect(pending).toBeDefined();

  // Ensure user exists (confirmSubscription expects user to be created if not exists,
  // but wait, setNewsletterStatus only updates if user exists)
  // Actually confirmSubscription calls subscribeUser which calls setNewsletterStatus.
  // setNewsletterStatus in internal/users.ts:
  // if (user) { ctx.db.patch(...) }
  // So the user must be created first.
  // In the real app, the user might be created by Clerk or other means.
  // But subscribeUser doesn't create the user if it doesn't exist?
  // Let's check internal/users.ts again.

  /*
  export const setNewsletterStatus = internalMutation({
    // ...
    handler: async (ctx, args) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", args.email))
        .unique();

      if (user) {
        await ctx.db.patch(user._id, {
          newsletterSubscriptionStatus: args.status,
        });
      }
    },
  });
  */

  // So if it's a completely new email, the user won't have the status set in Convex yet.
  // But the Resend/N8N webhook will still happen.

  // 2. Confirm subscription
  await t.action(api.core.newsletter.confirmSubscription, { token: pending!.token });

  // Verify subscribe webhook and notification called
  expect(mockFetch).toHaveBeenCalledTimes(2);

  const resendCall = mockFetch.mock.calls.find(call => call[0] === "https://api.resend.com/emails");
  expect(resendCall).toBeDefined();
});
