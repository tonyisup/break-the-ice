/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintText } from "./lib/promptArchitecture";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const modules = import.meta.glob("./**/*.ts");
const identity = {
  subject: "editor",
  tokenIdentifier: "https://issuer.test|editor",
  metadata: { isAdmin: "true" },
};
const question = (text = "Which small ritual helps you unwind?") => ({
  text,
  status: "public" as const,
  averageViewDuration: 0,
  totalLikes: 0,
  totalShows: 0,
});
const metrics = {
  totalShows: 100,
  totalLikes: 0,
  averageViewDuration: 500,
  hiddenCount: 0,
};

async function setupGroup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const keep = await ctx.db.insert("questions", question());
    const retire = await ctx.db.insert(
      "questions",
      question("What little ritual helps you unwind?"),
    );
    const unrelated = await ctx.db.insert(
      "questions",
      question("What made you laugh today?"),
    );
    const detectionId = await ctx.db.insert("duplicateDetections", {
      questionIds: [keep, retire],
      reason: "Same answer space",
      confidence: 0.98,
      status: "pending",
    });
    return { keep, retire, unrelated, detectionId };
  });
  const args = {
    detectionId: ids.detectionId,
    keepQuestionId: ids.keep,
    questionIdsToDelete: [ids.retire],
    reason: "Same invitation and answer; retain the clearer wording.",
    expectedRevisions: [ids.keep, ids.retire].map((questionId) => ({
      questionId,
      revision: 0,
    })),
  };
  return { t, admin: t.withIdentity(identity), ids, args };
}

