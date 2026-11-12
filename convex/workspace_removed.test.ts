/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const identity = {
  tokenIdentifier: "workspace|test",
  email: "workspace@test.com",
};

// What an app loaded before workspaces were removed still sends: the id of the one it had selected.
const oldWorkspaceId = "k57c3m8a9e2zq0organization";

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "workspace@test.com",
      tokenIdentifier: "workspace|test",
    });
    const question = { status: "public" as const, totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
    const questionId = await ctx.db.insert("questions", { text: "Liked now?", ...question });
    return { userId, questionId };
  });
}

// Value: protects=an app loaded before workspaces were removed keeps working: the workspace it still sends is accepted, and what it saves lands in the person's own list;
// fails_when=a function refuses the old argument;
// why_new=workspaces were removed, and tabs opened before that keep sending the one they had selected;
// seam=none; no_claim=what an old app shows while it still has the workspace selected.
test("a workspace an old app still sends is ignored: the like lands in the person's own list", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, questionId } = await seed(t);

  await t.withIdentity(identity).mutation(api.core.userSettings.updateLikedQuestions, {
    likedQuestions: [questionId],
    organizationId: oldWorkspaceId,
  });

  const own = await t.withIdentity(identity).query(api.core.userSettings.getSettings, {});
  const sentWithWorkspace = await t
    .withIdentity(identity)
    .query(api.core.userSettings.getSettings, { organizationId: oldWorkspaceId });
  expect(own?.likedQuestions).toEqual([questionId]);
  expect(sentWithWorkspace?.likedQuestions).toEqual([questionId]);

  const rows = await t.run(async (ctx) => await ctx.db.query("userQuestions").collect());
  expect(rows.map((row) => row.userId)).toEqual([userId]);
});

// Value: protects=an old app asking for its plan and its workspaces gets the one plan and an empty list, not an error;
// fails_when=the workspace list or the old argument is removed while such tabs are still open;
// why_new=the Team plan and workspaces were removed, and old tabs still ask for both;
// seam=none; no_claim=what a person's own subscription would change, since nothing sells one yet.
test("an old app gets the one plan, no workspace role and an empty workspace list", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "10");
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  await seed(t);

  const currentUser = await t
    .withIdentity(identity)
    .query(api.core.users.getCurrentUser, { organizationId: oldWorkspaceId });
  expect(currentUser?.planTier).toBe("free");
  expect(currentUser?.aiLimit).toBe(10);
  expect(currentUser?.organizationRole).toBeUndefined();
  expect(currentUser?.activeOrganizationId).toBeUndefined();

  expect(await t.withIdentity(identity).query(api.core.organizations.getOrganizations, {})).toEqual([]);
});

// Value: protects=the style, tone and topic lists and a person's own question list answer an old app that still sends its workspace the same as a current one;
// fails_when=a list stops accepting the old argument, or answers differently with it;
// why_new=these lists took a workspace; old tabs still send it;
// seam=none; no_claim=rows a workspace owned, which the schema no longer holds.
test("an old app that sends its workspace gets the same styles, tones, topics and own questions", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId } = await seed(t);
  const ids = await t.run(async (ctx) => {
    const style = { structure: "x", color: "#111111", icon: "sparkles", status: "active" as const, version: 1 };
    const tone = { promptGuidanceForAI: "x", color: "#222222", icon: "sun", status: "active" as const, version: 1 };
    const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
    return {
      style: await ctx.db.insert("styles", { ...style, id: "open-ended", slug: "open-ended", name: "Open-ended" }),
      tone: await ctx.db.insert("tones", { ...tone, id: "warm", slug: "warm", name: "Warm" }),
      topic: await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", status: "active" as const, version: 1 }),
      ownQuestion: await ctx.db.insert("questions", { customText: "My own?", status: "private", authorId: userId, kind: "personal", ...counters }),
    };
  });
  const me = t.withIdentity(identity);

  for (const args of [{}, { organizationId: oldWorkspaceId }]) {
    expect((await me.query(api.core.styles.getStyles, args)).map((row) => row._id)).toEqual([ids.style]);
    expect((await me.query(api.core.tones.getTones, args)).map((row) => row._id)).toEqual([ids.tone]);
    expect((await me.query(api.core.topics.getTopics, args)).map((row) => row._id)).toEqual([ids.topic]);
    expect((await me.query(api.core.questions.getCustomQuestions, args)).map((row) => row._id)).toEqual([ids.ownQuestion]);
  }
});
