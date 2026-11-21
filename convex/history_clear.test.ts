/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const OWNER = { subject: "owner-clerk", tokenIdentifier: "test|owner-clerk", email: "owner@example.com" };
const OTHER = { subject: "other-clerk", tokenIdentifier: "test|other-clerk", email: "other@example.com" };
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: OWNER.email, clerkId: OWNER.subject });
    const otherId = await ctx.db.insert("users", { email: OTHER.email, clerkId: OTHER.subject });
    const questionId = await ctx.db.insert("questions", { text: "Seen before?", status: "public", ...counters });
    const viewedAt = Date.now() - 60_000;
    for (const userId of [ownerId, otherId]) {
      await ctx.db.insert("userQuestions", { userId, questionId, status: "seen", updatedAt: viewedAt });
    }
    return { ownerId, questionId };
  });
  return { t, ...ids };
}

const historyIds = (history: { question: { _id: Id<"questions"> } }[]) => history.map((entry) => entry.question._id);

test("clearing history empties it for that person and leaves their view records in place", async () => {
  const { t, ownerId, questionId } = await setup();
  const owner = t.withIdentity(OWNER);
  expect(historyIds(await owner.query(api.core.userSettings.getQuestionHistory, {}))).toEqual([questionId]);

  await owner.mutation(api.core.userSettings.clearQuestionHistory, {});

  expect(await owner.query(api.core.userSettings.getQuestionHistory, {})).toEqual([]);
  // The feed still knows the question was shown: nothing was deleted.
  const rows = await t.run((ctx) =>
    ctx.db.query("userQuestions").withIndex("by_userId", (q) => q.eq("userId", ownerId)).collect(),
  );
  expect(rows).toHaveLength(1);
  // Someone else's history is untouched.
  expect(historyIds(await t.withIdentity(OTHER).query(api.core.userSettings.getQuestionHistory, {}))).toEqual([questionId]);
});

test("a question viewed after clearing shows up in history again", async () => {
  const { t, ownerId, questionId } = await setup();
  const owner = t.withIdentity(OWNER);
  await owner.mutation(api.core.userSettings.clearQuestionHistory, {});

  await t.run(async (ctx) => {
    const row = await ctx.db.query("userQuestions").withIndex("by_userId", (q) => q.eq("userId", ownerId)).first();
    await ctx.db.patch(row!._id, { updatedAt: Date.now() + 5_000 });
  });

  expect(historyIds(await owner.query(api.core.userSettings.getQuestionHistory, {}))).toEqual([questionId]);
});
