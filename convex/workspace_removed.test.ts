/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "workspace@test.com",
      tokenIdentifier: "workspace|test",
    });
    const orgId = await ctx.db.insert("organizations", {
      name: "Team",
      planTier: "team",
      billingStatus: "active",
    });
    await ctx.db.insert("organization_members", { userId, organizationId: orgId, role: "admin" });
    const question = { status: "public" as const, totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
    const questionId = await ctx.db.insert("questions", { text: "Liked now?", ...question });
    const likedInWorkspaceId = await ctx.db.insert("questions", { text: "Liked in the workspace?", ...question });
    return { userId, orgId, questionId, likedInWorkspaceId };
  });
}

// Value: protects=an app loaded before workspaces were removed keeps working: the workspace it still sends is accepted, and what it saves lands in the person's own list;
// fails_when=a function refuses the old argument, or still files the like under the workspace, where nothing reads it;
// why_new=workspaces were removed, and tabs opened before that keep sending the one they had selected;
// seam=none; no_claim=what an old app shows while it still has the workspace selected.
test("a workspace an old app still sends is ignored: the like lands in the person's own list", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId, questionId } = await seed(t);

  await t.withIdentity(identity).mutation(api.core.userSettings.updateLikedQuestions, {
    likedQuestions: [questionId],
    organizationId: orgId,
  });

  const own = await t.withIdentity(identity).query(api.core.userSettings.getSettings, {});
  const sentWithWorkspace = await t
    .withIdentity(identity)
    .query(api.core.userSettings.getSettings, { organizationId: orgId });
  expect(own?.likedQuestions).toEqual([questionId]);
  expect(sentWithWorkspace?.likedQuestions).toEqual([questionId]);

  const rows = await t.run(async (ctx) => await ctx.db.query("userQuestions").collect());
  expect(rows.map((row) => ({ userId: row.userId, organizationId: row.organizationId }))).toEqual([
    { userId, organizationId: undefined },
  ]);
});

// Value: protects=what a workspace held stays out of a person's own lists and allowance until it is deleted: a like saved in the workspace isn't shown, and the workspace's AI usage isn't counted as theirs;
// fails_when=a read stops asking for the person's own rows only, so a workspace's rows are mixed in;
// why_new=the rows still exist until the clean-up runs, and every read now has to leave them out;
// seam=none; no_claim=the clean-up itself.
test("a like and an AI usage count a workspace held are not read as the person's own", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "10");
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId, likedInWorkspaceId } = await seed(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("userQuestions", {
      userId,
      organizationId: orgId,
      questionId: likedInWorkspaceId,
      status: "liked",
      updatedAt: Date.now(),
      seenCount: 1,
    });
    await ctx.db.insert("userAiUsage", { userId, organizationId: orgId, count: 9, cycleStart: Date.now() });
    await ctx.db.insert("userAiUsage", { userId, count: 2, cycleStart: Date.now() });
  });

  const settings = await t.withIdentity(identity).query(api.core.userSettings.getSettings, {});
  expect(settings?.likedQuestions).toEqual([]);

  const currentUser = await t
    .withIdentity(identity)
    .query(api.core.users.getCurrentUser, { organizationId: orgId });
  expect(currentUser?.aiUsage.count).toBe(2);
  expect(currentUser?.aiLimit).toBe(10);
  expect(currentUser?.isAiLimitReached).toBe(false);
});

// Value: protects=there is one plan: a person whose team was paying gets the same allowance as everyone, and no role in a workspace;
// fails_when=a plan or a role is still read from an organization;
// why_new=the Team plan was removed, and its rows still exist until the clean-up runs;
// seam=none; no_claim=what a person's own subscription would change, since nothing sells one yet.
test("a member of a team that was paying is on the one plan, with no workspace role", async () => {
  vi.stubEnv("MAX_FREE_AIGEN", "10");
  vi.stubEnv("MAX_TEAM_AIGEN", "100");
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { orgId } = await seed(t);

  const currentUser = await t
    .withIdentity(identity)
    .query(api.core.users.getCurrentUser, { organizationId: orgId });
  expect(currentUser?.planTier).toBe("free");
  expect(currentUser?.aiLimit).toBe(10);
  expect(currentUser?.organizationRole).toBeUndefined();
  expect(currentUser?.activeOrganizationId).toBeUndefined();

  expect(await t.withIdentity(identity).query(api.core.organizations.getOrganizations, {})).toEqual([]);
});