describe("editorial review safeguards", () => {
  test("text and status changes require an explicit reason and matching revision at the boundary", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity(identity);
    const id = await t.run((ctx) => ctx.db.insert("questions", question()));
    for (const changes of [
      { text: "A clearer question?" },
      { status: "pruned" as const },
    ]) {
      await expect(
        admin.mutation(api.admin.questions.updateQuestion, {
          id,
          ...changes,
          reviewReason: "Editorial review",
        }),
      ).rejects.toThrow("expected revision");
      for (const reason of [undefined, "", "   "]) {
        await expect(
          admin.mutation(api.admin.questions.updateQuestion, {
            id,
            ...changes,
            expectedRevision: 0,
            reviewReason: reason,
          }),
        ).rejects.toThrow("review reason");
      }
      await expect(
        admin.mutation(api.admin.questions.updateQuestion, {
          id,
          ...changes,
          expectedRevision: 1,
          reviewReason: "Editorial review",
        }),
      ).rejects.toThrow("changed during review");
    }
    expect(
      await t.run((ctx) => ctx.db.query("questionReviews").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("questionReviewChanges").collect()),
    ).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject(question());
    await admin.mutation(api.admin.questions.updateQuestion, {
      id,
      status: "pruned",
      expectedRevision: 0,
      reviewReason: "Unclear invitation",
    });
    const history = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "question",
    });
    expect(history[0].changes[0].after.status).toBe("pruned");
    await admin.mutation(api.admin.pruning.undoReview, {
      reviewId: history[0]._id,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("public");
  });

  test("review headers remain bounded and individual changes are indexed by review", async () => {
    const { t, admin, ids, args } = await setupGroup();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.keep, { text: "A".repeat(300_000) });
      await ctx.db.patch(ids.retire, { text: "B".repeat(300_000) });
    });
    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, args);
    const [header] = await t.run((ctx) =>
      ctx.db.query("questionReviews").collect(),
    );
    expect(header).not.toHaveProperty("changes");
    expect(JSON.stringify(header).length).toBeLessThan(2000);
    const changes = await t.run((ctx) =>
      ctx.db
        .query("questionReviewChanges")
        .withIndex("by_reviewId", (q) => q.eq("reviewId", header._id))
        .collect(),
    );
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((change) => change.questionId))).toEqual(
      new Set([ids.keep, ids.retire]),
    );
    const [history] = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "duplicates",
    });
    expect(history.changes).toEqual(changes);
    await admin.mutation(api.admin.pruning.undoReview, {
      reviewId: header._id,
    });
    expect((await t.run((ctx) => ctx.db.get(ids.retire)))?.status).toBe(
      "public",
    );
  });

  test("manual flags need no engagement; scans preserve editorial reasons and notes", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity(identity);
    const questionId = await t.run((ctx) =>
      ctx.db.insert("questions", question()),
    );
    const pruningId = await admin.mutation(api.admin.pruning.flagQuestion, {
      questionId,
      reasons: ["awkward_wording", "unclear_answer"],
      notes: "The subject is ambiguous.",
    });
    await t.mutation(internal.admin.pruning.savePruningTargets, {
      targets: [{ questionId, metrics, reason: "Low like rate" }],
    });
    const targets = await admin.query(api.admin.pruning.getPendingTargets, {});
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      _id: pruningId,
      editorialReasons: ["awkward_wording", "unclear_answer"],
      editorialNotes: "The subject is ambiguous.",
      flaggedBy: identity.tokenIdentifier,
      reason: "Low like rate",
    });
    expect(
      await admin.query(api.admin.pruning.getReviewHistory, {
        source: "pruning",
      }),
    ).toEqual([
      expect.objectContaining({
        reviewer: identity.tokenIdentifier,
        outcome: "flag",
      }),
    ]);
  });

  test("edits update fingerprints, remove stale vectors and discard late embedding results", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity(identity);
    const oldText = "What is your thing?";
    const questionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("questions", {
        ...question(oldText),
        fingerprint: fingerprintText(oldText),
      });
      await ctx.db.insert("question_embeddings", {
        questionId: id,
        embedding: [1, 0],
        status: "public",
      });
      return id;
    });
    const text = "What hobby would you like to try?";
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      text,
      reviewReason: "Replace vague wording with one concrete invitation.",
      expectedRevision: 0,
    });
    expect(await t.run((ctx) => ctx.db.get(questionId))).toMatchObject({
      text,
      fingerprint: fingerprintText(text),
      reviewRevision: 1,
    });
    expect(
      await t.run((ctx) => ctx.db.query("question_embeddings").collect()),
    ).toHaveLength(0);
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.some((job) => job.name === "lib/retriever:embedQuestion"),
    ).toBe(true);
    await t.mutation(internal.internal.questions.addEmbedding, {
      questionId,
      embedding: [1, 0],
      expectedText: oldText,
    });
    expect(
      await t.run((ctx) => ctx.db.query("question_embeddings").collect()),
    ).toHaveLength(0);
    await t.mutation(internal.internal.questions.addEmbedding, {
      questionId,
      embedding: [0, 1],
      expectedText: text,
    });
    expect(
      await t.run((ctx) => ctx.db.query("question_embeddings").collect()),
    ).toEqual([expect.objectContaining({ embedding: [0, 1] })]);
    const [review] = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "question",
    });
    await admin.mutation(api.admin.pruning.undoReview, {
      reviewId: review._id,
    });
    expect(await t.run((ctx) => ctx.db.get(questionId))).toMatchObject({
      text: oldText,
      fingerprint: fingerprintText(oldText),
    });
    expect(
      await t.run((ctx) => ctx.db.query("question_embeddings").collect()),
    ).toHaveLength(0);
  });

  test("a small local batch keeps low-engagement good content, prunes unclear content, and can undo", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity(identity);
    const ids = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.insert(
          "questions",
          question("What small act of kindness have you noticed lately?"),
        ),
        ctx.db.insert("questions", {
          ...question("Which thing is more like it than that?"),
          status: undefined,
        }),
      ]),
    );
    await t.mutation(internal.admin.pruning.savePruningTargets, {
      targets: ids.map((questionId) => ({
        questionId,
        reason: "Low engagement",
        metrics,
      })),
    });
    const targets = await admin.query(api.admin.pruning.getPendingTargets, {});
    const keepTarget = targets.find((target) => target.questionId === ids[0])!;
    const pruneTarget = targets.find((target) => target.questionId === ids[1])!;
    await admin.mutation(api.admin.pruning.rejectPruning, {
      pruningId: keepTarget._id,
      expectedRevision: 0,
      reason:
        "Concrete and easy to answer; low engagement alone does not justify removal.",
    });
    await admin.mutation(api.admin.pruning.approvePruning, {
      pruningId: pruneTarget._id,
      expectedRevision: 0,
      reason:
        "The referents are missing, so there is no clear question to answer.",
    });
    expect(
      await admin.query(api.admin.pruning.getPendingTargets, {}),
    ).toHaveLength(0);
    await t.mutation(internal.admin.pruning.savePruningTargets, {
      targets: ids.map((questionId) => ({
        questionId,
        reason: "Low engagement",
        metrics,
      })),
    });
    expect(
      await admin.query(api.admin.pruning.getPendingTargets, {}),
    ).toHaveLength(0);
    const history = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "pruning",
    });
    expect(history.map((review) => review.outcome)).toEqual(["prune", "keep"]);
    const pruneReview = history[0];
    expect(pruneReview.changes[0].before.status).toBeUndefined();
    await admin.mutation(api.admin.pruning.undoReview, {
      reviewId: pruneReview._id,
    });
    const restored = await t.run((ctx) => ctx.db.get(ids[1]));
    expect(restored?.status).toBeUndefined();
    expect(restored?.prunedAt).toBeUndefined();
    expect(
      await admin.query(api.admin.pruning.getPendingTargets, {}),
    ).toHaveLength(1);
  });

  test("stale edits, repeat decisions and undo over newer edits are rejected", async () => {
    const t = convexTest(schema, modules);
    const admin = t.withIdentity(identity);
    const questionId = await t.run((ctx) =>
      ctx.db.insert("questions", question()),
    );
    const pruningId = await admin.mutation(api.admin.pruning.flagQuestion, {
      questionId,
      reasons: ["awkward_wording"],
      notes: "Needs review",
    });
    await admin.mutation(api.admin.pruning.rejectPruning, {
      pruningId,
      expectedRevision: 1,
      reason: "Clear enough as written",
    });
    await expect(
      admin.mutation(api.admin.pruning.approvePruning, {
        pruningId,
        expectedRevision: 1,
        reason: "Changed my mind",
      }),
    ).rejects.toThrow("already rejected");
    const [review] = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "pruning",
    });
    await expect(
      admin.mutation(api.admin.questions.updateQuestion, {
        id: questionId,
        text: "New wording?",
        reviewReason: "Clarify the wording",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("changed during review");
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      text: "New wording?",
      reviewReason: "Clarify the wording",
      expectedRevision: 2,
    });
    await expect(
      admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id }),
    ).rejects.toThrow("newer work");
    expect((await t.run((ctx) => ctx.db.get(questionId)))?.text).toBe(
      "New wording?",
    );
    const reopened = await admin.mutation(api.admin.pruning.flagQuestion, {
      questionId,
      reasons: ["unclear_answer"],
      notes: "Review the new wording.",
    });
    await admin.mutation(api.admin.pruning.rejectPruning, {
      pruningId: reopened,
      expectedRevision: 4,
      reason: "The revised question is clear.",
    });
    await t.mutation(internal.admin.pruning.savePruningTargets, {
      targets: [{ questionId, reason: "Low engagement", metrics }],
    });
    expect(
      await admin.query(api.admin.pruning.getPendingTargets, {}),
    ).toHaveLength(0);
  });

  test("duplicate retirement preserves saved references, history, schedules and public links; undo restores all", async () => {
    const { t, admin, ids, args } = await setupGroup();
    const refs = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "reader@example.test",
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Team",
      });
      const collectionId = await ctx.db.insert("collections", {
        name: "Saved",
        organizationId,
      });
      const saved = await ctx.db.insert("question_collections", {
        collectionId,
        questionId: ids.retire,
      });
      const history = await ctx.db.insert("userQuestions", {
        userId,
        questionId: ids.retire,
        status: "liked",
        updatedAt: 1,
      });
      const scheduleId = await ctx.db.insert("schedules", {
        organizationId,
        weekStart: "2026-09-21",
        weekEnd: "2026-09-27",
        weekStartDay: "monday",
        status: "published",
        createdAt: 1,
        updatedAt: 1,
      });
      const scheduled = await ctx.db.insert("scheduledQuestions", {
        scheduleId,
        questionId: ids.retire,
        dayOfWeek: "monday",
        slotOrder: 1,
        assignedAt: 1,
      });
      const analytics = await ctx.db.insert("analytics", {
        questionId: ids.retire,
        userId,
        event: "liked",
        timestamp: 1,
        viewDuration: 0,
      });
      return { saved, history, scheduled, analytics };
    });
    const pending = await admin.query(
      api.admin.questions.getPendingDuplicateDetections,
      {},
    );
    expect(pending[0].questions).toHaveLength(2);
    expect(pending[0].questions[0].style).toBeNull();
    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, args);
    const completed = await admin.query(
      api.admin.questions.getCompletedDuplicateDetections,
      {},
    );
    expect(completed[0].reviewedBy).toBe(identity.tokenIdentifier);
    expect(completed[0].questions).toHaveLength(2);
    const retired = await t.run((ctx) => ctx.db.get(ids.retire));
    expect(retired).toMatchObject({
      status: "pruned",
      duplicateOf: ids.keep,
      duplicateWasPublic: true,
    });
    for (const id of Object.values(refs))
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        questionId: ids.retire,
      });
    expect(
      await t.query(api.core.questions.getQuestionById, { id: ids.retire }),
    ).toMatchObject({ text: "What little ritual helps you unwind?" });
    expect(
      await t.query(api.core.questions.getQuestionForOgImage, {
        id: ids.retire,
      }),
    ).toMatchObject({ text: "What little ritual helps you unwind?" });
    expect(
      (
        await t.query(internal.admin.pruning.getQuestionsForPruningReview, {})
      ).map((q) => q._id),
    ).not.toContain(ids.retire);
    const [review] = await admin.query(api.admin.pruning.getReviewHistory, {
      source: "duplicates",
    });
    expect(review).toMatchObject({
      reviewer: identity.tokenIdentifier,
      outcome: "duplicates",
      reason: args.reason,
    });
    await admin.mutation(api.admin.pruning.undoReview, {
      reviewId: review._id,
    });
    const restored = await t.run((ctx) => ctx.db.get(ids.retire));
    expect(restored?.status).toBe("public");
    expect(restored?.duplicateOf).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(ids.detectionId)))?.status).toBe(
      "pending",
    );
  });

  test("duplicate mutation validates exact group membership and pending state atomically", async () => {
    const { t, admin, ids, args } = await setupGroup();
    for (const invalid of [
      { ...args, keepQuestionId: ids.unrelated },
      { ...args, questionIdsToDelete: [ids.unrelated] },
      { ...args, questionIdsToDelete: [ids.keep, ids.retire] },
      { ...args, questionIdsToDelete: [ids.retire, ids.retire] },
      { ...args, questionIdsToDelete: [] },
      { ...args, expectedRevisions: [] },
    ])
      await expect(
        admin.mutation(api.admin.questions.deleteDuplicateQuestions, invalid),
      ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(ids.retire)))?.status).toBe(
      "public",
    );
    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, args);
    await expect(
      admin.mutation(api.admin.questions.deleteDuplicateQuestions, args),
    ).rejects.toThrow("no longer pending");
    expect(
      await admin.query(api.admin.pruning.getReviewHistory, {
        source: "duplicates",
      }),
    ).toHaveLength(1);
  });

  test("private duplicate retirement does not publish its links", async () => {
    const { t, admin, ids, args } = await setupGroup();
    await t.run((ctx) => ctx.db.patch(ids.retire, { status: "private" }));
    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, args);
    expect(
      await t.query(api.core.questions.getQuestionById, { id: ids.retire }),
    ).toBeNull();
    expect(
      await t.query(api.core.questions.getQuestionForOgImage, {
        id: ids.retire,
      }),
    ).toBeNull();
  });

  test("all review mutations require admin identity and reasons", async () => {
    const { t, admin, ids, args } = await setupGroup();
    await expect(
      t.mutation(api.admin.pruning.flagQuestion, {
        questionId: ids.keep,
        reasons: ["unclear_answer"],
        notes: "Test",
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t
        .withIdentity({ subject: "reader" })
        .mutation(api.admin.questions.deleteDuplicateQuestions, args),
    ).rejects.toThrow("Not an admin");
    await expect(
      admin.mutation(api.admin.questions.deleteDuplicateQuestions, {
        ...args,
        reason: " ",
      }),
    ).rejects.toThrow("review reason");
    await expect(
      admin.mutation(api.admin.questions.cleanDuplicateQuestions, {}),
    ).rejects.toThrow("disabled");
  });
});
