import { convexTest } from "convex-test";
import { Webhook } from "svix";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import schema from "./schema";
import { convexFunctionModules } from "../vitestConvexModules";

const webhookSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const originalWebhookSecret = process.env.CLERK_WEBHOOK_SECRET;

beforeAll(() => {
  process.env.CLERK_WEBHOOK_SECRET = webhookSecret;
});

afterAll(() => {
  if (originalWebhookSecret === undefined) {
    delete process.env.CLERK_WEBHOOK_SECRET;
  } else {
    process.env.CLERK_WEBHOOK_SECRET = originalWebhookSecret;
  }
});

function signedWebhookRequest(event: unknown) {
  const payload = JSON.stringify(event);
  const messageId = `msg_${crypto.randomUUID()}`;
  const timestamp = new Date();
  const signature = new Webhook(webhookSecret).sign(
    messageId,
    timestamp,
    payload,
  );

  return {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  };
}

test("Clerk user.created webhook creates a normalized user", async () => {
  const t = convexTest(schema, convexFunctionModules);

  const response = await t.fetch(
    "/clerk-users-webhook",
    signedWebhookRequest({
      type: "user.created",
      data: {
        id: "user_webhook",
        email_addresses: [{ email_address: "Webhook@Example.COM" }],
        first_name: "Web",
        last_name: "Hook",
        image_url: "https://example.com/webhook.png",
      },
    }),
  );

  expect(response.status).toBe(200);
  await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_webhook"))
      .collect();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: "webhook@example.com",
      name: "Web Hook",
      image: "https://example.com/webhook.png",
      billingStatus: "inactive",
    });
  });
});

test("Clerk user.updated webhook updates the existing user without duplication", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const createEvent = {
    type: "user.created",
    data: {
      id: "user_updated",
      email_addresses: [{ email_address: "before@example.com" }],
      first_name: "Before",
      last_name: "Name",
      image_url: "https://example.com/before.png",
    },
  };

  expect(
    (await t.fetch("/clerk-users-webhook", signedWebhookRequest(createEvent)))
      .status,
  ).toBe(200);
  expect(
    (
      await t.fetch(
        "/clerk-users-webhook",
        signedWebhookRequest({
          type: "user.updated",
          data: {
            ...createEvent.data,
            first_name: "After",
            last_name: "Name",
            image_url: "https://example.com/after.png",
          },
        }),
      )
    ).status,
  ).toBe(200);

  await t.run(async (ctx) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_updated"))
      .collect();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: "After Name",
      image: "https://example.com/after.png",
    });
  });
});

test("Clerk webhook rejects missing or invalid Svix signatures", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const payload = JSON.stringify({ type: "user.created", data: {} });

  const missingHeaders = await t.fetch("/clerk-users-webhook", {
    method: "POST",
    body: payload,
  });
  expect(missingHeaders.status).toBe(400);

  const invalidSignature = await t.fetch("/clerk-users-webhook", {
    method: "POST",
    body: payload,
    headers: {
      "svix-id": "msg_invalid",
      "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
      "svix-signature": "v1,invalid",
    },
  });
  expect(invalidSignature.status).toBe(400);

  await t.run(async (ctx) => {
    expect(await ctx.db.query("users").collect()).toHaveLength(0);
  });
});

// Value: protects=billing stays per person: a subscription a person pays for is recorded on their account, from either webhook route;
// fails_when=the webhook stops handling a person's subscription, or stops writing its status and Clerk ids to the user;
// why_new=the webhook's subscription handling had no test, and the organization half of it was removed;
// seam=none; no_claim=what a subscription unlocks, since nothing sells one yet.
test("a subscription a person pays for is recorded on their account", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "payer@example.com", clerkId: "user_payer", billingStatus: "inactive" }),
  );

  const response = await t.fetch(
    "/clerk-billing-webhook",
    signedWebhookRequest({
      type: "subscription.active",
      data: {
        id: "sub_1",
        status: "active",
        payerId: "user_payer",
        customerId: "cus_1",
        subscriptionItems: [{ status: "active", plan: { forPayerType: "user", isDefault: false } }],
      },
    }),
  );

  expect(response.status).toBe(200);
  expect(await t.run((ctx) => ctx.db.get(userId))).toMatchObject({
    billingStatus: "active",
    billingSubjectType: "user",
    clerkCustomerId: "cus_1",
    clerkSubscriptionId: "sub_1",
  });
});

// Value: protects=a subscription or a checkout an organization pays for changes nothing (no organization row, no account touched) and is logged with its ids;
// fails_when=the webhook writes an organization row again, or files an organization's subscription on a person;
// why_new=Team billing was removed, and Clerk may still send these events until its dashboard is cleaned up;
// seam=none; no_claim=that Clerk stops sending them.
test("a subscription or a checkout an organization pays for is ignored, and logged", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const t = convexTest(schema, convexFunctionModules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "payer@example.com", clerkId: "user_payer", billingStatus: "inactive" }),
  );

  const events = [
    {
      type: "subscription.active",
      data: {
        id: "sub_org",
        status: "active",
        payerId: "org_123",
        customerId: "cus_org",
        subscriptionItems: [{ status: "active", plan: { forPayerType: "org", isDefault: false } }],
      },
    },
    { type: "organization.checkout.confirmed", data: { organization_id: "org_123", organization_name: "Gym" } },
  ];
  for (const event of events) {
    expect((await t.fetch("/clerk-billing-webhook", signedWebhookRequest(event))).status).toBe(200);
  }

  expect(await t.run((ctx) => ctx.db.query("organizations").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(userId))).toMatchObject({ billingStatus: "inactive" });
  expect((await t.run((ctx) => ctx.db.get(userId)))?.clerkSubscriptionId).toBeUndefined();
  // Each one is logged with its ids, so a purchase from a stale app can be found and refunded.
  expect(warn.mock.calls.map(([line]) => String(line))).toEqual([
    "Ignored subscription.active for organization org_123 (subscription sub_org): the Team plan was removed",
    "Ignored organization.checkout.confirmed for organization org_123: the Team plan was removed",
  ]);
  warn.mockRestore();
});
