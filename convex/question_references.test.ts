/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { pickUntilMarked } from "./internal/newsletter";

const ADMIN = { subject: "admin-clerk", tokenIdentifier: "test|admin-clerk", metadata: { isAdmin: "true" } };
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));

type TestConvex = ReturnType<typeof convexTest>;

function insertGroup(
  ctx: MutationCtx,
  members: Id<"questions">[],
  status: "pending" | "approved" | "rejected" = "pending",
) {
  const questionIds = [...members].sort();
  return ctx.db.insert("duplicateDetections", { questionIds, uniqueKey: questionIds.join("_"), reason: "same", confidence: 0.9, status });
}

/** Questions a, c and d stay; b is hard-deleted the way older flows did, leaving references behind. */
async function setupWithDeletedQuestion(t: TestConvex) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
    const [a, b, c, d] = await Promise.all(
      ["Question a?", "Question b?", "Question c?", "Question d?"].map((text) =>
        ctx.db.insert("questions", { text, status: "public", ...counters }),
      ),
    );
    const group = (members: Id<"questions">[], status: "pending" | "approved" = "pending") => insertGroup(ctx, members, status);

    const ids = {
      userId,
      a,
      b,
      c,
      d,
      liveEmbedding: await ctx.db.insert("question_embeddings", { questionId: a, embedding: vector }),
      orphanEmbedding: await ctx.db.insert("question_embeddings", { questionId: b, embedding: vector }),
      liveSeen: await ctx.db.insert("userQuestions", { userId, questionId: a, status: "seen", updatedAt: 0 }),
      ...(await (async () => {
        const organizationId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
        const collectionId = await ctx.db.insert("collections", { name: "Favorites", organizationId });
        return {
          liveCollectionEntry: await ctx.db.insert("question_collections", { questionId: a, collectionId }),
          orphanCollectionEntry: await ctx.db.insert("question_collections", { questionId: b, collectionId }),
        };
      })()),
      orphanSeen: await ctx.db.insert("userQuestions", { userId, questionId: b, status: "sent", updatedAt: 0 }),
      orphanEvent: await ctx.db.insert("analytics", { event: "seen", questionId: b, timestamp: 0, viewDuration: 0 }),
      orphanPendingPrune: await ctx.db.insert("pruning", { questionId: b, status: "pending", reason: "low likes" }),
      orphanApprovedPrune: await ctx.db.insert("pruning", { questionId: b, status: "approved", reason: "low likes" }),
      livePendingPrune: await ctx.db.insert("pruning", { questionId: a, status: "pending", reason: "low likes" }),
      pairWithDeleted: await group([a, b]),
      trioWithDeleted: await group([a, b, c]),
      trioOverlappingPair: await group([c, b, d]),
      existingPair: await group([c, d]),
      approvedWithDeleted: await group([b, c], "approved"),
      livePair: await group([a, d]),
    };
    await ctx.db.delete(b);
    return ids;
  });
}

