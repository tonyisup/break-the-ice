/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { RETIRED_NORMALIZE_PAGE_SIZE } from "./internal/migrations";
import { fingerprintText } from "./lib/promptArchitecture";

type TestConvex = ReturnType<typeof convexTest>;

const modules = import.meta.glob("./**/*.ts");
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const admin = { subject: "editor", tokenIdentifier: "https://issuer.test|editor", metadata: { isAdmin: "true" } };
// Curly quotes are written as escapes so an editor can't quietly turn them into straight ones.
const smell = "What's a smell that takes you straight back to being a kid?";
const smellCurly = "What\u2019s a smell that takes you straight back to being a kid?";
const roadTripCurly = "What\u2019s the best snack you\u2019ve ever had on a road trip?";

// Scheduled embedding jobs stay queued instead of running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function insertQuestion(t: TestConvex, fields: Partial<Doc<"questions">>) {
  return t.run(async (ctx) => ctx.db.insert("questions", { status: "public", ...counters, ...fields }));
}

function getQuestion(t: TestConvex, questionId: Id<"questions">) {
  return t.run(async (ctx) => ctx.db.get(questionId));
}

async function setupTaxonomy(t: TestConvex) {
  return t.run(async (ctx) => ({
    styleId: await ctx.db.insert("styles", {
      id: "reflective",
      slug: "reflective",
      name: "Reflective",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
      status: "active",
      version: 1,
    }),
    toneId: await ctx.db.insert("tones", {
      id: "warm",
      slug: "warm",
      name: "Warm",
      promptGuidanceForAI: "Be warm",
      color: "#222222",
      icon: "sun",
      status: "active",
      version: 1,
    }),
  }));
}

describe("a question older pruning marked with only prunedAt is retired", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const taxonomy = await setupTaxonomy(t);
    const live = await insertQuestion(t, { text: "Which seat do you always pick on a bus?", ...taxonomy });
    const legacy = await insertQuestion(t, { text: "What did you have for breakfast?", prunedAt: 1, ...taxonomy });
    return { t, live, legacy, ...taxonomy };
  }

  const feedArgs = { count: 10, seen: [], hidden: [], hiddenStyles: [], hiddenTones: [] };
  const ids = (questions: Doc<"questions">[]) => questions.map((question) => question._id);

  test("the feed leaves it out", async () => {
    const { t, live } = await setup();

    const questions = await t.query(internal.internal.questions.getRandomQuestionsInternal, feedArgs);

    expect(ids(questions)).toEqual([live]);
  });

  test("the feed leaves it out of the anchored pool too", async () => {
    const { t, live, styleId } = await setup();

    const questions = await t.query(internal.internal.questions.getRandomQuestionsInternal, { ...feedArgs, anchoredStyleId: styleId });

    expect(ids(questions)).toEqual([live]);
  });

  test("the anchored feed leaves it out", async () => {
    const { t, live, styleId } = await setup();

    const result = await t.query(internal.internal.questions.getAnchoredQuestionsInternal, {
      ...feedArgs,
      anchoredStyleId: styleId,
      currentTime: Date.now(),
    });

    expect(ids(result.questions)).toEqual([live]);
    expect(result.anchoredMatchCount).toBe(1);
  });

  test("the style and tone feed leaves it out", async () => {
    const { t, live, styleId, toneId } = await setup();

    const questions = await t.query(api.core.questions.getNextQuestions, { count: 10, style: styleId, tone: toneId });

    expect(ids(questions)).toEqual([live]);
  });

  test("its link no longer opens, like any pruned question", async () => {
    const { t, live, legacy } = await setup();

    expect(await t.query(api.core.questions.getQuestionById, { id: legacy })).toBeNull();
    expect(await t.query(api.core.questions.getQuestionById, { id: live })).toMatchObject({ _id: live });
  });

  test.each([
    ["approved", api.admin.pruning.approvePruning],
    ["rejected", api.admin.pruning.rejectPruning],
  ] as const)("a pruning review of it can't be %s", async (_outcome, decide) => {
    const { t, legacy } = await setup();
    const pruningId = await t.run(async (ctx) =>
      ctx.db.insert("pruning", { questionId: legacy, status: "pending", reason: "Low engagement" }),
    );
    const before = await getQuestion(t, legacy);

    await expect(
      t.withIdentity(admin).mutation(decide, { pruningId, reason: "Reviewed", expectedRevision: 0 }),
    ).rejects.toThrow("no longer available");
    expect(await getQuestion(t, legacy)).toEqual(before);
  });

  test("admin stats count it as pruned, not public, and not stale", async () => {
    const t = convexTest(schema, modules);
    const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await insertQuestion(t, { text: "Live?" });
    await insertQuestion(t, { text: "Pruned by older pruning?", prunedAt: 1, totalShows: 5, lastShownAt: longAgo });
    // createQuestion can save a pruned question with no prunedAt.
    await insertQuestion(t, { text: "Pruned without a date?", status: "pruned", totalShows: 5, lastShownAt: longAgo });

    const stats = await t.withIdentity(admin).query(api.admin.questions.getAdminStats, {});

    expect(stats.questions).toEqual({ total: 3, public: 1, pending: 0, pruned: 2 });
    expect(stats.staleCount).toBe(0);
  });
});

