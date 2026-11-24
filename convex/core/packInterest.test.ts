import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import * as packInterest from "./packInterest";

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

const OFFER = "pack-50-usd-5";
const none = { shown: false, clicked: false, notify: false };

test("each step is recorded once in one row per person, and never taken back", async () => {
  const { t, userId, me } = await setUp();
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual(none);

  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "shown" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: false, notify: false });

  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "remix", step: "asked" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: true, notify: false });

  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "notify" });
  // Later, lesser steps don't take anything back.
  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "asked" });
  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "shown" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: true, notify: true });

  const rows = await t.run(async (ctx) => await ctx.db.query("packInterest").collect());
  expect(rows).toHaveLength(1);
  // Where they first saw it and where they pressed the button are kept apart.
  expect(rows[0]).toMatchObject({ userId, offer: OFFER, surface: "feed", clickedSurface: "remix" });
});

test("a first step of asking or of wanting the notice also counts as shown", async () => {
  const { t, me } = await setUp();
  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "remix", step: "notify" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: true, notify: true });
  const rows = await t.run(async (ctx) => await ctx.db.query("packInterest").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ surface: "remix", clickedSurface: "remix" });
});

test("a page still showing an earlier offer records nothing", async () => {
  const { t, me } = await setUp();
  await me.mutation(api.core.packInterest.record, { offer: "pack-20-usd-3", surface: "feed", step: "asked" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual(none);
  expect(await t.run(async (ctx) => await ctx.db.query("packInterest").collect())).toEqual([]);
});

// Added by the ship coverage audit (Claude Fable 5.2), pass 1.
// Value: protects=an answer to an earlier offer is not counted as an answer to the current one, for the person or the owner's summary;
// fails_when=getMine, record or summary stops matching on the offer id and takes any packInterest row of the person;
// why_new=every other test has rows for the current offer only; seam=none;
// no_claim=changing PACK_OFFER.id itself (the earlier offer is a seeded row)
test("an answer to an earlier offer doesn't count for the current one", async () => {
  const { t, userId, me } = await setUp();
  await t.run(async (ctx) => {
    await ctx.db.insert("packInterest", {
      userId,
      offer: "pack-20-usd-3",
      surface: "remix",
      shownAt: 1,
      clickedAt: 1,
      clickedSurface: "remix",
      notifyRequestedAt: 1,
    });
  });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual(none);
  expect(await t.query(internal.internal.packInterest.summary, {})).toMatchObject({
    shown: 0,
    asked: 0,
    askedInRemix: 0,
    wantNotice: 0,
  });

  await me.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "asked" });
  expect(await me.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: true, notify: false });
  const rows = await t.run(async (ctx) => await ctx.db.query("packInterest").collect());
  expect(rows.map((row) => [row.offer, row.surface, row.notifyRequestedAt !== undefined]).sort()).toEqual([
    ["pack-20-usd-3", "remix", true],
    [OFFER, "feed", false],
  ]);
  expect(await t.query(internal.internal.packInterest.summary, {})).toMatchObject({
    shown: 1,
    asked: 1,
    askedOnFeed: 1,
    askedInRemix: 0,
    wantNotice: 0,
  });
});

// Added by the ship coverage audit (Claude Fable 5.2), pass 1.
// Value: protects=a signed-in person whose users row isn't stored yet sees the unanswered offer, and their request is still recorded;
// fails_when=getMine throws or reads a missing user, or record stops creating the account it needs;
// why_new=every other test seeds the users row first; seam=none;
// no_claim=Clerk's real token (convex-test identity stands in)
test("a signed-in person the app hasn't stored yet sees no answer, and their request is recorded", async () => {
  const { t } = await setUp();
  const fresh = t.withIdentity({
    subject: "user_new",
    tokenIdentifier: "https://clerk.example|user_new",
    email: "new@example.com",
  });
  expect(await fresh.query(api.core.packInterest.getMine, {})).toEqual(none);

  await fresh.mutation(api.core.packInterest.record, { offer: OFFER, surface: "remix", step: "notify" });
  expect(await fresh.query(api.core.packInterest.getMine, {})).toEqual({ shown: true, clicked: true, notify: true });
  const rows = await t.run(async (ctx) => await ctx.db.query("packInterest").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ offer: OFFER, surface: "remix" });
});

test("a guest can't record anything and sees none", async () => {
  const { t } = await setUp();
  expect(await t.query(api.core.packInterest.getMine, {})).toEqual(none);
  await expect(t.mutation(api.core.packInterest.record, { offer: OFFER, surface: "feed", step: "shown" })).rejects.toThrow();
});

test("only the two functions the offer needs are callable by the app", () => {
  expect(Object.keys(packInterest).sort()).toEqual(["getMine", "record"]);
  expect(packInterest.getMine.isPublic).toBe(true);
  expect(packInterest.record.isPublic).toBe(true);
});
