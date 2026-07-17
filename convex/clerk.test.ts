import { convexTest } from "convex-test";
import { Webhook } from "svix";
import { afterAll, beforeAll, expect, test } from "vitest";
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
