/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { LIBRARY_RETIRE_MAX_KEPT, LIBRARY_RETIRE_MAX_REPORTED_IDS, LIBRARY_RETIRE_PAGE_SIZE } from "./internal/migrations";
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

/** `count` public library questions, in table order. */
function insertLibrary(t: TestConvex, count: number) {
  return t.run(async (ctx) => {
    const questionIds: Id<"questions">[] = [];
    for (let i = 0; i < count; i++) {
      questionIds.push(await ctx.db.insert("questions", { status: "public", ...counters, text: `Library question number ${i}?` }));
    }
    return questionIds;
  });
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

  test("team, organization and unpublished library questions, and ones older pruning retired, are left alone and can't be kept", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const organizationId = await t.run(async (ctx) => ctx.db.insert("organizations", { name: "Gym" }));
    const leftAlone = {
      teamPrompt: await insertQuestion(t, { kind: "team_prompt", organizationId, text: "What did the team ship this week?" }),
      organizationQuestion: await insertQuestion(t, { organizationId, text: "Which class do you never skip?" }),
      // Written by someone, though the row names no author.
      personalKind: await insertQuestion(t, { kind: "personal", text: "A question of my own?" }),
      // Older pruning set only prunedAt and left the status public.
      legacyPruned: await insertQuestion(t, { text: "Pruned before statuses moved?", prunedAt: 1 }),
      privateLibrary: await insertQuestion(t, { text: "Taken down by an admin?", status: "private" }),
      pruningStatus: await insertQuestion(t, { text: "Set to pruning by an admin?", status: "pruning" }),
      pendingLibrary: await insertQuestion(t, { text: "Moved back to pending by an admin?", status: "pending" }),
    };
    const before = await allQuestions(t);
    const run = (keepQuestionIds: Id<"questions">[], dryRun = false) =>
      t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun });

    for (const [name, notInLibrary] of Object.entries(leftAlone)) {
      await expect(run([keeper, notInLibrary]), name).rejects.toThrow(
        /1 of the 2 questions to keep aren't public library questions on this deployment/,
      );
    }
    const summary = await run([keeper]);

    expect(summary).toEqual({ scanned: 8, publicLibrary: 1, kept: 1, retired: 0, retiredIds: [] });
    expect(await allQuestions(t)).toEqual(before);
  });

  test("a refusal counts every question that isn't in the library and names the first ten", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const gone = await insertLibrary(t, 12);
    await t.run(async (ctx) => {
      for (const questionId of gone) await ctx.db.delete(questionId);
    });
    const before = await allQuestions(t);

    await expect(
      t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper, ...gone], dryRun: false }),
    ).rejects.toThrow(
      `12 of the 13 questions to keep aren't public library questions on this deployment (${gone.slice(0, 10).join(", ")}). Nothing was changed.`,
    );

    expect(await allQuestions(t)).toEqual(before);
  });

  test("more keepers than the limit are refused before anything is read, and a keeper listed twice doesn't count toward it", async () => {
    const t = convexTest(schema, modules);
    const library = await insertLibrary(t, LIBRARY_RETIRE_MAX_KEPT + 1);
    const atTheLimit = library.slice(0, LIBRARY_RETIRE_MAX_KEPT);
    const before = await allQuestions(t);
    const run = (keepQuestionIds: Id<"questions">[], dryRun: boolean) =>
      t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun });

    await expect(run(library, false)).rejects.toThrow(/Pass between 1 and 1000 questions to keep\. Nothing was changed\./);
    expect(await allQuestions(t)).toEqual(before);

    const summary = await run([...atTheLimit, ...atTheLimit.slice(0, 5)], true);

    expect(summary).toEqual({
      scanned: LIBRARY_RETIRE_MAX_KEPT + 1,
      publicLibrary: LIBRARY_RETIRE_MAX_KEPT + 1,
      kept: LIBRARY_RETIRE_MAX_KEPT,
      retired: 1,
      retiredIds: [library[LIBRARY_RETIRE_MAX_KEPT]],
    });
  });

  test("a run that retires more than it can list counts them all and lists the first, in table order", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const count = LIBRARY_RETIRE_MAX_REPORTED_IDS + 5;
    const others = await insertLibrary(t, count);

    const summary = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper], dryRun: false });

    expect(summary).toEqual({
      scanned: count + 1,
      publicLibrary: count + 1,
      kept: 1,
      retired: count,
      retiredIds: others.slice(0, LIBRARY_RETIRE_MAX_REPORTED_IDS),
    });
    // The ones past the end of the list are retired all the same.
    const statuses = new Map((await allQuestions(t)).map((question) => [question._id, question.status]));
    expect(others.filter((questionId) => statuses.get(questionId) !== "pruned")).toEqual([]);
    expect(statuses.get(keeper)).toBe("public");
  });

  test("a dry run queues no embedding work, and a dry run after the real one finds nothing left to retire", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    const queued = () => t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const run = (dryRun: boolean) => t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun });

    // The order the migration's note gives: dry run, real run, dry run.
    const planned = await run(true);
    expect(planned.kept).toBe(keepQuestionIds.length);
    expect(await queued()).toEqual([]);

    const real = await run(false);
    expect(real).toEqual(planned);
    // One search-filter update for each question retired.
    expect((await queued()).map((job) => job.args)).toEqual([[{ questionId: ids.retiredPublic }], [{ questionId: ids.retiredApproved }]]);

    expect(await run(true)).toEqual({ scanned: 8, publicLibrary: 2, kept: 2, retired: 0, retiredIds: [] });
    expect(await queued()).toHaveLength(2);
  });

  test("a retired question leaves the pruning and duplicate queues, and an earlier review of it can no longer be undone", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    const editor = t.withIdentity(admin);
    // A pair waiting in the duplicate queue: a keeper and a question the run will retire.
    await t.run(async (ctx) =>
      ctx.db.insert("duplicateDetections", { questionIds: [ids.keptPublic, ids.retiredPublic], reason: "Same question", confidence: 0.9, status: "pending" }),
    );
    expect(await editor.query(api.admin.questions.getPendingDuplicateDetections, {})).toHaveLength(1);
    const flag = (questionId: Id<"questions">) =>
      editor.mutation(api.admin.pruning.flagQuestion, { questionId, reasons: ["awkward_wording"], notes: "Needs review" });
    // Both will be retired: one still waits in the queue, the other an admin already chose to keep.
    await flag(ids.retiredPublic);
    const decided = await flag(ids.retiredApproved);
    await editor.mutation(api.admin.pruning.rejectPruning, { pruningId: decided, expectedRevision: 1, reason: "Clear enough as written" });
    const [review] = await editor.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    expect(review).toMatchObject({ outcome: "keep", undoable: true });
    const waiting = await editor.query(api.admin.pruning.getPendingTargets, {});
    expect(waiting.map((target) => target.questionId)).toEqual([ids.retiredPublic]);

    await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });

    expect(await editor.query(api.admin.pruning.getPendingTargets, {})).toEqual([]);
    // With only the keeper left of the pair, there is nothing to compare.
    expect(await editor.query(api.admin.questions.getPendingDuplicateDetections, {})).toEqual([]);
    // A decision on the stale queue row is refused too.
    await expect(
      editor.mutation(api.admin.pruning.rejectPruning, { pruningId: waiting[0]._id, expectedRevision: 4, reason: "Keep it after all" }),
    ).rejects.toThrow(/no longer available for review/);
    // Undoing the earlier keep would put the question back as it was before the run.
    await expect(editor.mutation(api.admin.pruning.undoReview, { reviewId: review._id })).rejects.toThrow(/newer work/);
    const stillRetired = await t.run(async (ctx) => ctx.db.get(ids.retiredApproved));
    expect(stillRetired).toMatchObject({ status: "pruned", reviewRevision: 3 });
  });

  test("after the run the feed and the schedule picker offer the keepers, and a retired question's link no longer opens", async () => {
    const { t, ids, keepQuestionIds } = await setupLibrary();
    await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds, dryRun: false });

    const feed = (
      await t.query(internal.internal.questions.getRandomQuestionsInternal, { count: 10, seen: [], hidden: [], hiddenStyles: [], hiddenTones: [] })
    ).map((question) => question._id);
    const picker = (await t.query(api.core.questions.getPublicQuestions, {})).map((question) => question._id);

    for (const listed of [feed, picker]) {
      expect(listed).toContain(ids.keptPublic);
      expect(listed).not.toContain(ids.retiredPublic);
      expect(listed).not.toContain(ids.retiredApproved);
    }
    expect(picker).toEqual(expect.arrayContaining(keepQuestionIds));
    // Left alone means still served: a public question someone wrote stays in the feed.
    expect(feed).toContain(ids.personal);
    expect(await t.query(api.core.questions.getQuestionById, { id: ids.retiredPublic })).toBeNull();
    expect(await t.query(api.core.questions.getQuestionById, { id: ids.keptPublic })).toMatchObject({ _id: ids.keptPublic });
  });

  test("a run that stopped after its first page is finished by running it again, and the first page keeps its own time", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const others = await insertLibrary(t, LIBRARY_RETIRE_PAGE_SIZE + 5);
    // As the run leaves things when it dies between pages: the first page retired, the rest not.
    const firstPage = await t.mutation(internal.internal.migrations.retireLibraryExceptPage, {
      keepQuestionIds: [keeper],
      dryRun: false,
      cursor: null,
      prunedAt: 1,
    });
    expect(firstPage).toMatchObject({ scanned: LIBRARY_RETIRE_PAGE_SIZE, kept: 1, retired: LIBRARY_RETIRE_PAGE_SIZE - 1, isDone: false });

    const summary = await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper], dryRun: false });

    // The second run reports only what it retired itself: the first page's IDs aren't in its record.
    const remaining = others.slice(LIBRARY_RETIRE_PAGE_SIZE - 1);
    expect(summary).toEqual({ scanned: others.length + 1, publicLibrary: remaining.length + 1, kept: 1, retired: remaining.length, retiredIds: remaining });
    const after = new Map((await allQuestions(t)).map((question) => [question._id, question]));
    expect(others.filter((questionId) => after.get(questionId)?.status !== "pruned")).toEqual([]);
    expect(after.get(others[0])).toMatchObject({ prunedAt: 1, reviewRevision: 1 });
    expect(after.get(remaining[0])?.prunedAt).toBeGreaterThan(1);
    expect(after.get(keeper)).toMatchObject({ status: "public" });
  });

  test("a real run logs each page's retired IDs with the run's time, and a dry run logs only its totals", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    const others = await insertLibrary(t, LIBRARY_RETIRE_PAGE_SIZE + 5);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const pageLines = () => log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("retired at prunedAt"));

    await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper], dryRun: true });
    expect(pageLines()).toEqual([]);

    await t.action(internal.internal.migrations.retireLibraryExcept, { keepQuestionIds: [keeper], dryRun: false });

    // Two pages, each naming what it retired: the record a run that stops partway leaves behind.
    const prunedAt = (await t.run((ctx) => ctx.db.get(others[0])))?.prunedAt;
    expect(pageLines()).toEqual([
      `retireLibraryExcept retired at prunedAt ${prunedAt}: ${others.slice(0, LIBRARY_RETIRE_PAGE_SIZE - 1).join(", ")}`,
      `retireLibraryExcept retired at prunedAt ${prunedAt}: ${others.slice(LIBRARY_RETIRE_PAGE_SIZE - 1).join(", ")}`,
    ]);
    log.mockRestore();
  });

  test("a question published while the run is between pages is retired when a later page reaches it", async () => {
    const t = convexTest(schema, modules);
    const keeper = await insertQuestion(t, { text: "The keeper?" });
    await insertLibrary(t, LIBRARY_RETIRE_PAGE_SIZE + 5);
    const page = { keepQuestionIds: [keeper], dryRun: false, prunedAt: 7 };
    const first = await t.mutation(internal.internal.migrations.retireLibraryExceptPage, { ...page, cursor: null });

    const arrival = await insertQuestion(t, { text: "Generated while the run was paging?", isAIGenerated: true });
    const second = await t.mutation(internal.internal.migrations.retireLibraryExceptPage, { ...page, cursor: first.continueCursor });

    // The keep list was drawn before it existed, so the run doesn't know to keep it.
    expect(second.retiredIds).toContain(arrival);
    expect(await t.run((ctx) => ctx.db.get(arrival))).toMatchObject({ status: "pruned", prunedAt: 7 });
  });
});
