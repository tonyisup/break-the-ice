/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WORKSPACE_CLEANUP_PAGE_SIZE, WORKSPACE_CLEANUP_TABLES } from "./internal/migrations";

afterEach(() => vi.restoreAllMocks());

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const style = (slug: string) => ({ id: slug, slug, status: "active" as const, version: 1, name: slug, structure: "x", color: "#111111", icon: "sparkles" });
const tone = (slug: string) => ({ id: slug, slug, status: "active" as const, version: 1, name: slug, promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
const topic = (slug: string) => ({ id: slug, slug, status: "active" as const, version: 1, name: slug });
const embedding = Array.from({ length: 384 }, () => 0);

/**
 * One person with their own question, like, hidden style and AI usage, and a team workspace
 * that left a row in every table the clean-up reads, with more matrix locks than one page holds.
 */
async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "member@example.com", clerkId: "member", billingSubjectType: "organization" });
    const payerId = await ctx.db.insert("users", { email: "payer@example.com", clerkId: "payer", billingSubjectType: "user", billingStatus: "active" });
    const organizationId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
    // A schedule whose organization is already gone, as production has.
    const goneOrganizationId = await ctx.db.insert("organizations", { name: "Gone" });
    await ctx.db.delete(goneOrganizationId);
    await ctx.db.insert("organization_members", { userId, organizationId, role: "admin" });
    await ctx.db.insert("invitations", { email: "invited@example.com", organizationId, role: "member" });
    await ctx.db.insert("orgSettings", { organizationId, weekStartDay: "monday" });
    for (let i = 0; i <= WORKSPACE_CLEANUP_PAGE_SIZE; i++) await ctx.db.insert("matrixFillCellLocks", { organizationId, cellKey: `cell-${i}` });

    const sharedStyleId = await ctx.db.insert("styles", style("open-ended"));
    const sharedToneId = await ctx.db.insert("tones", tone("warm"));
    const sharedTopicId = await ctx.db.insert("topics", topic("weekends"));
    const teamStyleId = await ctx.db.insert("styles", { ...style("open-ended"), version: 2, organizationId });
    const teamToneId = await ctx.db.insert("tones", { ...tone("gym-voice"), organizationId });
    const teamTopicRowId = await ctx.db.insert("topics", { ...topic("recovery"), organizationId });
    await ctx.db.insert("style_embeddings", { styleId: sharedStyleId, embedding });
    await ctx.db.insert("style_embeddings", { styleId: teamStyleId, embedding });
    await ctx.db.insert("tone_embeddings", { toneId: teamToneId, embedding });
    await ctx.db.insert("topic_embeddings", { topicId: teamTopicRowId, embedding });

    const libraryId = await ctx.db.insert("questions", { text: "What made you laugh this week?", status: "public", ...counters });
    const ownId = await ctx.db.insert("questions", { customText: "My own question?", status: "private", authorId: userId, kind: "personal", ...counters });
    const teamQuestionId = await ctx.db.insert("questions", { customText: "A team's question?", status: "private", authorId: userId, organizationId, ...counters });
    const teamPromptId = await ctx.db.insert("questions", { customText: "A team prompt?", status: "private", authorId: userId, organizationId, kind: "team_prompt", ...counters });
    const strayPromptId = await ctx.db.insert("questions", { customText: "A prompt with no team?", status: "private", kind: "team_prompt", ...counters });
    await ctx.db.insert("question_embeddings", { questionId: libraryId, embedding });
    await ctx.db.insert("question_embeddings", { questionId: teamQuestionId, embedding });

    const collectionId = await ctx.db.insert("collections", { name: "Mondays", organizationId });
    await ctx.db.insert("question_collections", { questionId: libraryId, collectionId });
    // A collection entry for a team prompt: the question's clean-up would also take it.
    await ctx.db.insert("question_collections", { questionId: teamPromptId, collectionId });
    const teamTopicId = await ctx.db.insert("teamTopics", { organizationId, name: "Recovery", guidance: "Rest days", createdBy: userId, createdAt: 0, updatedAt: 0 });
    const scheduleId = await ctx.db.insert("schedules", { organizationId, weekStart: "2026-04-13", weekEnd: "2026-04-19", status: "published", weekStartDay: "monday", createdAt: 0, updatedAt: 0 });
    const orphanScheduleId = await ctx.db.insert("schedules", { organizationId: goneOrganizationId, weekStart: "2026-04-13", weekEnd: "2026-04-19", status: "draft", weekStartDay: "monday", createdAt: 0, updatedAt: 0 });
    const scheduledQuestionId = await ctx.db.insert("scheduledQuestions", { scheduleId, dayOfWeek: "monday", questionId: teamPromptId, slotOrder: 0, assignedAt: 0, teamTopicId });
    await ctx.db.insert("scheduledQuestions", { scheduleId: orphanScheduleId, dayOfWeek: "monday", questionId: libraryId, slotOrder: 0, assignedAt: 0 });
    await ctx.db.insert("coachFeedback", { scheduleId, scheduledQuestionId, questionId: teamPromptId, coachId: userId, dayOfWeek: "monday", landedWell: true, submittedAt: 0 });

    const seen = { status: "liked" as const, updatedAt: 0, seenCount: 1 };
    const ownLikeId = await ctx.db.insert("userQuestions", { userId, questionId: libraryId, ...seen });
    await ctx.db.insert("userQuestions", { userId, organizationId, questionId: libraryId, ...seen });
    // A person's own like of a team's question goes too, and so does one saved inside the workspace.
    await ctx.db.insert("userQuestions", { userId, questionId: teamQuestionId, ...seen });
    await ctx.db.insert("userQuestions", { userId, organizationId, questionId: teamQuestionId, ...seen });
    const hidden = { status: "hidden" as const, updatedAt: 0 };
    const ownHiddenStyleId = await ctx.db.insert("userStyles", { userId, styleId: sharedStyleId, ...hidden });
    await ctx.db.insert("userStyles", { userId, organizationId, styleId: sharedStyleId, ...hidden });
    await ctx.db.insert("userStyles", { userId, styleId: teamStyleId, ...hidden });
    const ownHiddenToneId = await ctx.db.insert("userTones", { userId, toneId: sharedToneId, ...hidden });
    await ctx.db.insert("userTones", { userId, organizationId, toneId: sharedToneId, ...hidden });
    await ctx.db.insert("userTones", { userId, toneId: teamToneId, ...hidden });
    const ownUsageId = await ctx.db.insert("userAiUsage", { userId, count: 2, cycleStart: 0 });
    await ctx.db.insert("userAiUsage", { userId, organizationId, count: 9, cycleStart: 0 });

    await ctx.db.insert("rateLimits", { name: "matrixFillCell", key: organizationId, value: 49, ts: 0 });
    await ctx.db.insert("rateLimits", { name: "aiRequest", key: "member", value: 9, ts: 0 });

    return {
      userId, payerId, sharedStyleId, sharedToneId, sharedTopicId, libraryId, ownId,
      teamQuestionId, teamPromptId, strayPromptId, ownLikeId, ownHiddenStyleId, ownHiddenToneId, ownUsageId,
    };
  });
}

