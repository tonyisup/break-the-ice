import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

const admin = { metadata: { isAdmin: "true" } };
const TEN_AM_PACIFIC = "2026-11-24T18:00:00Z";
const THREE_PM_PACIFIC = "2026-11-24T23:00:00Z";
const DATE = "2026-11-24";

function setup() {
  return convexTest(schema, convexFunctionModules);
}

async function addUser(
  t: ReturnType<typeof setup>,
  email: string | undefined,
  fields: { newsletterSubscriptionStatus?: "subscribed" | "unsubscribed"; newsletterSendHour?: number } = {
    newsletterSubscriptionStatus: "subscribed",
  },
) {
  return await t.run((ctx) => ctx.db.insert("users", { email, ...fields }));
}

async function deliveryEmails(t: ReturnType<typeof setup>) {
  const rows = await t.run((ctx) => ctx.db.query("newsletterDeliveries").collect());
  return rows.map((row) => row.email).sort();
}

async function addDelivery(
  t: ReturnType<typeof setup>,
  userId: Id<"users">,
  email: string,
  fields: { status: "pending" | "failed" | "processing"; safeToRetry?: boolean; claimedAt?: number; attemptCount?: number },
) {
  return await t.run((ctx) =>
    ctx.db.insert("newsletterDeliveries", {
      deliveryDate: DATE,
      email,
      userId,
      attemptCount: 1,
      createdAt: 0,
      updatedAt: 0,
      ...fields,
    }),
  );
}

function claim(t: ReturnType<typeof setup>) {
  return t.mutation(internal.internal.newsletterDelivery.claimNewsletterDeliveries, {
    deliveryDate: DATE,
    limit: 100,
    maxAttempts: 3,
    staleProcessingBefore: Date.now() - 1000,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEN_AM_PACIFIC));
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("who the newsletter goes to", () => {
  test("production sends each person only in their chosen hour, once", async () => {
    vi.stubEnv("NEWSLETTER_SENDING_ENABLED", "true");
    const t = setup();
    await addUser(t, "default@example.com");
    await addUser(t, "afternoon@example.com", {
      newsletterSubscriptionStatus: "subscribed",
      newsletterSendHour: 15,
    });

    await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    expect(await deliveryEmails(t)).toEqual(["default@example.com"]);

    vi.setSystemTime(new Date(THREE_PM_PACIFIC));
    await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    expect(await deliveryEmails(t)).toEqual(["afternoon@example.com", "default@example.com"]);
  });

  // Value: protects=a reader set to an hour the spring clock change skips still gets that day's email, once;
  // fails_when=the due check only matches the exact hour; why_new=other tests use one November date;
  // seam=none; no_claim=real cron timing (fake clock).
  test("a send hour skipped by the spring clock change goes out in the next hour", async () => {
    vi.stubEnv("NEWSLETTER_SENDING_ENABLED", "true");
    const t = setup();
    await addUser(t, "early@example.com", { newsletterSubscriptionStatus: "subscribed", newsletterSendHour: 2 });
    await addUser(t, "later@example.com", { newsletterSubscriptionStatus: "subscribed", newsletterSendHour: 4 });

    // 3:00 AM PDT on 2027-03-14, one hour after 1:00 AM PST.
    vi.setSystemTime(new Date("2027-03-14T10:00:00Z"));
    await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});

    expect(await deliveryEmails(t)).toEqual(["early@example.com"]);
  });

  // Value: protects=a manual dev send with no test recipients explains why and queues nobody;
  // fails_when=the early return is removed and copied readers get rows; why_new=other tests always have a recipient;
  // seam=none; no_claim=none beyond protects.
  test("a manual send outside production with no test recipients queues nobody", async () => {
    const t = setup();
    await addUser(t, "copied-reader@example.com");

    const result = await t.withIdentity(admin).action(api.admin.newsletter.triggerDailyNewsletter, {
      deliveryDate: DATE,
    });

    expect(result).toMatchObject({ skipped: true, targetCount: 0 });
    expect(result.message).toContain("NEWSLETTER_TEST_RECIPIENTS");
    expect(await deliveryEmails(t)).toEqual([]);
  });

  test("a deployment without the setting never sends on schedule, even to test recipients", async () => {
    vi.stubEnv("NEWSLETTER_TEST_RECIPIENTS", "tester@example.com");
    const t = setup();
    await addUser(t, "tester@example.com");
    await addUser(t, "copied-reader@example.com");

    const result = await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});

    expect(result.skipped).toBe(true);
    expect(await deliveryEmails(t)).toEqual([]);
  });

  test("a manual send outside production reaches only test recipients", async () => {
    vi.stubEnv("NEWSLETTER_TEST_RECIPIENTS", " Tester@Example.com ");
    const t = setup();
    await addUser(t, "tester@example.com");
    await addUser(t, "copied-reader@example.com");

    await t.withIdentity(admin).action(api.admin.newsletter.triggerDailyNewsletter, {
      deliveryDate: DATE,
    });

    expect(await deliveryEmails(t)).toEqual(["tester@example.com"]);
  });

  test("a copied unsent row for a real reader can't be sent from dev", async () => {
    vi.stubEnv("NEWSLETTER_TEST_RECIPIENTS", "tester@example.com");
    const t = setup();
    const userId = await addUser(t, "copied-reader@example.com");
    await addDelivery(t, userId, "copied-reader@example.com", { status: "failed", safeToRetry: true });

    expect(await claim(t)).toEqual([]);
  });
});