// Value: protects=the style, tone and topic lists and a person's own question list never show what a workspace owned, even to a member of the paying team whose old app still sends it;
// fails_when=a list goes back to merging in the rows of the workspace an old app sends, or stops leaving them out once nothing sends one;
// why_new=these lists took a workspace and returned its rows; the existing tests only list them without one and with no workspace row present;
// seam=none; no_claim=rows a workspace owned in tables other than styles, tones, topics and questions.
test("an old app that sends its workspace gets only the shared styles, tones and topics, and only the person's own questions", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId } = await seed(t);
  const ids = await t.run(async (ctx) => {
    const style = { structure: "x", color: "#111111", icon: "sparkles", status: "active" as const, version: 1 };
    const tone = { promptGuidanceForAI: "x", color: "#222222", icon: "sun", status: "active" as const, version: 1 };
    const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
    return {
      sharedStyle: await ctx.db.insert("styles", { ...style, id: "open-ended", slug: "open-ended", name: "Open-ended" }),
      teamStyle: await ctx.db.insert("styles", { ...style, id: "gym-drill", slug: "gym-drill", name: "Gym drill", organizationId: orgId }),
      sharedTone: await ctx.db.insert("tones", { ...tone, id: "warm", slug: "warm", name: "Warm" }),
      teamTone: await ctx.db.insert("tones", { ...tone, id: "coach-voice", slug: "coach-voice", name: "Coach voice", organizationId: orgId }),
      sharedTopic: await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", status: "active" as const, version: 1 }),
      teamTopic: await ctx.db.insert("topics", { id: "recovery", slug: "recovery", name: "Recovery", status: "active" as const, version: 1, organizationId: orgId }),
      ownQuestion: await ctx.db.insert("questions", { customText: "My own?", status: "private", authorId: userId, kind: "personal", ...counters }),
      teamQuestion: await ctx.db.insert("questions", { customText: "The team's?", status: "private", authorId: userId, organizationId: orgId, ...counters }),
    };
  });
  const me = t.withIdentity(identity);

  for (const args of [{}, { organizationId: orgId }]) {
    expect((await me.query(api.core.styles.getStyles, args)).map((row) => row._id)).toEqual([ids.sharedStyle]);
    expect((await me.query(api.core.tones.getTones, args)).map((row) => row._id)).toEqual([ids.sharedTone]);
    expect((await me.query(api.core.topics.getTopics, args)).map((row) => row._id)).toEqual([ids.sharedTopic]);
    expect((await me.query(api.core.questions.getCustomQuestions, args)).map((row) => row._id)).toEqual([ids.ownQuestion]);
  }
});

// Value: protects=a question a workspace owned can't be edited, made public or deleted, not even by the person who wrote it, so it can't be moved into the shared library;
// fails_when=the lifecycle check goes back to refusing only a team prompt, and a workspace's question is changed like a personal one;
// why_new=the existing test covers a team prompt's delete only; a workspace's ordinary question, and edit and make-public, have no test;
// seam=none; no_claim=what the clean-up does with the question later.
test("the author of a question a workspace owned can't edit it, make it public or delete it", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId } = await seed(t);
  const teamQuestion = await t.run(async (ctx) =>
    ctx.db.insert("questions", {
      customText: "The team's question?",
      status: "private",
      authorId: userId,
      organizationId: orgId,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    }),
  );
  const me = t.withIdentity(identity);

  await expect(
    me.mutation(api.core.questions.updatePersonalQuestion, { questionId: teamQuestion, customText: "Now mine?", isPublic: true }),
  ).rejects.toThrow("belonged to a team workspace");
  await expect(me.mutation(api.core.questions.makeQuestionPublic, { questionId: teamQuestion })).rejects.toThrow("belonged to a team workspace");
  await expect(me.mutation(api.core.questions.deletePersonalQuestion, { questionId: teamQuestion })).rejects.toThrow("belonged to a team workspace");

  expect(await t.run((ctx) => ctx.db.get(teamQuestion))).toMatchObject({ customText: "The team's question?", status: "private", organizationId: orgId });
});

// Value: protects=a team prompt with no workspace on it is frozen like any workspace question: its author can't edit it or send it for review into the shared library;
// fails_when=the kind half of the personal-question guard is dropped, so only organizationId is checked;
// why_new=only deleting a team prompt was tested; editing and making one public were not;
// seam=none; no_claim=what an admin can do with one (updateQuestion refuses it separately).
test("the author of a team prompt with no workspace can't edit it or make it public", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId } = await seed(t);
  const prompt = await t.run((ctx) =>
    ctx.db.insert("questions", { customText: "A team prompt?", status: "private", authorId: userId, kind: "team_prompt", totalLikes: 0, totalShows: 0, averageViewDuration: 0 }),
  );

  await expect(
    t.withIdentity(identity).mutation(api.core.questions.updatePersonalQuestion, { questionId: prompt, customText: "Now mine?", isPublic: true }),
  ).rejects.toThrow("belonged to a team workspace");
  await expect(t.withIdentity(identity).mutation(api.core.questions.makeQuestionPublic, { questionId: prompt })).rejects.toThrow(
    "belonged to a team workspace",
  );

  expect(await t.run((ctx) => ctx.db.get(prompt))).toMatchObject({ customText: "A team prompt?", status: "private", kind: "team_prompt" });
});