const EVERY_TABLE = [
  ...WORKSPACE_CLEANUP_TABLES,
  "question_embeddings", "style_embeddings", "tone_embeddings", "topic_embeddings",
] as const;
const rowCounts = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of EVERY_TABLE) counts[table] = (await ctx.db.query(table).collect()).length;
    return counts;
  });

// The rows of the seed that are a workspace's, table by table.
const EXPECTED = {
  questions: 3,
  styles: 1,
  tones: 1,
  topics: 1,
  userQuestions: 3,
  userStyles: 2,
  userTones: 2,
  userAiUsage: 1,
  users: 1,
  rateLimits: 1,
  scheduledQuestions: 2,
  coachFeedback: 1,
  schedules: 2,
  teamTopics: 1,
  orgSettings: 1,
  matrixFillCellLocks: WORKSPACE_CLEANUP_PAGE_SIZE + 1,
  question_collections: 2,
  collections: 1,
  invitations: 1,
  organization_members: 1,
  organizations: 1,
};

// Value: protects=a dry run of the workspace clean-up says what a real run would remove, table by table, and removes nothing;
// fails_when=the dry run writes, or its counts stop matching what the real run cleans;
// why_new=the clean-up is new, and its dry run is what the owner reads before running it on production;
// seam=none; no_claim=how long a run takes on a full table.
test("a dry run reports what the clean-up would remove from each table and changes nothing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  await seed(t);
  const before = await rowCounts(t);

  expect(await t.action(internal.internal.migrations.removeWorkspaceData, { dryRun: true })).toEqual(EXPECTED);

  expect(await rowCounts(t)).toEqual(before);
});