describe("cleaning up references to deleted questions", () => {
  test("a dry run counts what would go and changes nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    await setupWithDeletedQuestion(t);

    const summary = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: true });

    expect(summary).toEqual([
      // A dry run reports what a real run would remove and update.
      { table: "question_embeddings", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "userQuestions", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "question_collections", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "pruning", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "duplicateDetections", scanned: 5, dangling: 3, removed: 2, updated: 1 },
    ]);
    const counts = await t.run(async (ctx) => ({
      embeddings: (await ctx.db.query("question_embeddings").collect()).length,
      userQuestions: (await ctx.db.query("userQuestions").collect()).length,
      collectionEntries: (await ctx.db.query("question_collections").collect()).length,
      pruning: (await ctx.db.query("pruning").collect()).length,
      detections: (await ctx.db.query("duplicateDetections").collect()).length,
    }));
    expect(counts).toEqual({ embeddings: 2, userQuestions: 2, collectionEntries: 2, pruning: 3, detections: 6 });
  });

  test("a real run removes rows that need a live question and keeps history", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupWithDeletedQuestion(t);

    const summary = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: false });

    expect(summary).toEqual([
      { table: "question_embeddings", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "userQuestions", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "question_collections", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      { table: "pruning", scanned: 2, dangling: 1, removed: 1, updated: 0 },
      // The pair and the trio whose reduced group already exists go; the other trio keeps its live pair.
      { table: "duplicateDetections", scanned: 5, dangling: 3, removed: 2, updated: 1 },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.orphanEmbedding)).toBeNull();
      expect(await ctx.db.get(ids.orphanSeen)).toBeNull();
      expect(await ctx.db.get(ids.orphanPendingPrune)).toBeNull();
      expect(await ctx.db.get(ids.orphanCollectionEntry)).toBeNull();
      expect(await ctx.db.get(ids.liveCollectionEntry)).not.toBeNull();
      expect(await ctx.db.get(ids.pairWithDeleted)).toBeNull();
      expect(await ctx.db.get(ids.trioOverlappingPair)).toBeNull();
      expect(await ctx.db.get(ids.trioWithDeleted)).toMatchObject({
        questionIds: [ids.a, ids.c].sort(),
        uniqueKey: [ids.a, ids.c].sort().join("_"),
        status: "pending",
      });

      // Live rows and history stay.
      for (const id of [ids.liveEmbedding, ids.liveSeen, ids.livePendingPrune, ids.existingPair, ids.livePair]) {
        expect(await ctx.db.get(id)).not.toBeNull();
      }
      expect(await ctx.db.get(ids.orphanEvent)).not.toBeNull();
      expect(await ctx.db.get(ids.orphanApprovedPrune)).not.toBeNull();
      expect(await ctx.db.get(ids.approvedWithDeleted)).not.toBeNull();
    });

    // Running it again finds nothing left to do.
    const again = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: false });
    expect(again.map((row) => row.dangling)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("deleting a question takes its references with it", () => {
  async function setupLive(t: TestConvex) {
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      const target = await ctx.db.insert("questions", {
        customText: "Which song is stuck in your head?",
        authorId: userId,
        status: "private",
        ...counters,
      });
      const other = await ctx.db.insert("questions", { text: "Question other?", status: "public", ...counters });
      await ctx.db.insert("question_embeddings", { questionId: target, embedding: vector });
      await ctx.db.insert("userQuestions", { userId, questionId: target, status: "liked", updatedAt: 0 });
      await ctx.db.insert("analytics", { event: "liked", questionId: target, timestamp: 0, viewDuration: 0 });
      await ctx.db.insert("pruning", { questionId: target, status: "pending", reason: "low likes" });
      await insertGroup(ctx, [target, other]);
      return { userId, target };
    });
  }
  const remaining = (t: TestConvex) =>
    t.run(async (ctx) => ({
      embeddings: (await ctx.db.query("question_embeddings").collect()).length,
      userQuestions: (await ctx.db.query("userQuestions").collect()).length,
      pruning: (await ctx.db.query("pruning").collect()).length,
      detections: (await ctx.db.query("duplicateDetections").collect()).length,
      analytics: (await ctx.db.query("analytics").collect()).length,
    }));

  test("an admin delete", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { target } = await setupLive(t);

    await t.withIdentity(ADMIN).mutation(api.admin.questions.deleteQuestion, { id: target });

    expect(await remaining(t)).toEqual({ embeddings: 0, userQuestions: 0, pruning: 0, detections: 0, analytics: 1 });
  });

  test("a person deleting their own question", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { target } = await setupLive(t);

    await t
      .withIdentity({ subject: "reader-clerk", tokenIdentifier: "test|reader-clerk", email: "reader@example.com" })
      .mutation(api.core.questions.deletePersonalQuestion, { questionId: target });

    expect(await remaining(t)).toEqual({ embeddings: 0, userQuestions: 0, pruning: 0, detections: 0, analytics: 1 });
  });
});

