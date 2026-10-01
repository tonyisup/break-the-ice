/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { checkEvalCandidates } from "./lib/evalChecks";
import { FINGERPRINT_SCAN_PAGE_SIZE, FINGERPRINT_WRITE_BATCH_SIZE } from "./internal/migrations";
import { fingerprintText } from "./lib/promptArchitecture";

type TestConvex = ReturnType<typeof convexTest>;
type QuestionFields = Partial<Doc<"questions">>;

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

// Curly quotes are written as escapes so an editor can't quietly turn them into straight ones.
const roadTrip = "What's the best snack you've ever had on a road trip?";
const roadTripCurly = "What\u2019s the best snack you\u2019ve ever had on a road trip?";
const smell = "What's a smell that takes you straight back to being a kid?";
const smellCurly = "What\u2019s a smell that takes you straight back to being a kid?";
const bus = "Which seat do you always pick on a bus?";

// Scheduled embedding jobs stay queued instead of running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const taxonomy = await t.run(async (ctx) => ({
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
  const insertGenerated = (...texts: string[]) =>
    t.mutation(internal.internal.generation.insertGeneratedQuestions, {
      ...taxonomy,
      styleSlug: "reflective",
      toneSlug: "warm",
      styleVersion: 1,
      toneVersion: 1,
      candidates: texts.map((text) => ({ text })),
    });
  return { t, insertGenerated, ...taxonomy };
}

function insertQuestion(t: TestConvex, fields: QuestionFields) {
  return t.run(async (ctx) => ctx.db.insert("questions", { status: "public", ...counters, ...fields }));
}

function fingerprintOf(t: TestConvex, questionId: Id<"questions">) {
  return t.run(async (ctx) => (await ctx.db.get(questionId))?.fingerprint ?? null);
}

describe("questions that differ only in quote style are duplicates", () => {
  test("a curly-quoted candidate matches a straight-quoted question, and a straight one in its batch", async () => {
    const { t, insertGenerated } = await setup();
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });

    const result = await insertGenerated(
      roadTripCurly,
      "Which \u201Cguilty pleasure\u201D song would you defend in public?",
      'Which "guilty pleasure" song would you defend in public?',
    );

    expect(result.duplicates).toEqual([
      { text: roadTrip, reason: "duplicate of existing question" },
      { text: 'Which "guilty pleasure" song would you defend in public?', reason: "duplicate within batch" },
    ]);
    expect(result.insertedCount).toBe(1);
  });

  test("a saved AI question keeps straight quotes, so its text and fingerprint agree", async () => {
    const { t, insertGenerated } = await setup();
    const straight = 'Which "guilty pleasure" song would you defend in public?';

    const result = await insertGenerated("Which \u201Cguilty pleasure\u201D song would you defend in public?");

    expect(result.insertedCount).toBe(1);
    const saved = await t.run(async (ctx) => {
      const question = await ctx.db.get(result.insertedQuestionIds[0]);
      return { text: question?.text ?? null, fingerprint: question?.fingerprint ?? null };
    });
    expect(saved).toEqual({ text: straight, fingerprint: fingerprintText(straight) });
  });

  test("a curly-quoted generic candidate is rejected the same way as the straight one", async () => {
    const { insertGenerated } = await setup();

    const result = await insertGenerated("What\u2019s your favorite snack to bring on a long road trip?");

    expect(result.insertedCount).toBe(0);
    expect(result.rejected).toEqual([
      { text: "What's your favorite snack to bring on a long road trip?", reasons: ["too generic"] },
    ]);
  });

  test("a candidate matching two questions that share a fingerprint is a duplicate, not an error", async () => {
    const { t, insertGenerated } = await setup();
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    await insertQuestion(t, { text: roadTripCurly, fingerprint: fingerprintText(roadTripCurly), status: "pruned" });

    const result = await insertGenerated(roadTrip);

    expect(result.duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);
  });

  test("approving an old curly-quoted question that has a straight twin doesn't break generation", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip", status: "pending" });

    // The admin questions page sends the unchanged text along with a status change.
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: curly,
      expectedRevision: 0,
      reviewReason: "Approve",
      text: roadTripCurly,
      status: "public",
    });

    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
    const result = await insertGenerated(roadTrip);
    expect(result.duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);
  });

  test("the eval checks treat quote style the same way as the save step", () => {
    const checks = checkEvalCandidates([roadTripCurly, smellCurly, smell], new Set([fingerprintText(roadTrip)]));

    expect(checks.map(({ text, hadCurlyQuotes, outcome, duplicateOf }) => ({ text, hadCurlyQuotes, outcome, duplicateOf }))).toEqual([
      { text: roadTrip, hadCurlyQuotes: true, outcome: "duplicate", duplicateOf: "library" },
      { text: smell, hadCurlyQuotes: true, outcome: "saved", duplicateOf: null },
      { text: smell, hadCurlyQuotes: false, outcome: "duplicate", duplicateOf: "batch" },
    ]);
  });

  test("an admin-saved curly-quoted copy of a straight question is skipped", async () => {
    const { t, styleId, toneId } = await setup();
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });

    const saved = await admin.mutation(api.core.questions.saveAIQuestion, { text: roadTripCurly, tags: [], styleId, toneId });

    expect(saved).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("questions").collect()).length)).toBe(1);
  });
});

