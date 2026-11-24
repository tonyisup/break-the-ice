import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import { summary } from "./packInterest";

afterEach(() => vi.unstubAllEnvs());

const identity = {
  subject: "user_123",
  tokenIdentifier: "https://clerk.example|user_123",
  email: "member@example.com",
};

async function setUp() {
  const t = convexTest(schema, convexFunctionModules);
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      email: identity.email,
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
    }),
  );
  return { t, userId, me: t.withIdentity(identity) };
}

test("the summary counts who is at the limit this cycle, who saw the offer and who asked", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "5");
  const { t, userId, me } = await setUp();
  const now = Date.now();
  const seen = t.withIdentity({ subject: "user_seen", tokenIdentifier: "https://clerk.example|user_seen", email: "seen@example.com" });
  await t.run(async (ctx) => {
    const other = await ctx.db.insert("users", { email: "b@example.com" });
    const old = await ctx.db.insert("users", { email: "c@example.com" });
    await ctx.db.insert("userAiUsage", { userId, count: 5, cycleStart: now });
    await ctx.db.insert("userAiUsage", { userId: other, count: 2, cycleStart: now });
    // Used up, but in a cycle that has ended.
    await ctx.db.insert("userAiUsage", { userId: old, count: 5, cycleStart: now - 40 * 24 * 60 * 60 * 1000 });
    // At the limit on the older field only, with no usage row yet.
    await ctx.db.insert("users", { email: "d@example.com", aiUsage: { count: 5, cycleStart: now } });
    // Has both: the row is the one that counts.
    const both = await ctx.db.insert("users", { email: "e@example.com", aiUsage: { count: 5, cycleStart: now } });
    await ctx.db.insert("userAiUsage", { userId: both, count: 1, cycleStart: now });
  });
  await me.mutation(api.core.packInterest.record, { offer: "pack-50-usd-5", surface: "feed", step: "shown" });
  await me.mutation(api.core.packInterest.record, { offer: "pack-50-usd-5", surface: "remix", step: "notify" });
  await seen.mutation(api.core.packInterest.record, { offer: "pack-50-usd-5", surface: "remix", step: "shown" });

  expect(await t.query(internal.internal.packInterest.summary, {})).toEqual({
    offer: "pack-50-usd-5",
    aiLimit: 5,
    peopleWithAiUse: 5,
    atLimitNow: 2,
    shown: 2,
    shownOnFeed: 1,
    shownInRemix: 1,
    asked: 1,
    askedOnFeed: 0,
    askedInRemix: 1,
    wantNotice: 1,
  });
});

test("the summary is not callable by the app", () => {
  expect(summary.isInternal).toBe(true);
});