describe("the dangling-reference migration, beyond the basics", () => {
  test("a dry run leaves the groups it would shrink or drop exactly as they were", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupWithDeletedQuestion(t);

    await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: true });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.trioWithDeleted)).toMatchObject({
        questionIds: [ids.a, ids.b, ids.c].sort(),
        uniqueKey: [ids.a, ids.b, ids.c].sort().join("_"),
      });
      expect(await ctx.db.get(ids.pairWithDeleted)).not.toBeNull();
      expect(await ctx.db.get(ids.trioOverlappingPair)).not.toBeNull();
    });
  });

  test("it works through tables that span more than one page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      const live = await ctx.db.insert("questions", { text: "Question live?", status: "public", ...counters });
      const partner = await ctx.db.insert("questions", { text: "Question partner?", status: "public", ...counters });
      const gone = await ctx.db.insert("questions", { text: "Question gone?", status: "public", ...counters });
      // Orphans and live rows alternate, so every page holds both and each page ends on a live row.
      // Keep it that way: convex-test's cursor is the last row's _id, so a page ending on a row the
      // run deletes would stop the test early. Real Convex cursors don't depend on the row.
      for (let i = 0; i < 150; i++) {
        const questionId = i % 2 === 0 ? gone : live;
        const pair = [questionId, partner].sort();
        await ctx.db.insert("userQuestions", { userId, questionId, status: "seen", updatedAt: i });
        await ctx.db.insert("duplicateDetections", {
          questionIds: pair,
          uniqueKey: `${pair.join("_")}_${i}`,
          reason: "same",
          confidence: 0.9,
          status: "pending",
        });
      }
      await ctx.db.delete(gone);
    });

    const dryRun = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: true });
    expect(dryRun.filter((row) => row.table === "userQuestions" || row.table === "duplicateDetections")).toEqual([
      { table: "userQuestions", scanned: 150, dangling: 75, removed: 75, updated: 0 },
      { table: "duplicateDetections", scanned: 150, dangling: 75, removed: 75, updated: 0 },
    ]);

    const realRun = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: false });
    expect(realRun.filter((row) => row.table === "userQuestions" || row.table === "duplicateDetections")).toEqual([
      { table: "userQuestions", scanned: 150, dangling: 75, removed: 75, updated: 0 },
      { table: "duplicateDetections", scanned: 150, dangling: 75, removed: 75, updated: 0 },
    ]);
    const counts = await t.run(async (ctx) => ({
      userQuestions: (await ctx.db.query("userQuestions").collect()).length,
      detections: (await ctx.db.query("duplicateDetections").collect()).length,
    }));
    expect(counts).toEqual({ userQuestions: 75, detections: 75 });
  });

  test("two pending groups that shrink to the same pair collapse into one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await t.run(async (ctx) => {
      const [a, b, c, e] = await Promise.all(
        ["Question a?", "Question b?", "Question c?", "Question e?"].map((text) =>
          ctx.db.insert("questions", { text, status: "public", ...counters }),
        ),
      );
      const first = await insertGroup(ctx, [a, b, c]);
      const second = await insertGroup(ctx, [a, c, e]);
      await ctx.db.delete(b);
      await ctx.db.delete(e);
      return { a, c, first, second };
    });

    const summary = await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: false });

    expect(summary.find((row) => row.table === "duplicateDetections")).toEqual({
      table: "duplicateDetections",
      scanned: 2,
      dangling: 2,
      removed: 1,
      updated: 1,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.first)).toMatchObject({ questionIds: [ids.a, ids.c].sort() });
      expect(await ctx.db.get(ids.second)).toBeNull();
    });
  });
});