const ADMIN = { subject: "admin-clerk", tokenIdentifier: "test|admin-clerk", email: "admin@example.com", metadata: { isAdmin: "true" } };
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

// Value: protects=a public question a workspace owned is closed everywhere a shared question could reach someone: by link, in its share image, in the daily email's pick and in the admin's review queue;
// fails_when=a reader goes back to checking only the status, so a workspace's public question opens by link or is mailed, or its pending one can be approved into the library;
// why_new=canReadQuestion refused these, but the link, share image, email and queue paths each had their own check;
// seam=none; no_claim=questions created after the clean-up, since nothing creates them any more.
test("a workspace's public question doesn't open by link or share image, isn't mailed, and its pending one can't be approved", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId } = await seed(t);
  const ids = await t.run(async (ctx) => ({
    publicOne: await ctx.db.insert("questions", { text: "What did the team do this weekend?", status: "public", organizationId: orgId, ...counters }),
    pendingOne: await ctx.db.insert("questions", { customText: "Send this one for review?", status: "pending", organizationId: orgId, authorId: userId, ...counters }),
    pendingPrompt: await ctx.db.insert("questions", { customText: "A team prompt for review?", status: "pending", kind: "team_prompt", ...counters }),
    library: await ctx.db.insert("questions", { text: "What made you laugh this week?", status: "public", ...counters }),
  }));

  expect(await t.query(api.core.questions.getQuestionById, { id: ids.publicOne })).toBeNull();
  expect(await t.query(api.core.questions.getQuestionForOgImage, { id: ids.publicOne })).toBeNull();
  expect(
    await t.query(internal.internal.questions.getFirstEligibleNewsletterQuestionForUser, { userId, questionIds: [ids.publicOne], excludedQuestionIds: [] }),
  ).toBeNull();
  // The library question beside it is unaffected.
  expect(await t.query(api.core.questions.getQuestionById, { id: ids.library })).toMatchObject({ _id: ids.library });

  const queue = await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {});
  expect(queue.map((question: { _id: string }) => question._id)).toEqual([]);
  for (const id of [ids.pendingOne, ids.pendingPrompt]) {
    await expect(
      t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, { id, expectedRevision: 0, reviewReason: "Approve", status: "public" }),
    ).rejects.toThrow("belonged to a team workspace");
  }
  expect((await t.run((ctx) => ctx.db.get(ids.pendingOne)))?.status).toBe("pending");
});

// Value: protects=a style, tone or topic a workspace owned is never shown or offered: lookups by name or id give the shared entry or nothing, and a workspace's open takeover topic isn't offered to everyone's feed;
// fails_when=a single lookup stops filtering workspace rows, so a team's copy replaces the shared one, or a team's takeover makes feed generation fail on a topic it now refuses;
// why_new=the list queries and generation were scoped, but single lookups and takeover topics read every row;
// seam=none; no_claim=what the admin taxonomy pages show, which still list every row.
test("lookups by name or id and takeover topics leave out what a workspace owned", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { orgId } = await seed(t);
  const ids = await t.run(async (ctx) => {
    const style = { structure: "x", color: "#111111", icon: "sparkles", status: "active" as const };
    const tone = { promptGuidanceForAI: "x", color: "#222222", icon: "sun", status: "active" as const };
    const now = Date.now();
    return {
      sharedStyle: await ctx.db.insert("styles", { id: "open-ended", slug: "open-ended", name: "Open-ended", version: 1, ...style }),
      teamStyle: await ctx.db.insert("styles", { id: "open-ended", slug: "open-ended", name: "Gym open-ended", version: 2, organizationId: orgId, ...style }),
      sharedTone: await ctx.db.insert("tones", { id: "warm", slug: "warm", name: "Warm", version: 1, ...tone }),
      teamTone: await ctx.db.insert("tones", { id: "warm", slug: "warm", name: "Gym warm", version: 2, organizationId: orgId, ...tone }),
      sharedTopic: await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", version: 1, status: "active" }),
      teamTopic: await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Gym weekends", version: 2, status: "active", organizationId: orgId, takeoverStartDate: now - 1000 }),
    };
  });

  expect((await t.query(api.core.styles.getStyle, { id: "open-ended" }))?._id).toBe(ids.sharedStyle);
  expect((await t.query(api.core.tones.getTone, { id: "warm" }))?._id).toBe(ids.sharedTone);
  expect((await t.query(api.core.topics.getTopic, { id: "weekends" }))?._id).toBe(ids.sharedTopic);
  expect(await t.query(api.core.styles.getStyleById, { id: ids.teamStyle })).toBeNull();
  expect(await t.query(api.core.tones.getToneById, { id: ids.teamTone })).toBeNull();
  expect(await t.query(api.core.topics.getTopicById, { id: ids.teamTopic })).toBeNull();
  expect(await t.query(api.core.topics.getTopicBySystemId, { id: ids.teamTopic })).toBeNull();
  expect(await t.query(api.core.topics.getActiveTakeoverTopics, {})).toEqual([]);
});