// Value: protects=the clean-up removes every row a team workspace left, across pages, and nothing of a person's own: their account, question, like, hidden entries and AI usage stay, and so does the shared library;
// fails_when=a workspace's row survives (the schema then can't drop its table or field), or a person's own row or a shared one is deleted;
// why_new=the clean-up is new, and it deletes from tables people's own data lives in;
// seam=none; no_claim=rows a later version of the app might add.
test("a real run removes everything a workspace left and nothing of a person's own, and a second run finds nothing", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await seed(t);

  expect(await t.action(internal.internal.migrations.removeWorkspaceData, { dryRun: false })).toEqual(EXPECTED);

  expect(await rowCounts(t)).toEqual({
    questions: 2, styles: 1, tones: 1, topics: 1,
    // The like and the hidden entries that pointed at a team's question, style and tone went with them.
    userQuestions: 1, userStyles: 1, userTones: 1, userAiUsage: 1,
    users: 2, rateLimits: 1,
    scheduledQuestions: 0, coachFeedback: 0, schedules: 0, teamTopics: 0, orgSettings: 0, matrixFillCellLocks: 0,
    question_collections: 0, collections: 0, invitations: 0, organization_members: 0, organizations: 0,
    question_embeddings: 1, style_embeddings: 1, tone_embeddings: 0, topic_embeddings: 0,
  });
  await t.run(async (ctx) => {
    for (const id of [ids.libraryId, ids.ownId, ids.sharedStyleId, ids.sharedToneId, ids.sharedTopicId, ids.ownLikeId, ids.ownHiddenStyleId, ids.ownHiddenToneId, ids.ownUsageId]) {
      expect(await ctx.db.get(id)).not.toBeNull();
    }
    for (const id of [ids.teamQuestionId, ids.teamPromptId, ids.strayPromptId]) expect(await ctx.db.get(id)).toBeNull();
    // The accounts stay. Only the marker that an organization paid is cleared.
    expect((await ctx.db.get(ids.userId))?.billingSubjectType).toBeUndefined();
    expect(await ctx.db.get(ids.payerId)).toMatchObject({ billingSubjectType: "user", billingStatus: "active" });
    expect((await ctx.db.query("rateLimits").collect()).map((row) => row.name)).toEqual(["aiRequest"]);
  });

  const again = await t.action(internal.internal.migrations.removeWorkspaceData, { dryRun: true });
  expect(Object.values(again)).toEqual(WORKSPACE_CLEANUP_TABLES.map(() => 0));
});

// Value: protects=deleting a workspace's questions settles the pending duplicate groups they were in, once per page: a pair falls away and a larger group keeps its live members;
// fails_when=a group keeps a deleted question's id, or a group with one live member is left pending;
// why_new=the clean-up settles duplicate groups itself, once per page, instead of once per deleted question;
// seam=none; no_claim=the read limit on a deployment with many pending groups.
test("a real run settles the pending duplicate groups a workspace's questions were in", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await seed(t);
  const groups = await t.run(async (ctx) => {
    const otherId = await ctx.db.insert("questions", { text: "What made you smile this week?", status: "public", ...counters });
    const group = (questionIds: typeof ids.libraryId[]) => {
      const sorted = [...questionIds].sort();
      return ctx.db.insert("duplicateDetections", { questionIds: sorted, uniqueKey: sorted.join("_"), reason: "same", confidence: 0.9, status: "pending" });
    };
    return {
      otherId,
      pair: await group([ids.libraryId, ids.teamQuestionId]),
      trio: await group([ids.libraryId, otherId, ids.teamPromptId]),
    };
  });

  await t.action(internal.internal.migrations.removeWorkspaceData, { dryRun: false });

  await t.run(async (ctx) => {
    expect(await ctx.db.get(groups.pair)).toBeNull();
    expect((await ctx.db.get(groups.trio))?.questionIds).toEqual([ids.libraryId, groups.otherId].sort());
  });
});