describe("deleting a question leaves everything else alone", () => {
  const READER = { subject: "reader-clerk", tokenIdentifier: "test|reader-clerk", email: "reader@example.com" };

  /** `target` is the reader's question; `x`, `y` stay; `gone` was hard-deleted earlier. */
  async function setupNeighbours(t: TestConvex, options: { existingPair?: boolean; kind?: "team_prompt" } = {}) {
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      await ctx.db.insert("users", { email: "someone@example.com", clerkId: "someone-clerk" });
      const organizationId = await ctx.db.insert("organizations", { name: "Team" });
      const collectionId = await ctx.db.insert("collections", { name: "Favourites", organizationId });
      const target = await ctx.db.insert("questions", {
        customText: "Which song is stuck in your head?",
        authorId: userId,
        status: "private",
        kind: options.kind,
        ...counters,
      });
      const [x, y, gone] = await Promise.all(
        ["Question x?", "Question y?", "Question gone?"].map((text) =>
          ctx.db.insert("questions", { text, status: "public", ...counters }),
        ),
      );
      const group = (members: Id<"questions">[], status: "pending" | "approved" = "pending") => insertGroup(ctx, members, status);

      const ids = {
        target,
        x,
        y,
        targetEmbedding: await ctx.db.insert("question_embeddings", { questionId: target, embedding: vector }),
        targetSeen: await ctx.db.insert("userQuestions", { userId, questionId: target, status: "liked", updatedAt: 0 }),
        targetPendingPrune: await ctx.db.insert("pruning", { questionId: target, status: "pending", reason: "low likes" }),
        targetApprovedPrune: await ctx.db.insert("pruning", { questionId: target, status: "approved", reason: "low likes" }),
        targetRejectedPrune: await ctx.db.insert("pruning", { questionId: target, status: "rejected", reason: "low likes" }),
        targetCollectionEntry: await ctx.db.insert("question_collections", { questionId: target, collectionId }),
        otherEmbedding: await ctx.db.insert("question_embeddings", { questionId: x, embedding: vector }),
        otherSeen: await ctx.db.insert("userQuestions", { userId, questionId: x, status: "seen", updatedAt: 0 }),
        otherPendingPrune: await ctx.db.insert("pruning", { questionId: x, status: "pending", reason: "low likes" }),
        otherCollectionEntry: await ctx.db.insert("question_collections", { questionId: x, collectionId }),
        trio: await group([target, x, y]),
        existingPair: options.existingPair ? await group([x, y]) : null,
        withEarlierDeleted: await group([target, x, gone]),
        withoutTarget: await group([x, gone]),
        approvedGroup: await group([target, x], "approved"),
      };
      await ctx.db.delete(gone);
      return ids;
    });
  }

  const allRowIds = (ids: Awaited<ReturnType<typeof setupNeighbours>>) =>
    Object.values(ids).filter((id): id is NonNullable<typeof id> => id !== null);

  test("it removes the question's collection entries and keeps other questions' rows and review history", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t);

    await t.withIdentity(ADMIN).mutation(api.admin.questions.deleteQuestion, { id: ids.target });

    await t.run(async (ctx) => {
      for (const id of [ids.target, ids.targetEmbedding, ids.targetSeen, ids.targetPendingPrune, ids.targetCollectionEntry]) {
        expect(await ctx.db.get(id)).toBeNull();
      }
      for (const id of [
        ids.otherEmbedding,
        ids.otherSeen,
        ids.otherPendingPrune,
        ids.otherCollectionEntry,
        ids.targetApprovedPrune,
        ids.targetRejectedPrune,
        ids.approvedGroup,
      ]) {
        expect(await ctx.db.get(id)).not.toBeNull();
      }
    });
  });

  test("it shrinks a larger pending group, and drops one left with a single live member", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t);

    await t.withIdentity(READER).mutation(api.core.questions.deletePersonalQuestion, { questionId: ids.target });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.trio)).toMatchObject({
        questionIds: [ids.x, ids.y].sort(),
        uniqueKey: [ids.x, ids.y].sort().join("_"),
        status: "pending",
      });
      // `gone` was deleted earlier, so only x is left: the group goes.
      expect(await ctx.db.get(ids.withEarlierDeleted)).toBeNull();
      // A group the question was never in is left for the migration.
      expect(await ctx.db.get(ids.withoutTarget)).not.toBeNull();
    });
  });

  test("it drops a pending group whose remaining pair already has its own row", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t, { existingPair: true });

    await t.withIdentity(ADMIN).mutation(api.admin.questions.deleteQuestion, { id: ids.target });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.trio)).toBeNull();
      expect(await ctx.db.get(ids.existingPair!)).toMatchObject({ questionIds: [ids.x, ids.y].sort() });
    });
  });

  test("a non-admin cannot use the admin delete, and nothing is cleaned up", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t);

    await expect(
      t.withIdentity(READER).mutation(api.admin.questions.deleteQuestion, { id: ids.target }),
    ).rejects.toThrow("Not an admin");

    await t.run(async (ctx) => {
      for (const id of allRowIds(ids)) {
        expect(await ctx.db.get(id)).not.toBeNull();
      }
    });
  });

  test("someone else cannot delete a personal question, and nothing is cleaned up", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t);

    await expect(
      t
        .withIdentity({ subject: "someone-clerk", tokenIdentifier: "test|someone-clerk", email: "someone@example.com" })
        .mutation(api.core.questions.deletePersonalQuestion, { questionId: ids.target }),
    ).rejects.toThrow("not authorized");

    await t.run(async (ctx) => {
      for (const id of allRowIds(ids)) {
        expect(await ctx.db.get(id)).not.toBeNull();
      }
    });
  });

  test("a Team prompt cannot be deleted as a personal question, and nothing is cleaned up", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await setupNeighbours(t, { kind: "team_prompt" });

    await expect(
      t.withIdentity(READER).mutation(api.core.questions.deletePersonalQuestion, { questionId: ids.target }),
    ).rejects.toThrow("schedule-managed Team prompt");

    await t.run(async (ctx) => {
      for (const id of allRowIds(ids)) {
        expect(await ctx.db.get(id)).not.toBeNull();
      }
    });
  });
});

