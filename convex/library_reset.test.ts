/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { LIBRARY_RETIRE_PAGE_SIZE } from "./internal/migrations";
import { fingerprintText } from "./lib/promptArchitecture";

type TestConvex = ReturnType<typeof convexTest>;

const modules = import.meta.glob("./**/*.ts");
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const admin = { subject: "editor", tokenIdentifier: "https://issuer.test|editor", metadata: { isAdmin: "true" } };

// Scheduled embedding jobs stay queued until a test runs them.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function insertQuestion(t: TestConvex, fields: Partial<Doc<"questions">>) {
  return t.run(async (ctx) => ctx.db.insert("questions", { status: "public", ...counters, ...fields }));
}

async function insertWithEmbedding(t: TestConvex, fields: Partial<Doc<"questions">>) {
  const questionId = await insertQuestion(t, fields);
  await t.run(async (ctx) => ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" }));
  return questionId;
}

function allQuestions(t: TestConvex) {
  return t.run(async (ctx) => ctx.db.query("questions").collect());
}

async function setupLibrary() {
  const t = convexTest(schema, modules);
  const keptPublic = await insertWithEmbedding(t, { text: "Keep me?", fingerprint: fingerprintText("Keep me?") });
  const ids = {
    keptPublic,
    // Questions from before statuses existed are public.
    keptNoStatus: await insertQuestion(t, { text: "Keep me too?", status: undefined }),
    retiredPublic: await insertWithEmbedding(t, { text: "Retire me?", fingerprint: fingerprintText("Retire me?"), reviewRevision: 2 }),
    retiredApproved: await insertQuestion(t, { text: "Retire me too?", status: "approved" }),
    heldForReview: await insertQuestion(t, { text: "New from the generator?", status: "pending", heldForReview: true, isAIGenerated: true }),
    personal: await insertQuestion(t, { authorId: "author-1", text: "My own question?" }),
    alreadyPruned: await insertQuestion(t, { text: "Pruned last month?", status: "pruned", prunedAt: 5 }),
    retiredDuplicate: await insertQuestion(t, { text: "Keep me??", status: "pruned", prunedAt: 6, duplicateOf: keptPublic, duplicateWasPublic: true }),
  };
  return { t, ids, keepQuestionIds: [ids.keptPublic, ids.keptNoStatus] };
}

describe("resetting the library to a list of keepers", () => {
  test("a dry run counts what it would retire and writes nothing", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    const before = await allQuestions(t);

    const summary = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: true });

    expect(summary).toEqual({ scanned: 8, publicLibrary: 4, kept: 2, retired: 2, retiredIds: [ids.retiredPublic, ids.retiredApproved] });
    expect(await allQuestions(t)).toEqual(before);
  });

  test("a real run retires every other public library question and leaves the rest alone", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    const before = new Map((await allQuestions(t)).map((question) => [question._id, question]));

    const summary = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });

    expect(summary).toEqual({ scanned: 8, publicLibrary: 4, kept: 2, retired: 2, retiredIds: [ids.retiredPublic, ids.retiredApproved] });
    const after = new Map((await allQuestions(t)).map((question) => [question._id, question]));
    // Retired, not deleted: the text and fingerprint stay, and the revision moves on.
    const retired = after.get(ids.retiredPublic)!;
    expect(retired).toMatchObject({ status: "pruned", text: "Retire me?", fingerprint: fingerprintText("Retire me?"), reviewRevision: 3 });
    expect(after.get(ids.retiredApproved)).toMatchObject({ status: "pruned", reviewRevision: 1 });
    // One timestamp marks the whole run.
    expect(typeof retired.prunedAt).toBe("number");
    expect(after.get(ids.retiredApproved)!.prunedAt).toBe(retired.prunedAt);
    for (const untouched of [ids.keptPublic, ids.keptNoStatus, ids.heldForReview, ids.personal, ids.alreadyPruned, ids.retiredDuplicate]) {
      expect(after.get(untouched), untouched).toEqual(before.get(untouched));
    }

    // The retired question keeps its embedding, and its search filter follows the new status.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const embeddings = await t.run(async (ctx) => ctx.db.query("question_embeddings").collect());
    expect(embeddings.map((row) => [row.questionId, row.status]).sort()).toEqual(
      [
        [ids.keptPublic, "public"],
        [ids.retiredPublic, "pruned"],
      ].sort(),
    );

    const again = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });
    expect(again).toEqual({ scanned: 8, publicLibrary: 2, kept: 2, retired: 0, retiredIds: [] });
  });

  test("an admin can bring a retired question back on the questions page", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });

    // A page loaded before the run holds the old revision and has to reload.
    const restore = { id: ids.retiredPublic, status: "public" as const, reviewReason: "Bring it back" };
    await expect(t.withIdentity(admin).mutation(api.admin.questions.updateQuestion, { ...restore, expectedRevision: 2 })).rejects.toThrow(
      /Reload before saving/,
    );
    await t.withIdentity(admin).mutation(api.admin.questions.updateQuestion, { ...restore, expectedRevision: 3 });

    const restored = await t.run(async (ctx) => ctx.db.get(ids.retiredPublic));
    expect(restored).toMatchObject({ status: "public", text: "Retire me?" });
    expect(restored?.prunedAt).toBeUndefined();
  });

  test("refuses, changing nothing, unless every question to keep is a public library question here", async () => {
    const { t, ids } = await setupLibrary();
    const before = await allQuestions(t);
    const deleted = await insertQuestion(t, { text: "Gone?" });
    await t.run(async (ctx) => ctx.db.delete(deleted));
    const run = (keepQuestionIds: Id<"questions">[]) =>
      t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });

    // An empty list would retire the whole library.
    await expect(run([])).rejects.toThrow(/Pass between 1 and 1000 questions to keep/);
    for (const notInLibrary of [deleted, ids.alreadyPruned, ids.retiredDuplicate, ids.personal, ids.heldForReview]) {
      await expect(run([ids.keptPublic, notInLibrary]), notInLibrary).rejects.toThrow(
        /1 of the 2 questions to keep aren't public library questions on this deployment/,
      );
    }

    expect(await allQuestions(t)).toEqual(before);
  });

  test("a keeper listed twice counts once, and a library over one page long is reset in full", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const count = LIBRARY_RETIRE_PAGE_SIZE + 5;
    const others: Id<"questions">[] = [];
    for (let i = 0; i < count; i++) others.push(await insertQuestion(t, { text: `Library question number ${i}?` }));

    const summary = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper, keeper], dryRun: false });

    expect(summary).toEqual({ scanned: count + 1, publicLibrary: count + 1, kept: 1, retired: count, retiredIds: others });
    const statuses = (await allQuestions(t)).map((question) => question.status);
    expect(statuses.filter((status) => status === "pruned")).toHaveLength(count);
    expect(statuses.filter((status) => status === "public")).toHaveLength(1);
  });
});