describe("retries never send twice", () => {
  beforeEach(() => {
    vi.stubEnv("NEWSLETTER_SENDING_ENABLED", "true");
  });

  test("a failed send with an unknown outcome is not retried", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    await addDelivery(t, userId, "reader@example.com", { status: "failed", safeToRetry: false });

    expect(await claim(t)).toEqual([]);
  });

  test("a batch that died mid-send is closed, not resent", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const id = await addDelivery(t, userId, "reader@example.com", {
      status: "processing",
      claimedAt: 1,
      safeToRetry: false,
    });

    expect(await claim(t)).toEqual([]);
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.status).toBe("failed");
  });

  test("a send Resend definitely refused is retried", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const id = await addDelivery(t, userId, "reader@example.com", { status: "failed", safeToRetry: false });

    await t.mutation(internal.internal.newsletterDelivery.markNewsletterDeliveriesFailed, {
      deliveryIds: [id],
      error: "Rejected",
      sendRejected: true,
    });

    expect(await claim(t)).toHaveLength(1);
  });

  // Value: protects=a row that failed before this release, with an unknown outcome, is not emailed on deploy day;
  // fails_when=retry treats a missing marker as safe; why_new=other rows always carry the marker;
  // seam=none; no_claim=the real rows on production.
  test("a row that failed before this release is not retried", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    await addDelivery(t, userId, "reader@example.com", { status: "failed" });

    expect(await claim(t)).toEqual([]);
  });

  // Value: protects=a batch that keeps dying before its send stops spending questions and AI calls;
  // fails_when=stale rows are reclaimed without the attempt cap; why_new=the cap was only tested on failed rows;
  // seam=none; no_claim=real action timeouts.
  test("a stale row out of attempts is closed instead of reclaimed", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const id = await addDelivery(t, userId, "reader@example.com", {
      status: "processing",
      claimedAt: 1,
      safeToRetry: true,
      attemptCount: 3,
    });

    expect(await claim(t)).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
  });

  // Value: protects=the hourly run closes a batch that died mid-send even with nothing else pending;
  // fails_when=stale rows stop counting toward scheduling a batch; why_new=the close-out test called claim directly;
  // seam=none; no_claim=real scheduler timing (fake timers).
  test("the hourly run closes a dead batch when nothing else is pending", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const id = await addDelivery(t, userId, "reader@example.com", {
      status: "processing",
      claimedAt: 1,
      safeToRetry: false,
    });

    const result = await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    expect(result.scheduledBatchCount).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
  });

  // Value: protects=an 11 PM send that Resend refused still gets its retries after midnight;
  // fails_when=the hourly run only looks at today's Pacific date; why_new=every other test runs mid-day;
  // seam=none; no_claim=real scheduler timing (fake timers).
  test("a late-evening send refused by Resend is retried after midnight", async () => {
    const t = setup();
    const userId = await addUser(t, "night@example.com", { newsletterSubscriptionStatus: "subscribed", newsletterSendHour: 23 });
    await addDelivery(t, userId, "night@example.com", { status: "failed", safeToRetry: true });

    // 12:00 AM Pacific on the next day.
    vi.setSystemTime(new Date("2026-11-25T08:00:00Z"));
    const result = await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    expect(result.scheduledBatchCount).toBe(1);
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((job) => (job.args[0] as { deliveryDate: string }).deliveryDate)).toEqual([DATE]);

    // By 3:00 AM every late send has used its attempts, so the run stops looking back.
    vi.setSystemTime(new Date("2026-11-25T11:00:00Z"));
    const later = await t.action(internal.internal.newsletterStart.startDailyNewsletterIfDue, {});
    expect(later.scheduledBatchCount).toBe(0);
  });

  test("a retry skips someone who unsubscribed after the failure", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com", { newsletterSubscriptionStatus: "unsubscribed" });
    await addDelivery(t, userId, "reader@example.com", { status: "failed", safeToRetry: true });

    expect(await claim(t)).toEqual([]);
  });
});