describe("no new dangling references", () => {
  test("a pending group that shrinks onto an already-reviewed pair is dropped, and the review stays", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const ids = await t.run(async (ctx) => {
      const [a, b, c] = await Promise.all(
        ["Question a?", "Question b?", "Question c?"].map((text) => ctx.db.insert("questions", { text, status: "public", ...counters })),
      );
      const pending = await insertGroup(ctx, [a, b, c]);
      const rejected = await insertGroup(ctx, [a, c], "rejected");
      await ctx.db.delete(b);
      return { pending, rejected };
    });

    await t.action(internal.internal.migrations.cleanDanglingQuestionReferences, { dryRun: false });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.pending)).toBeNull();
      expect(await ctx.db.get(ids.rejected)).toMatchObject({ status: "rejected" });
    });
  });

  test("duplicate detection doesn't save a group with a member deleted meanwhile", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { a, b, c } = await t.run(async (ctx) => {
      const [a, b, c] = await Promise.all(
        ["Question a?", "Question b?", "Question c?"].map((text) => ctx.db.insert("questions", { text, status: "public", ...counters })),
      );
      await ctx.db.delete(b);
      return { a, b, c };
    });

    expect(await t.mutation(internal.internal.questions.saveDuplicateDetection, { questionIds: [a, b], reason: "same", confidence: 0.9 })).toBeNull();
    const kept = await t.mutation(internal.internal.questions.saveDuplicateDetection, { questionIds: [a, b, c], reason: "same", confidence: 0.9 });
    expect(await t.run(async (ctx) => ctx.db.get(kept!))).toMatchObject({ questionIds: [a, c].sort() });
  });

  test("marking a deleted question as emailed leaves no row behind", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { userId, questionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      const questionId = await ctx.db.insert("questions", { text: "Question gone?", status: "public", ...counters });
      await ctx.db.delete(questionId);
      return { userId, questionId };
    });

    expect(await t.mutation(internal.internal.questions.markUserQuestionAsSent, { userId, questionId })).toBe(false);

    expect(await t.run(async (ctx) => ctx.db.query("userQuestions").collect())).toEqual([]);
  });

  test("a group that shrinks onto a pair an admin already rejected isn't saved again", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { a, b, c } = await t.run(async (ctx) => {
      const [a, b, c] = await Promise.all(
        ["Question a?", "Question b?", "Question c?"].map((text) => ctx.db.insert("questions", { text, status: "public", ...counters })),
      );
      await insertGroup(ctx, [a, c], "rejected");
      await ctx.db.delete(b);
      return { a, b, c };
    });

    expect(await t.mutation(internal.internal.questions.saveDuplicateDetection, { questionIds: [a, b, c], reason: "same", confidence: 0.9 })).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("duplicateDetections").collect()).map((row) => row.status))).toEqual(["rejected"]);
  });

  test("pool assignment skips a question deleted since the pool was read", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const { userId, live, gone } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      const live = await ctx.db.insert("questions", { text: "Question live?", status: "public", ...counters });
      const gone = await ctx.db.insert("questions", { text: "Question gone?", status: "public", ...counters });
      await ctx.db.delete(gone);
      return { userId, live, gone };
    });

    expect(await t.mutation(internal.internal.questions.assignPoolQuestionsToUser, { userId, questionIds: [live, gone] })).toBe(1);
    await t.mutation(internal.internal.questions.markPoolQuestionsDistributed, { questionIds: [live, gone] });

    await t.run(async (ctx) => {
      expect((await ctx.db.query("userQuestions").collect()).map((row) => row.questionId)).toEqual([live]);
      expect(await ctx.db.get(live)).toMatchObject({ poolStatus: "distributed" });
    });
  });
});

describe("picking the daily email's question", () => {
  test("a pick deleted before it is marked is replaced by the next pick", async () => {
    const picks = ["deleted", "live"];
    const marked: string[] = [];
    const question = await pickUntilMarked(
      async () => picks.shift() ?? null,
      async (picked) => {
        marked.push(picked);
        return picked === "live";
      },
      3,
    );
    expect(question).toBe("live");
    expect(marked).toEqual(["deleted", "live"]);
  });

  test("it gives up after the allowed attempts", async () => {
    let calls = 0;
    await expect(
      pickUntilMarked(
        async () => `pick-${++calls}`,
        async () => false,
        3,
      ),
    ).rejects.toThrow(/deleted before it went out/);
    expect(calls).toBe(3);
  });

  test("nothing to pick fails straight away", async () => {
    const mark = vi.fn(async () => true);
    await expect(pickUntilMarked(async () => null, mark, 3)).rejects.toThrow(/Could not find or generate a question/);
    expect(mark).not.toHaveBeenCalled();
  });
});