describe("recomputing stored fingerprints", () => {
  // "q_old_*" stand in for fingerprints saved before curly quotes were normalized.
  async function setupLibrary(t: TestConvex) {
    return {
      roadTrip: await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) }),
      // The same question, saved with curly quotes before the fix.
      roadTripCurly: await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" }),
      smellCurly: await insertQuestion(t, { text: smellCurly, fingerprint: "q_old_smell" }),
      bus: await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus) }),
      // Personal questions get no fingerprint now; an older backfill gave some one from custom text.
      personal: await insertQuestion(t, { customText: smellCurly, status: "private" }),
      backfilledPersonal: await insertQuestion(t, { customText: roadTripCurly, status: "private", fingerprint: "q_old_personal" }),
      withoutText: await insertQuestion(t, { fingerprint: "q_old_no_text" }),
    };
  }

  test("a dry run reports what would change and the collisions, and writes nothing", async () => {
    const { t } = await setup();
    const ids = await setupLibrary(t);
    const before = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

    expect(summary).toEqual({
      scanned: 7,
      withoutFingerprint: 1,
      userWritten: 1,
      withoutText: 1,
      changed: 2,
      updated: 2,
      skippedAtWrite: 0,
      collisions: [
        {
          fingerprint: fingerprintText(roadTrip),
          questions: [
            { questionId: ids.roadTrip, status: "public" },
            { questionId: ids.roadTripCurly, status: "public" },
          ],
        },
      ],
    });
    const after = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));
    expect(after).toEqual(before);
  });

  test("a real run fixes every changed library question and leaves user-written ones alone", async () => {
    const { t, insertGenerated } = await setup();
    const ids = await setupLibrary(t);

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ changed: 2, updated: 2, skippedAtWrite: 0 });
    expect(await fingerprintOf(t, ids.smellCurly)).toBe(fingerprintText(smell));
    // Shares the straight twin's fingerprint: the two are duplicates, and generation takes either.
    expect(await fingerprintOf(t, ids.roadTripCurly)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, ids.personal)).toBeNull();
    expect(await fingerprintOf(t, ids.backfilledPersonal)).toBe("q_old_personal");
    expect(await fingerprintOf(t, ids.withoutText)).toBe("q_old_no_text");

    const generated = await insertGenerated(smell, roadTrip);
    expect(generated.duplicates).toEqual([
      { text: smell, reason: "duplicate of existing question" },
      { text: roadTrip, reason: "duplicate of existing question" },
    ]);

    // Nothing left to change; the duplicates stay listed until a copy is retired.
    const again = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(again).toMatchObject({ changed: 0, updated: 0 });
    expect(again.collisions).toHaveLength(1);
  });

  test("two changed questions on different pages that end up alike both get the new fingerprint", async () => {
    const { t } = await setup();
    const first = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_right_quote" });
    for (let i = 0; i < FINGERPRINT_SCAN_PAGE_SIZE; i++) {
      const text = `Filler question number ${i} for paging?`;
      await insertQuestion(t, { text, fingerprint: fingerprintText(text) });
    }
    // A left quote where the right one belongs: a different old fingerprint, the same new one.
    const second = await insertQuestion(t, { text: roadTripCurly.replace("\u2019s", "\u2018s"), fingerprint: "q_old_left_quote" });

    const dryRun = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(dryRun).toMatchObject({ scanned: FINGERPRINT_SCAN_PAGE_SIZE + 2, changed: 2, updated: 2 });
    expect(dryRun.collisions).toEqual([
      {
        fingerprint: fingerprintText(roadTrip),
        questions: [
          { questionId: first, status: "public" },
          { questionId: second, status: "public" },
        ],
      },
    ]);

    await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(await fingerprintOf(t, first)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, second)).toBe(fingerprintText(roadTrip));
  });

  test("a write skips a question whose fingerprint changed after the scan", async () => {
    const { t } = await setup();
    // Text unchanged and nobody holds the new fingerprint: only the stored fingerprint differs.
    const edited = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_set_after_scan" });

    const result = await t.mutation(internal.internal.migrations.writeQuestionFingerprints, {
      updates: [{ questionId: edited, from: "q_old_road_trip", to: fingerprintText(roadTrip) }],
    });

    expect(result).toEqual({ updated: 0, skippedAtWrite: 1 });
    expect(await fingerprintOf(t, edited)).toBe("q_set_after_scan");
  });

  test("a write gives a question a fingerprint its duplicate already holds", async () => {
    const { t } = await setup();
    const straight = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });

    const result = await t.mutation(internal.internal.migrations.writeQuestionFingerprints, {
      updates: [{ questionId: curly, from: "q_old_road_trip", to: fingerprintText(roadTrip) }],
    });

    expect(result).toEqual({ updated: 1, skippedAtWrite: 0 });
    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, straight)).toBe(fingerprintText(roadTrip));
  });

  test("a straight copy generated mid-run doesn't stop the write, and the next run lists the pair", async () => {
    const { t, insertGenerated } = await setup();
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    // The run scans before generation saves anything.
    const scan = await t.query(internal.internal.migrations.scanQuestionFingerprintsPage, { cursor: null });
    expect(scan.rows).toEqual([{ questionId: curly, status: "public", stored: "q_old_road_trip", recomputed: fingerprintText(roadTrip) }]);

    // On its old fingerprint, the curly question doesn't catch the straight copy.
    const generated = await insertGenerated(roadTrip);
    expect(generated.insertedCount).toBe(1);

    const written = await t.mutation(internal.internal.migrations.writeQuestionFingerprints, {
      updates: [{ questionId: curly, from: "q_old_road_trip", to: fingerprintText(roadTrip) }],
    });
    expect(written).toEqual({ updated: 1, skippedAtWrite: 0 });
    expect((await insertGenerated(roadTrip)).duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);

    const rerun = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(rerun).toMatchObject({ changed: 0, updated: 0 });
    expect(rerun.collisions).toEqual([
      {
        fingerprint: fingerprintText(roadTrip),
        questions: [
          { questionId: curly, status: "public" },
          { questionId: generated.insertedQuestionIds[0], status: "public" },
        ],
      },
    ]);
  });

  test("a write skips a question deleted after the scan, or whose text no longer gives the new fingerprint", async () => {
    const { t } = await setup();
    const deleted = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const rewritten = await insertQuestion(t, { text: smellCurly, fingerprint: "q_old_smell" });
    const emptied = await insertQuestion(t, { text: bus, fingerprint: "q_old_bus" });
    // What changed between the scan and the write.
    await t.run(async (ctx) => {
      await ctx.db.delete(deleted);
      await ctx.db.patch(rewritten, { text: "What\u2019s a sound that takes you straight back to being a kid?" });
      await ctx.db.patch(emptied, { text: undefined });
    });

    const result = await t.mutation(internal.internal.migrations.writeQuestionFingerprints, {
      updates: [
        { questionId: deleted, from: "q_old_road_trip", to: fingerprintText(roadTrip) },
        { questionId: rewritten, from: "q_old_smell", to: fingerprintText(smell) },
        { questionId: emptied, from: "q_old_bus", to: fingerprintText(bus) },
      ],
    });

    expect(result).toEqual({ updated: 0, skippedAtWrite: 3 });
    expect(await fingerprintOf(t, rewritten)).toBe("q_old_smell");
    expect(await fingerprintOf(t, emptied)).toBe("q_old_bus");
  });

  test("a fingerprinted user-written question is left alone and not listed", async () => {
    const { t } = await setup();
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const teamPrompt = await insertQuestion(t, {
      customText: roadTripCurly,
      kind: "team_prompt",
      status: "private",
      fingerprint: fingerprintText(roadTrip),
    });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: 2, userWritten: 1, changed: 0, collisions: [] });
    expect(await fingerprintOf(t, teamPrompt)).toBe(fingerprintText(roadTrip));
  });

  test("collisions include unchanged duplicates and questions without text, in any status", async () => {
    const { t } = await setup();
    const busPublic = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus) });
    const busPruned = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus), status: "pruned" });
    const noText = await insertQuestion(t, { fingerprint: fingerprintText(roadTrip), status: "pending" });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toEqual({
      scanned: 4,
      withoutFingerprint: 0,
      userWritten: 0,
      withoutText: 1,
      changed: 1,
      updated: 1,
      skippedAtWrite: 0,
      collisions: [
        {
          fingerprint: fingerprintText(bus),
          questions: [
            { questionId: busPublic, status: "public" },
            { questionId: busPruned, status: "pruned" },
          ],
        },
        {
          fingerprint: fingerprintText(roadTrip),
          questions: [
            { questionId: noText, status: "pending" },
            { questionId: curly, status: "public" },
          ],
        },
      ],
    });
    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
  });

  test("a run with more changes than one write batch fixes them all", async () => {
    const { t } = await setup();
    const count = FINGERPRINT_WRITE_BATCH_SIZE + 1;
    const ids: Array<Id<"questions">> = [];
    for (let i = 0; i < count; i++) {
      ids.push(await insertQuestion(t, { text: `What\u2019s question number ${i} on the list?`, fingerprint: `q_old_${i}` }));
    }

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: count, changed: count, updated: count, skippedAtWrite: 0 });
    expect(await fingerprintOf(t, ids[0])).toBe(fingerprintText("What's question number 0 on the list?"));
    expect(await fingerprintOf(t, ids[count - 1])).toBe(fingerprintText(`What's question number ${count - 1} on the list?`));
  });
});