// Value: protects=a send whose outcome is unknown is never emailed again, and a definite Resend refusal is;
// fails_when=the batch stops recording the send start or treats a 5xx, 409 or timeout as safe to retry;
// why_new=no test ran the batch sender; seam=none; no_claim=Resend's real responses (fetch is stubbed).
describe("sending a batch through Resend", () => {
  beforeEach(() => {
    vi.stubEnv("NEWSLETTER_SENDING_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function addPendingDelivery(t: ReturnType<typeof setup>) {
    const userId = await addUser(t, "reader@example.com");
    await t.run(async (ctx) => {
      for (const text of ["First question?", "Second question?"]) {
        const questionId = await ctx.db.insert("questions", {
          text,
          status: "public",
          averageViewDuration: 0,
          totalLikes: 0,
          totalShows: 0,
        });
        await ctx.db.insert("userQuestions", { userId, questionId, status: "unseen", updatedAt: 0 });
      }
    });
    return await addDelivery(t, userId, "reader@example.com", { status: "pending" });
  }

  const sendBatch = (t: ReturnType<typeof setup>) =>
    t.action(internal.internal.newsletterBatch.processNewsletterBatch, { deliveryDate: DATE, limit: 100 });

  test("a delivered batch is marked sent with a short idempotency key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ data: [{ id: "email_1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    const id = await addPendingDelivery(t);

    expect(await sendBatch(t)).toMatchObject({ success: true, sentCount: 1 });

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: "sent", resendEmailId: "email_1" });
    const headers = fetchMock.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(/^newsletter-2026-11-24-[0-9a-f]{64}$/);
  });

  test.each([
    ["a server error", () => new Response("down", { status: 500 })],
    ["a request timeout", () => new Response("timeout", { status: 408 })],
    ["an idempotency clash", () => new Response("clash", { status: 409 })],
    ["a lost connection", () => { throw new Error("connection reset"); }],
  ])("%s may have delivered the email, so it is not retried", async (_name, respond) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));
    const t = setup();
    const id = await addPendingDelivery(t);

    await sendBatch(t);

    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
    expect(await claim(t)).toEqual([]);
  });

  // Value: protects=one reader's failed question leaves the others sent and that reader safe to retry;
  // fails_when=a prep failure aborts the batch or records a send start; why_new=batch tests only fail at fetch;
  // seam=none; no_claim=Resend acceptance (fetch stubbed).
  test("a question that can't be prepared fails only that reader, who stays retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "email_1" }] }), { status: 200 }),
    ));
    const t = setup();
    const sent = await addPendingDelivery(t);
    const orphanUser = await addUser(t, "renamed@example.com");
    const failed = await addDelivery(t, orphanUser, "old-address@example.com", { status: "pending" });

    await sendBatch(t);

    expect((await t.run((ctx) => ctx.db.get(sent)))?.status).toBe("sent");
    const failedRow = await t.run((ctx) => ctx.db.get(failed));
    expect(failedRow?.status).toBe("failed");
    expect(failedRow?.safeToRetry).toBe(true);
    expect((await claim(t)).map((row) => row._id)).toEqual([failed]);
  });

  // Value: protects=an account deleted while its email is sending doesn't crash recording the batch;
  // fails_when=the missing-row guard is removed; why_new=no test deletes a row mid-send;
  // seam=none; no_claim=real concurrent timing.
  test("an account deleted during the send doesn't break the batch", async () => {
    const t = setup();
    const id = await addPendingDelivery(t);
    vi.stubGlobal("fetch", vi.fn(async () => {
      await t.run((ctx) => ctx.db.delete(id));
      return new Response(JSON.stringify({ data: [{ id: "email_1" }] }), { status: 200 });
    }));

    expect(await sendBatch(t)).toMatchObject({ success: true, sentCount: 1 });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  });

  test("a batch Resend refused is retried with a new idempotency key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await addPendingDelivery(t);

    await sendBatch(t);
    await sendBatch(t);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(
      ([, init]) => (init.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  // Value: protects=a refused send keeps the reader's question instead of spending a new one per retry;
  // fails_when=the retry picks again and marks another undelivered question sent;
  // why_new=the retry test only checked the idempotency key; seam=none; no_claim=Resend's real responses (fetch stubbed).
  test("a retry after a refused send reuses the same question", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await addPendingDelivery(t);

    await sendBatch(t);
    await sendBatch(t);

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string)[0].html as string);
    expect(bodies[0]).toContain("First question?");
    expect(bodies[1]).toContain("First question?");
    const marked = await t.run((ctx) => ctx.db.query("userQuestions").collect());
    expect(marked.filter((row) => row.status === "sent")).toHaveLength(1);
  });

  // Value: protects=a retry never emails a link to a question that went private after the failed attempt;
  // fails_when=the reuse check only tests for retired questions; why_new=the reuse test kept the question public;
  // seam=none; no_claim=Resend's real responses (fetch stubbed).
  test("a retry picks a new question when the first one went private", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    await addPendingDelivery(t);

    await sendBatch(t);
    await t.run(async (ctx) => {
      const first = await ctx.db
        .query("questions")
        .filter((q) => q.eq(q.field("text"), "First question?"))
        .unique();
      await ctx.db.patch(first!._id, { status: "private" });
    });
    await sendBatch(t);

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string)[0].html as string);
    expect(bodies[0]).toContain("First question?");
    expect(bodies[1]).toContain("Second question?");
  });
});