describe("recomputing fingerprints with questions older pruning marked with only prunedAt", () => {
  test("a pruned submission counts as private and isn't recomputed or listed; a pruned library question is recomputed but not listed", async () => {
    const t = convexTest(schema, modules);
    const submission = await insertQuestion(t, {
      authorId: "author-1",
      customText: roadTripCurly,
      status: "approved",
      prunedAt: 1,
      fingerprint: "q_old_submission",
    });
    const library = await insertQuestion(t, { text: smellCurly, prunedAt: 1, fingerprint: "q_old_smell" });
    await insertQuestion(t, { text: smell, fingerprint: fingerprintText(smell) });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toEqual({
      scanned: 3,
      privateUserQuestions: 1,
      withoutFingerprint: 0,
      withoutText: 0,
      changed: 1,
      collisionGroups: 0,
      collisions: [],
    });
    // Generation won't recreate the library question in straight quotes.
    expect((await getQuestion(t, library))?.fingerprint).toBe(fingerprintText(smell));
    expect((await getQuestion(t, submission))?.fingerprint).toBe("q_old_submission");

    // Like any pruned submission, it keeps no fingerprint once the private cleanup runs.
    const cleared = await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false });
    expect(cleared).toEqual({ scanned: 3, privateUserQuestions: 1, cleared: 1 });
    expect((await getQuestion(t, submission))?.fingerprint).toBeUndefined();
  });
});

