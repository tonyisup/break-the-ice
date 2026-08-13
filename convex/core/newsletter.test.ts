import { convexTest } from "convex-test";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const originalFetch = global.fetch;
const originalEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_API_TOKEN: process.env.RESEND_API_TOKEN,
  CRONS_NOTICE_EMAIL: process.env.CRONS_NOTICE_EMAIL,
  N8N_SUBSCRIBE_WEBHOOK_URL: process.env.N8N_SUBSCRIBE_WEBHOOK_URL,
  N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL:
    process.env.N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL,
  ENVIRONMENT: process.env.ENVIRONMENT,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  delete process.env.RESEND_API_TOKEN;
  process.env.RESEND_API_KEY = "test_key";
  process.env.CRONS_NOTICE_EMAIL = "admin@example.com";
  process.env.N8N_SUBSCRIBE_WEBHOOK_URL = "https://webhook.example.com";
  process.env.N8N_VERIFY_SUBSCRIPTION_WEBHOOK_URL =
    "https://verify.example.com";
  process.env.ENVIRONMENT = "Test";
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const name of Object.keys(originalEnv) as (keyof typeof originalEnv)[]) {
    restoreEnv(name);
  }
});

test("authenticated newsletter subscription bypasses n8n and triggers admin notification", async () => {
  const t = convexTest(schema);

  const mockFetch = vi.fn().mockImplementation((input) => {
    if (input === "https://api.resend.com/contacts/user@example.com") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            name: "not_found",
            message: "Contact not found",
            statusCode: 404,
          }),
          { status: 404 },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          object:
            input === "https://api.resend.com/contacts" ? "contact" : "email",
          id: "resend-id",
        }),
        { status: 200 },
      ),
    );
  });
  global.fetch = mockFetch;

  // Trigger subscription (authenticated flow)
  const identity = {
    subject: "user1",
    email: "user@example.com",
    name: "User One",
  };
  const authenticatedT = t.withIdentity(identity);

  // Pre-create the user as setNewsletterStatus expects it to exist
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: identity.name,
      email: identity.email,
    });
  });

  const result = await authenticatedT.action(api.core.newsletter.subscribe, {
    email: "user@example.com",
  });

  expect(result).toMatchObject({ success: true, status: "subscribed" });

  // The subscription and notification both go directly to Resend. A stale n8n
  // certificate must not block logged-in users from subscribing.
  expect(mockFetch).toHaveBeenCalledTimes(3);
  expect(mockFetch).not.toHaveBeenCalledWith(
    "https://webhook.example.com",
    expect.anything(),
  );

  const contactCall = mockFetch.mock.calls.find(
    (call) => call[0] === "https://api.resend.com/contacts",
  );
  expect(contactCall).toBeDefined();
  expect(JSON.parse(contactCall![1].body)).toMatchObject({
    email: "user@example.com",
    unsubscribed: false,
  });

  const resendCall = mockFetch.mock.calls.find(
    (call) => call[0] === "https://api.resend.com/emails",
  );
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

test("authenticated newsletter resubscription reactivates the contact and segment", async () => {
  const t = convexTest(schema);
  const contactUrl = "https://api.resend.com/contacts/user@example.com";
  const segmentUrl = `${contactUrl}/segments/7c132839-8e29-4e94-a1d1-61c9f3c3d299`;
  const mockFetch = vi.fn().mockImplementation((input, init) => {
    const url = String(input);
    if (url === contactUrl && init?.method === "GET") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            object: "contact",
            id: "existing-contact",
            email: "user@example.com",
            unsubscribed: true,
          }),
          { status: 200 },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          object: "contact",
          id: "existing-contact",
        }),
        { status: 200 },
      ),
    );
  });
  global.fetch = mockFetch;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "User One",
      email: "user@example.com",
      newsletterSubscriptionStatus: "unsubscribed",
    });
  });

  const result = await t
    .withIdentity({
      subject: "user1",
      email: "user@example.com",
      name: "User One",
    })
    .action(api.core.newsletter.subscribe, { email: "ignored@example.com" });

  expect(result).toMatchObject({ success: true, status: "subscribed" });
  expect(mockFetch).toHaveBeenCalledWith(
    contactUrl,
    expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"unsubscribed":false'),
    }),
  );
  expect(mockFetch).toHaveBeenCalledWith(
    segmentUrl,
    expect.objectContaining({
      method: "POST",
    }),
  );
  expect(mockFetch).not.toHaveBeenCalledWith(
    "https://webhook.example.com",
    expect.anything(),
  );

  const user = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "user@example.com"))
      .unique(),
  );
  expect(user?.newsletterSubscriptionStatus).toBe("subscribed");
});

test("authenticated newsletter subscription leaves status unchanged when Resend fails", async () => {
  const t = convexTest(schema);
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        name: "application_error",
        message: "Resend is unavailable",
        statusCode: 503,
      }),
      { status: 503 },
    ),
  );
  global.fetch = mockFetch;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "User One",
      email: "user@example.com",
    });
  });

  const result = await t
    .withIdentity({
      subject: "user1",
      email: "user@example.com",
      name: "User One",
    })
    .action(api.core.newsletter.subscribe, { email: "ignored@example.com" });

  expect(result).toMatchObject({ success: false, status: "error" });
  expect(mockFetch).toHaveBeenCalledTimes(1);

  const user = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "user@example.com"))
      .unique(),
  );
  expect(user?.newsletterSubscriptionStatus).toBeUndefined();
});

test("authenticated newsletter subscription fails closed when Resend credentials are missing", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_TOKEN;
  const t = convexTest(schema);
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "User One",
      email: "user@example.com",
    });
  });

  const result = await t
    .withIdentity({
      subject: "user1",
      email: "user@example.com",
      name: "User One",
    })
    .action(api.core.newsletter.subscribe, { email: "ignored@example.com" });

  expect(result).toMatchObject({ success: false, status: "error" });
  expect(mockFetch).not.toHaveBeenCalled();

  const user = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "user@example.com"))
      .unique(),
  );
  expect(user?.newsletterSubscriptionStatus).toBeUndefined();
});

test("newsletter subscription unauthenticated flow triggers notification on confirmation", async () => {
  const t = convexTest(schema);
  const mockFetch = vi.fn().mockImplementation((input) => {
    if (input === "https://api.resend.com/contacts/new@example.com") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            name: "not_found",
            message: "Contact not found",
            statusCode: 404,
          }),
          { status: 404 },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          object:
            input === "https://api.resend.com/contacts" ? "contact" : "email",
          id: "resend-id",
          success: true,
        }),
        { status: 200 },
      ),
    );
  });
  global.fetch = mockFetch;

  // 1. Subscribe (unauthenticated)
  await t.action(api.core.newsletter.subscribe, { email: "new@example.com" });

  // Verify verify webhook called
  expect(mockFetch).toHaveBeenCalledWith(
    "https://verify.example.com",
    expect.anything(),
  );
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
  await t.action(api.core.newsletter.confirmSubscription, {
    token: pending!.token,
  });

  // Verify the Resend contact lookup, contact creation, and notification calls.
  expect(mockFetch).toHaveBeenCalledTimes(3);

  const resendCall = mockFetch.mock.calls.find(
    (call) => call[0] === "https://api.resend.com/emails",
  );
  expect(resendCall).toBeDefined();
});