// Value: protects=a custom send hour can't abort the daily embedding refresh for every user;
// fails_when=the query goes back to returning whole rows, which its strict return validator can reject;
// why_new=no test read this query with newsletter fields set; seam=none;
// no_claim=Convex's return validation itself (convex-test does not enforce it).
test("the embedding refresh returns only ids, so user fields can't fail its validator", async () => {
  const t = setup();
  const userId = await addUser(t, "reader@example.com", {
    newsletterSubscriptionStatus: "subscribed",
    newsletterSendHour: 7,
  });

  const users = await t.query(internal.internal.users.getUsersWithMissingEmbeddings, {});

  expect(users).toEqual([{ _id: userId }]);
});

describe("admin subscription management", () => {
  test("the full list includes people who never chose", async () => {
    const t = setup();
    await addUser(t, "never@example.com", {});
    await addUser(t, "reader@example.com");

    const all = await t.withIdentity(admin).query(api.admin.newsletter.getSubscribers, { status: "all" });
    const never = await t.withIdentity(admin).query(api.admin.newsletter.getSubscribers, { status: "never" });

    expect(all).toHaveLength(2);
    expect(never.map((user) => user.email)).toEqual(["never@example.com"]);
  });

  test("re-subscribing someone who opted out needs confirmation", async () => {
    const t = setup();
    const userId = await addUser(t, "left@example.com", { newsletterSubscriptionStatus: "unsubscribed" });
    const asAdmin = t.withIdentity(admin);

    await expect(
      asAdmin.mutation(api.admin.newsletter.setSubscriptionStatus, { userId, status: "subscribed" }),
    ).rejects.toThrow("Confirm");
    await expect(
      asAdmin.mutation(api.admin.users.updateUser, { userId, newsletterSubscriptionStatus: "subscribed" }),
    ).rejects.toThrow("Confirm");

    await asAdmin.mutation(api.admin.newsletter.setSubscriptionStatus, {
      userId,
      status: "subscribed",
      confirmSubscribe: true,
    });
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.newsletterSubscriptionStatus).toBe("subscribed");
  });

  // Value: protects=an admin can't sign someone up for email they never asked for by accident;
  // fails_when=the confirmation only covers people who unsubscribed; why_new=the opt-out test seeded "unsubscribed";
  // seam=none; no_claim=none beyond protects.
  test("subscribing someone who never signed up needs confirmation", async () => {
    const t = setup();
    const userId = await addUser(t, "never@example.com", {});
    const asAdmin = t.withIdentity(admin);

    await expect(
      asAdmin.mutation(api.admin.newsletter.setSubscriptionStatus, { userId, status: "subscribed" }),
    ).rejects.toThrow("never signed up");
    await expect(
      asAdmin.mutation(api.admin.users.updateUser, { userId, newsletterSubscriptionStatus: "subscribed" }),
    ).rejects.toThrow("never signed up");

    await asAdmin.mutation(api.admin.users.updateUser, {
      userId,
      newsletterSubscriptionStatus: "subscribed",
      confirmSubscribe: true,
    });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.newsletterSubscriptionStatus).toBe("subscribed");
  });

  test("a user with no email can't be subscribed from either admin page", async () => {
    const t = setup();
    const userId = await addUser(t, undefined, {});
    const asAdmin = t.withIdentity(admin);

    for (const subscribe of [
      () => asAdmin.mutation(api.admin.newsletter.setSubscriptionStatus, { userId, status: "subscribed", confirmSubscribe: true }),
      () => asAdmin.mutation(api.admin.users.updateUser, { userId, newsletterSubscriptionStatus: "subscribed", confirmSubscribe: true }),
    ]) {
      await expect(subscribe()).rejects.toThrow("no email");
    }
  });

  test("saving a user who never chose doesn't record an opt-out", async () => {
    const t = setup();
    const userId = await addUser(t, "never@example.com", {});

    await t.withIdentity(admin).mutation(api.admin.users.updateUser, {
      userId,
      aiUsageCount: 1,
      newsletterSubscriptionStatus: "unsubscribed",
    });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.newsletterSubscriptionStatus).toBeUndefined();
  });

  test("send hour is validated and can return to the default", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const asAdmin = t.withIdentity(admin);

    await expect(asAdmin.mutation(api.admin.newsletter.setSendHour, { userId, hour: 24 })).rejects.toThrow();
    await asAdmin.mutation(api.admin.newsletter.setSendHour, { userId, hour: 7 });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.newsletterSendHour).toBe(7);

    await asAdmin.mutation(api.admin.newsletter.setSendHour, { userId, hour: null });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.newsletterSendHour).toBeUndefined();
  });

  // Value: protects=history shows the newest 14 emails with their question and error;
  // fails_when=the order, limit or question join changes; why_new=only admin denial was tested;
  // seam=none; no_claim=none beyond protects.
  test("delivery history is newest first, capped at 14, with the question and error", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    await t.run(async (ctx) => {
      const questionId = await ctx.db.insert("questions", {
        text: "Newest question?",
        status: "public",
        averageViewDuration: 0,
        totalLikes: 0,
        totalShows: 0,
      });
      for (let day = 1; day <= 16; day++) {
        await ctx.db.insert("newsletterDeliveries", {
          deliveryDate: `2026-11-${String(day).padStart(2, "0")}`,
          email: "reader@example.com",
          userId,
          status: day === 16 ? "sent" : "failed",
          questionId: day === 16 ? questionId : undefined,
          error: day === 15 ? "Rejected" : undefined,
          attemptCount: 1,
          createdAt: 0,
          updatedAt: 0,
        });
      }
    });

    const history = await t.withIdentity(admin).query(api.admin.newsletter.getDeliveryHistory, { userId });

    expect(history).toHaveLength(14);
    expect(history[0]).toMatchObject({ deliveryDate: "2026-11-16", questionText: "Newest question?" });
    expect(history[1]).toMatchObject({ deliveryDate: "2026-11-15", error: "Rejected" });
    expect(history[13]?.deliveryDate).toBe("2026-11-03");
  });

  test("pending sign-ups list without their token and can be removed", async () => {
    const t = setup();
    const pendingId = await t.run((ctx) =>
      ctx.db.insert("pendingSubscriptions", { email: "new@example.com", token: "secret-token" }),
    );
    const asAdmin = t.withIdentity(admin);

    const pending = await asAdmin.query(api.admin.newsletter.getPendingSubscriptions, {});
    expect(pending[0]?.email).toBe("new@example.com");
    expect(pending[0]).not.toHaveProperty("token");

    await asAdmin.mutation(api.admin.newsletter.removePendingSubscription, { pendingId });
    expect(await asAdmin.query(api.admin.newsletter.getPendingSubscriptions, {})).toEqual([]);
  });

  test("non-admins can't read or change subscription data", async () => {
    const t = setup();
    const userId = await addUser(t, "reader@example.com");
    const member = t.withIdentity({ metadata: { isAdmin: "false" } });

    await expect(member.query(api.admin.newsletter.getPendingSubscriptions, {})).rejects.toThrow("Not an admin");
    await expect(member.query(api.admin.newsletter.getDeliveryHistory, { userId })).rejects.toThrow("Not an admin");
    await expect(member.mutation(api.admin.newsletter.setSendHour, { userId, hour: 7 })).rejects.toThrow("Not an admin");
  });
});