describe("normalizing questions retired before the shared rule", () => {
  async function insertWithEmbedding(t: TestConvex, fields: Partial<Doc<"questions">>) {
    const questionId = await insertQuestion(t, fields);
    await t.run(async (ctx) => ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: fields.status }));
    return questionId;
  }

  async function setupQuestions() {
    const t = convexTest(schema, modules);
    const live = await insertWithEmbedding(t, { text: "Live?", fingerprint: fingerprintText("Live?") });
    const ids = {
      live,
      legacyLibrary: await insertWithEmbedding(t, { text: "Old library?", prunedAt: 1, fingerprint: fingerprintText("Old library?") }),
      legacyNoStatus: await insertQuestion(t, { text: "Older still?", status: undefined, prunedAt: 2 }),
      legacySubmission: await insertWithEmbedding(t, {
        authorId: "author-1",
        customText: "Old submission?",
        status: "approved",
        prunedAt: 3,
        fingerprint: fingerprintText("Old submission?"),
      }),
      editedAfterPruning: await insertQuestion(t, { authorId: "author-2", customText: "Edited?", status: "pending", prunedAt: 4 }),
      pruned: await insertQuestion(t, { text: "Pruned?", status: "pruned", prunedAt: 5 }),
      duplicate: await insertQuestion(t, { text: "Live?", status: "pruned", prunedAt: 6, duplicateOf: live, duplicateWasPublic: true }),
    };
    return { t, ids };
  }

  async function allQuestions(t: TestConvex) {
    return t.run(async (ctx) => ctx.db.query("questions").collect());
  }

  async function embeddedIds(t: TestConvex) {
    return t.run(async (ctx) => (await ctx.db.query("question_embeddings").collect()).map((row) => row.questionId));
  }

  const expectedCounts = { scanned: 7, markedPruned: 3, prunedAtCleared: 1, fingerprintsCleared: 1 };

  test("a dry run counts what it would change and writes nothing", async () => {
    const { t } = await setupQuestions();
    const before = await allQuestions(t);
    const embeddedBefore = await embeddedIds(t);

    const summary = await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: true });

    expect(summary).toEqual(expectedCounts);
    expect(await allQuestions(t)).toEqual(before);
    expect(await embeddedIds(t)).toEqual(embeddedBefore);
  });

  test("a real run prunes them, un-retires the author's edit, and a rerun changes nothing", async () => {
    const { t, ids } = await setupQuestions();

    const summary = await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: false });

    expect(summary).toEqual(expectedCounts);
    expect(await getQuestion(t, ids.legacyLibrary)).toMatchObject({
      status: "pruned",
      prunedAt: 1,
      fingerprint: fingerprintText("Old library?"),
    });
    expect(await getQuestion(t, ids.legacyNoStatus)).toMatchObject({ status: "pruned", prunedAt: 2 });
    const submission = await getQuestion(t, ids.legacySubmission);
    expect(submission).toMatchObject({ status: "pruned", prunedAt: 3 });
    expect(submission?.fingerprint).toBeUndefined();
    const edited = await getQuestion(t, ids.editedAfterPruning);
    expect(edited).toMatchObject({ status: "pending" });
    expect(edited?.prunedAt).toBeUndefined();
    expect(await getQuestion(t, ids.live)).toMatchObject({ status: "public" });
    expect(await getQuestion(t, ids.duplicate)).toMatchObject({ status: "pruned", duplicateOf: ids.live });
    // The pruned library question keeps its embedding; the pruned submission is private and drops it.
    expect((await embeddedIds(t)).sort()).toEqual([ids.live, ids.legacyLibrary].sort());

    const again = await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: false });
    expect(again).toEqual({ scanned: 7, markedPruned: 0, prunedAtCleared: 0, fingerprintsCleared: 0 });
  });

  test("a run with questions to normalize on more than one page normalizes them all", async () => {
    const t = convexTest(schema, modules);
    const count = RETIRED_NORMALIZE_PAGE_SIZE + 1;
    for (let i = 0; i < count; i++) {
      await insertQuestion(t, { text: `Old question number ${i}?`, prunedAt: 1 });
    }
    await insertQuestion(t, { text: "Live?" });

    const summary = await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: false });

    expect(summary).toEqual({ scanned: count + 1, markedPruned: count, prunedAtCleared: 0, fingerprintsCleared: 0 });
    const statuses = (await allQuestions(t)).map((question) => question.status);
    expect(statuses.filter((status) => status === "pruned")).toHaveLength(count);
    expect(statuses.filter((status) => status === "public")).toHaveLength(1);
  });

  test("a short run logs only its totals", async () => {
    const t = convexTest(schema, modules);
    await insertQuestion(t, { text: "Old?", prunedAt: 1 });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: true });

      const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("normalizeRetiredQuestions"));
      expect(lines).toEqual([
        `normalizeRetiredQuestions (dry run) total: ${JSON.stringify({ scanned: 1, markedPruned: 1, prunedAtCleared: 0, fingerprintsCleared: 0 })}`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  test.each([
    ["before", false],
    ["after", true],
  ])("a review of an older pruned question still undoes %s the cleanup, and restores it pruned", async (_when, normalizeFirst) => {
    const t = convexTest(schema, modules);
    const editor = t.withIdentity(admin);
    const questionId = await insertQuestion(t, { text: "Old wording?", prunedAt: 1, fingerprint: fingerprintText("Old wording?") });
    await editor.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      text: "New wording?",
      reviewReason: "Clarify the wording",
      expectedRevision: 0,
    });
    if (normalizeFirst) await t.action(internal.internal.migrations.normalizeRetiredQuestions, { dryRun: false });

    const [review] = await editor.query(api.admin.pruning.getReviewHistory, { source: "question" });
    await editor.mutation(api.admin.pruning.undoReview, { reviewId: review._id });

    expect(await getQuestion(t, questionId)).toMatchObject({
      text: "Old wording?",
      status: "pruned",
      prunedAt: 1,
      fingerprint: fingerprintText("Old wording?"),
    });
  });
});