// Value: protects=every internal picker hands generation only shared styles, tones and topics, so feed, daily-email and nightly generation can't fail on a row generation refuses; style examples skip a workspace's question;
// fails_when=a picker reads every row again, so a workspace's style, tone or topic (even a higher version of a shared slug) is chosen;
// why_new=generation now refuses workspace taxonomy, and these internal readers had no workspace filter;
// seam=none; no_claim=the admin taxonomy pages, which still list every row.
test("random style and tone picks, the nightly topic, visible lists and style examples never use what a workspace owned", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const { userId, orgId } = await seed(t);
  const ids = await t.run(async (ctx) => {
    const style = { structure: "x", color: "#111111", icon: "sparkles", status: "active" as const };
    const tone = { promptGuidanceForAI: "x", color: "#222222", icon: "sun", status: "active" as const };
    const sharedStyle = await ctx.db.insert("styles", { id: "open-ended", slug: "open-ended", name: "Open-ended", version: 1, ...style });
    await ctx.db.insert("styles", { id: "open-ended", slug: "open-ended", name: "Gym open-ended", version: 2, organizationId: orgId, ...style });
    await ctx.db.insert("styles", { id: "gym-only", slug: "gym-only", name: "Gym only", version: 1, organizationId: orgId, ...style });
    const sharedTone = await ctx.db.insert("tones", { id: "warm", slug: "warm", name: "Warm", version: 1, ...tone });
    await ctx.db.insert("tones", { id: "gym-voice", slug: "gym-voice", name: "Gym voice", version: 1, organizationId: orgId, ...tone });
    await ctx.db.insert("topics", { id: "gym-topic", slug: "gym-topic", name: "Gym topic", version: 1, status: "active", order: 0, organizationId: orgId });
    const sharedTopic = await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", version: 1, status: "active", order: 1 });
    await ctx.db.insert("questions", { text: "What did the team do this weekend?", status: "public", organizationId: orgId, styleId: sharedStyle, ...counters });
    await ctx.db.insert("questions", { text: "What made you laugh this week?", status: "public", styleId: sharedStyle, ...counters });
    return { sharedStyle, sharedTone, sharedTopic };
  });

  for (const seed of [0, 0.3, 0.6, 0.99]) {
    expect((await t.query(internal.internal.styles.getRandomStyleForUserId, { userId, seed }))?._id).toBe(ids.sharedStyle);
    expect((await t.query(internal.internal.tones.getRandomToneForUserId, { userId, seed }))?._id).toBe(ids.sharedTone);
  }
  expect((await t.query(internal.internal.topics.getTopCurrentTopic, {}))?._id).toBe(ids.sharedTopic);
  expect((await t.query(internal.internal.users.getUserVisibleStyles, { userId })).map((style: { _id: string }) => style._id)).toEqual([ids.sharedStyle]);
  expect((await t.query(internal.internal.users.getUserVisibleTones, { userId })).map((tone: { _id: string }) => tone._id)).toEqual([ids.sharedTone]);
  expect((await t.query(api.core.styles.getStylesWithExamples, { id: "open-ended", seed: 1 }))?.examples).toEqual(["What made you laugh this week?"]);
});

// Value: protects=a public team prompt with no workspace on it doesn't open by link or in a share image either;
// fails_when=the kind half of isWorkspaceQuestion is dropped, so only organizationId is checked;
// why_new=the link-read test only read a question that had an organizationId;
// seam=none; no_claim=none beyond protects.
test("a public team prompt with no workspace doesn't open by link or share image", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  await seed(t);
  const prompt = await t.run((ctx) => ctx.db.insert("questions", { text: "A team prompt?", status: "public", kind: "team_prompt", ...counters }));

  expect(await t.query(api.core.questions.getQuestionById, { id: prompt })).toBeNull();
  expect(await t.query(api.core.questions.getQuestionForOgImage, { id: prompt })).toBeNull();
});