describe("resetting production data copied into dev", () => {
  const DEV_ISSUER = "https://dev-clerk.example.test";
  const PROD_ISSUER = "https://clerk.example.test";
  const run = (t: ReturnType<typeof setup>, args: { dryRun?: boolean; keepEmails?: string[] } = {}) =>
    t.mutation(internal.internal.devDataCleanup.resetCopiedProductionData, args);

  beforeEach(() => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", DEV_ISSUER);
  });

  async function addCopiedUser(t: ReturnType<typeof setup>, email: string) {
    return await t.run((ctx) =>
      ctx.db.insert("users", {
        email,
        clerkId: "user_prod",
        tokenIdentifier: `${PROD_ISSUER}|user_prod`,
        clerkCustomerId: "customer_prod",
        clerkSubscriptionId: "subscription_prod",
        billingSubjectType: "user",
        billingStatus: "active",
        newsletterSubscriptionStatus: "subscribed",
        newsletterUnsubscribeToken: "prod-token",
        newsletterSendHour: 15,
      }),
    );
  }

  test("refuses unless enabled, and always on the sending deployment", async () => {
    const t = setup();
    await expect(run(t)).rejects.toThrow("not enabled");

    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    vi.stubEnv("NEWSLETTER_SENDING_ENABLED", "true");
    await expect(run(t, { dryRun: false })).rejects.toThrow("not enabled");
  });

  test("refuses without a Clerk issuer, so it can't treat every identity as foreign", async () => {
    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "");
    await expect(run(setup(), { dryRun: false })).rejects.toThrow("CLERK_JWT_ISSUER_DOMAIN");
  });

  test("a dry run reports the work and changes nothing", async () => {
    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    const t = setup();
    const userId = await addCopiedUser(t, "copied@example.com");
    const before = await t.run((ctx) => ctx.db.get(userId));

    expect(await run(t)).toMatchObject({ dryRun: true, identitiesCleared: 1, subscriptionsCleared: 1 });
    expect(await t.run((ctx) => ctx.db.get(userId))).toEqual(before);
  });

  test("clears production identities and subscriptions, and keeps dev ones", async () => {
    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    vi.stubEnv("NEWSLETTER_TEST_RECIPIENTS", "tester@example.com");
    const t = setup();
    const copied = await addCopiedUser(t, "copied@example.com");
    const tester = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "tester@example.com",
        clerkId: "user_dev",
        tokenIdentifier: `${DEV_ISSUER}|user_dev`,
        newsletterSubscriptionStatus: "subscribed",
      }),
    );
    await t.run((ctx) => ctx.db.insert("pendingSubscriptions", { email: "p@example.com", token: "t" }));

    const result = await run(t, { dryRun: false });

    expect(result).toEqual({
      dryRun: false,
      identitiesCleared: 1,
      identitiesKept: 1,
      subscriptionsCleared: 1,
      subscriptionsKept: 1,
      pendingSignupsRemoved: 1,
    });
    const copiedRow = await t.run((ctx) => ctx.db.get(copied));
    expect(copiedRow).toMatchObject({ email: "copied@example.com", billingStatus: "inactive" });
    for (const field of [
      "clerkId",
      "tokenIdentifier",
      "clerkCustomerId",
      "clerkSubscriptionId",
      "newsletterSubscriptionStatus",
      "newsletterUnsubscribeToken",
      "newsletterSendHour",
    ] as const) {
      expect(copiedRow?.[field]).toBeUndefined();
    }
    expect(await t.run((ctx) => ctx.db.get(tester))).toMatchObject({
      clerkId: "user_dev",
      newsletterSubscriptionStatus: "subscribed",
    });
  });

  // Value: protects=the reset keeps named emails and recognizes this deployment's issuer despite a trailing slash;
  // fails_when=email or issuer normalization is removed; why_new=other reset tests use exact values;
  // seam=none; no_claim=real Clerk issuer format.
  test("keeps named emails, and matches the issuer despite a trailing slash", async () => {
    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", `${DEV_ISSUER}/`);
    const t = setup();
    const kept = await addCopiedUser(t, "keep@example.com");
    const devUser = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "dev@example.com",
        clerkId: "user_dev",
        tokenIdentifier: `${DEV_ISSUER}|user_dev`,
      }),
    );

    await run(t, { dryRun: false, keepEmails: [" KEEP@example.com "] });

    const keptRow = await t.run((ctx) => ctx.db.get(kept));
    expect(keptRow?.newsletterSubscriptionStatus).toBe("subscribed");
    expect(keptRow?.newsletterUnsubscribeToken).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(devUser)))?.clerkId).toBe("user_dev");
  });

  test("a dev sign-in with the same email links back to the person's row", async () => {
    vi.stubEnv("DEV_DATA_CLEANUP_ENABLED", "true");
    const t = setup();
    const copied = await addCopiedUser(t, "copied@example.com");
    await run(t, { dryRun: false });

    const signedInId = await t
      .withIdentity({
        subject: "user_dev",
        tokenIdentifier: `${DEV_ISSUER}|user_dev`,
        email: "copied@example.com",
      })
      .mutation(api.core.users.store, {});

    expect(signedInId).toBe(copied);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(copied))).toMatchObject({
      clerkId: "user_dev",
      tokenIdentifier: `${DEV_ISSUER}|user_dev`,
    });
  });
});
