/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { checkEvalCandidates } from "./lib/evalChecks";
import {
  FINGERPRINT_MAX_REPORTED_COLLISIONS,
  FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS,
  FINGERPRINT_RECOMPUTE_PAGE_SIZE,
  PRIVATE_FINGERPRINT_CLEAR_PAGE_SIZE,
  PROMPT_BACKFILL_BATCH_SIZE,
} from "./internal/migrations";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "./lib/promptArchitecture";

type TestConvex = ReturnType<typeof convexTest>;
type QuestionFields = Partial<Doc<"questions">>;

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };

// Curly quotes are written as escapes so an editor can't quietly turn them into straight ones.
const roadTrip = "What's the best snack you've ever had on a road trip?";
const roadTripCurly = "What\u2019s the best snack you\u2019ve ever had on a road trip?";
const smell = "What's a smell that takes you straight back to being a kid?";
const smellCurly = "What\u2019s a smell that takes you straight back to being a kid?";
const bus = "Which seat do you always pick on a bus?";
const busCurly = "Which seat do you \u201Calways\u201D pick on a bus?";

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
      // Personal questions get no fingerprint when created; an older backfill gave some one.
      personal: await insertQuestion(t, { authorId: "author-1", customText: smellCurly, status: "private" }),
      backfilledPersonal: await insertQuestion(t, {
        authorId: "author-1",
        customText: roadTripCurly,
        status: "private",
        fingerprint: "q_old_personal",
      }),
      withoutText: await insertQuestion(t, { fingerprint: "q_old_no_text" }),
      withoutFingerprint: await insertQuestion(t, { text: "Which song would you queue first on a long drive?" }),
    };
  }

  test("a dry run reports what would change and the collisions, and writes nothing", async () => {
    const { t } = await setup();
    const ids = await setupLibrary(t);
    const before = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

    expect(summary).toEqual({
      scanned: 8,
      privateUserQuestions: 2,
      withoutFingerprint: 1,
      withoutText: 1,
      changed: 2,
      collisionGroups: 1,
      collisions: [
        {
          fingerprint: fingerprintText(roadTrip),
          size: 2,
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

  test("a real run fixes every changed library question and leaves the rest alone", async () => {
    const { t, insertGenerated } = await setup();
    const ids = await setupLibrary(t);

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ changed: 2 });
    expect(await fingerprintOf(t, ids.smellCurly)).toBe(fingerprintText(smell));
    // Shares the straight twin's fingerprint: the two are duplicates, and generation takes either.
    expect(await fingerprintOf(t, ids.roadTripCurly)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, ids.personal)).toBeNull();
    expect(await fingerprintOf(t, ids.backfilledPersonal)).toBe("q_old_personal");
    expect(await fingerprintOf(t, ids.withoutText)).toBe("q_old_no_text");
    expect(await fingerprintOf(t, ids.withoutFingerprint)).toBeNull();

    const generated = await insertGenerated(smell, roadTrip);
    expect(generated.duplicates).toEqual([
      { text: smell, reason: "duplicate of existing question" },
      { text: roadTrip, reason: "duplicate of existing question" },
    ]);

    // Nothing left to change; the duplicates stay listed until a copy is retired.
    const again = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(again).toMatchObject({ changed: 0 });
    expect(again.collisions).toHaveLength(1);

    await t.run(async (ctx) => ctx.db.patch(ids.roadTripCurly, { status: "pruned", duplicateOf: ids.roadTrip }));
    const retired = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(retired).toMatchObject({ changed: 0, collisions: [] });
  });

  test("a straight copy generated before the run is listed with the curly question it duplicates", async () => {
    const { t, insertGenerated } = await setup();
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    // Until the run, the curly question's old fingerprint doesn't catch a straight copy.
    const generated = await insertGenerated(roadTrip);
    expect(generated.insertedCount).toBe(1);

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ changed: 1 });
    expect(summary.collisions).toEqual([
      {
        fingerprint: fingerprintText(roadTrip),
        size: 2,
        questions: [
          { questionId: curly, status: "public" },
          { questionId: generated.insertedQuestionIds[0], status: "public" },
        ],
      },
    ]);
    expect((await insertGenerated(roadTrip)).duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);
  });

  test("two changed questions on different pages that end up alike both get the new fingerprint", async () => {
    const { t } = await setup();
    const first = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_right_quote" });
    for (let i = 0; i < FINGERPRINT_RECOMPUTE_PAGE_SIZE; i++) {
      const text = `Filler question number ${i} for paging?`;
      await insertQuestion(t, { text, fingerprint: fingerprintText(text) });
    }
    // A left quote where the right one belongs: a different old fingerprint, the same new one.
    const second = await insertQuestion(t, { text: roadTripCurly.replace("\u2019s", "\u2018s"), fingerprint: "q_old_left_quote" });

    const dryRun = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(dryRun).toMatchObject({ scanned: FINGERPRINT_RECOMPUTE_PAGE_SIZE + 2, changed: 2 });
    expect(dryRun.collisions).toEqual([
      {
        fingerprint: fingerprintText(roadTrip),
        size: 2,
        questions: [
          { questionId: first, status: "public" },
          { questionId: second, status: "public" },
        ],
      },
    ]);
    expect(await fingerprintOf(t, second)).toBe("q_old_left_quote");

    await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(await fingerprintOf(t, first)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, second)).toBe(fingerprintText(roadTrip));
  });

  test("private personal, team and organization questions stay alone; an approved submission is recomputed", async () => {
    const { t } = await setup();
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    // Reviewing a submission copies its custom text into text (the admin page sends q.text || q.customText).
    const keptPrivate = await insertQuestion(t, {
      authorId: "author-1",
      customText: roadTripCurly,
      text: roadTripCurly,
      status: "private",
      fingerprint: "q_old_kept_private",
    });
    const approved = await insertQuestion(t, {
      authorId: "author-2",
      customText: smellCurly,
      text: smellCurly,
      status: "public",
      fingerprint: "q_old_approved",
    });
    const teamPrompt = await insertQuestion(t, {
      customText: roadTripCurly,
      kind: "team_prompt",
      status: "private",
      fingerprint: fingerprintText(roadTrip),
    });
    const organizationId = await t.run(async (ctx) =>
      ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
    );
    const orgQuestion = await insertQuestion(t, { organizationId, text: roadTripCurly, status: "private", fingerprint: "q_old_org" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: 5, privateUserQuestions: 3, changed: 1, collisions: [] });
    expect(await fingerprintOf(t, keptPrivate)).toBe("q_old_kept_private");
    expect(await fingerprintOf(t, approved)).toBe(fingerprintText(smell));
    expect(await fingerprintOf(t, teamPrompt)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, orgQuestion)).toBe("q_old_org");
  });

  test("collisions list public duplicates, unchanged ones and ones without text included, but not retired, private or held copies", async () => {
    const { t } = await setup();
    const busPublic = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus) });
    const busApproved = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus), status: "approved" });
    await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus), status: "pruned" });
    // A rejected AI copy and one held for review are recomputed, so they keep blocking regeneration,
    // but aren't clean-up targets; nor is an older row retired by prunedAt alone.
    const rejected = await insertQuestion(t, { text: busCurly, fingerprint: "q_old_rejected", status: "private", isAIGenerated: true });
    const held = await insertQuestion(t, {
      text: roadTripCurly,
      fingerprint: "q_old_held",
      status: "pending",
      heldForReview: true,
      isAIGenerated: true,
    });
    await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus), prunedAt: 1 });
    const noText = await insertQuestion(t, { fingerprint: fingerprintText(roadTrip) });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toEqual({
      scanned: 8,
      privateUserQuestions: 0,
      withoutFingerprint: 0,
      withoutText: 1,
      changed: 3,
      collisionGroups: 2,
      collisions: [
        {
          fingerprint: fingerprintText(bus),
          size: 2,
          questions: [
            { questionId: busPublic, status: "public" },
            { questionId: busApproved, status: "approved" },
          ],
        },
        {
          fingerprint: fingerprintText(roadTrip),
          size: 2,
          questions: [
            { questionId: noText, status: "public" },
            { questionId: curly, status: "public" },
          ],
        },
      ],
    });
    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, rejected)).toBe(fingerprintText(bus));
    expect(await fingerprintOf(t, held)).toBe(fingerprintText(roadTrip));
  });

  test("a run with changes on more than one page fixes them all", async () => {
    const { t } = await setup();
    const count = FINGERPRINT_RECOMPUTE_PAGE_SIZE + 1;
    const ids: Array<Id<"questions">> = [];
    for (let i = 0; i < count; i++) {
      ids.push(await insertQuestion(t, { text: `What\u2019s question number ${i} on the list?`, fingerprint: `q_old_${i}` }));
    }

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: count, changed: count });
    expect(await fingerprintOf(t, ids[0])).toBe(fingerprintText("What's question number 0 on the list?"));
    expect(await fingerprintOf(t, ids[count - 1])).toBe(fingerprintText(`What's question number ${count - 1} on the list?`));
  });

  test("a public organization question is recomputed and listed with its organization", async () => {
    const { t } = await setup();
    const global = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const organizationId = await t.run(async (ctx) =>
      ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
    );
    const orgCopy = await insertQuestion(t, { organizationId, text: roadTripCurly, status: "public", fingerprint: "q_old_org" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ privateUserQuestions: 0, changed: 1 });
    // The duplicates page won't merge across organizations, so the report says which side each is on.
    expect(summary.collisions).toEqual([
      {
        fingerprint: fingerprintText(roadTrip),
        size: 2,
        questions: [
          { questionId: global, status: "public" },
          { questionId: orgCopy, status: "public", organizationId },
        ],
      },
    ]);
  });

  test("a submission that is approved, has no status, or keeps its wording only in custom text is recomputed", async () => {
    const { t } = await setup();
    const approved = await insertQuestion(t, {
      authorId: "author-1",
      customText: smellCurly,
      text: smellCurly,
      status: "approved",
      fingerprint: "q_old_approved",
    });
    // An older row with no status: isQuestionPublic treats it as public.
    const noStatus = await insertQuestion(t, {
      authorId: "author-2",
      customText: roadTripCurly,
      text: roadTripCurly,
      status: undefined,
      fingerprint: "q_old_no_status",
    });
    // Approved without a text change, so the wording stayed in customText.
    const customOnly = await insertQuestion(t, { authorId: "author-3", customText: busCurly, fingerprint: "q_old_custom_only" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: 3, privateUserQuestions: 0, withoutText: 0, changed: 3, collisions: [] });
    expect(await fingerprintOf(t, approved)).toBe(fingerprintText(smell));
    expect(await fingerprintOf(t, noStatus)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, customOnly)).toBe(fingerprintText(bus));
  });

  test("a submission an admin reworded before approving keeps the fingerprint of its new wording", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    const reworded = roadTrip.replace(" ever", "");
    const submission = await insertQuestion(t, { authorId: "author-1", customText: roadTripCurly, status: "pending" });
    // Approving with an edit saves the new wording in text; customText keeps what was submitted.
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: submission,
      expectedRevision: 0,
      reviewReason: "Approve with tighter wording",
      text: reworded,
      status: "public",
    });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ privateUserQuestions: 0, changed: 0 });
    expect(await fingerprintOf(t, submission)).toBe(fingerprintText(reworded));
    const generated = await insertGenerated(reworded, roadTrip);
    expect(generated.duplicates).toEqual([{ text: reworded, reason: "duplicate of existing question" }]);
    expect(generated.insertedCount).toBe(1);
  });

  test("a pending submission stays alone; a retired copy of a public submission is recomputed but not listed", async () => {
    const { t } = await setup();
    const kept = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const pending = await insertQuestion(t, {
      authorId: "author-1",
      customText: smellCurly,
      text: smellCurly,
      status: "pending",
      fingerprint: "q_old_pending",
    });
    // What the admin duplicates page writes when it retires a copy.
    const retiredPublic = await insertQuestion(t, {
      authorId: "author-2",
      customText: roadTripCurly,
      text: roadTripCurly,
      status: "pruned",
      duplicateOf: kept,
      duplicateWasPublic: true,
      fingerprint: "q_old_retired_public",
    });
    const retiredPrivate = await insertQuestion(t, {
      authorId: "author-3",
      customText: roadTripCurly,
      text: roadTripCurly,
      status: "pruned",
      duplicateOf: kept,
      duplicateWasPublic: false,
      fingerprint: "q_old_retired_private",
    });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ scanned: 4, privateUserQuestions: 2, changed: 1, collisions: [] });
    expect(await fingerprintOf(t, pending)).toBe("q_old_pending");
    expect(await fingerprintOf(t, retiredPublic)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, retiredPrivate)).toBe("q_old_retired_private");
  });

  test("a question pruned before the run is recomputed, so generation still skips a straight copy of it", async () => {
    const { t, insertGenerated } = await setup();
    const pruned = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip", status: "pruned" });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ changed: 1, collisions: [] });
    expect(await fingerprintOf(t, pruned)).toBe(fingerprintText(roadTrip));
    expect((await insertGenerated(roadTrip)).duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);
  });

  test("older library questions with no status are recomputed and listed without one", async () => {
    const { t } = await setup();
    const straight = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip), status: undefined });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip", status: undefined });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ privateUserQuestions: 0, changed: 1 });
    expect(summary.collisions).toEqual([
      { fingerprint: fingerprintText(roadTrip), size: 2, questions: [{ questionId: straight }, { questionId: curly }] },
    ]);
  });

  test("a short run logs only its totals", async () => {
    const { t } = await setup();
    await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

      const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("recomputeQuestionFingerprints"));
      expect(lines).toEqual([
        `recomputeQuestionFingerprints (dry run) total: ${JSON.stringify({
          scanned: 1,
          privateUserQuestions: 0,
          withoutFingerprint: 0,
          withoutText: 0,
          changed: 1,
          collisionGroups: 0,
        })}`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  test("a long run logs its running totals every 50 pages, then its totals", async () => {
    const { t } = await setup();
    // 50 full pages of questions without a fingerprint, then a curly question on the next page.
    const filler = FINGERPRINT_RECOMPUTE_PAGE_SIZE * 50;
    await t.run(async (ctx) => {
      for (let i = 0; i < filler; i++) {
        await ctx.db.insert("questions", { text: `Filler question number ${i} for paging?`, status: "public", ...counters });
      }
    });
    await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

      const counts = (scanned: number, changed: number) => ({
        scanned,
        privateUserQuestions: 0,
        withoutFingerprint: filler,
        withoutText: 0,
        changed,
      });
      const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("recomputeQuestionFingerprints"));
      expect(lines).toEqual([
        `recomputeQuestionFingerprints progress: ${JSON.stringify(counts(filler, 0))}`,
        `recomputeQuestionFingerprints total: ${JSON.stringify({ ...counts(filler + 1, 1), collisionGroups: 0 })}`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  test("undoing an admin text edit made before the run brings back the old fingerprint, and another run fixes it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: curly,
      expectedRevision: 0,
      reviewReason: "Tighten wording",
      text: roadTripCurly.replace(" ever", ""),
    });
    expect(await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false })).toMatchObject({ changed: 0 });

    const reviewId = await t.run(async (ctx) => (await ctx.db.query("questionReviews").first())!._id);
    await admin.mutation(api.admin.pruning.undoReview, { reviewId });
    expect(await fingerprintOf(t, curly)).toBe("q_old_road_trip");

    const rerun = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(rerun).toMatchObject({ changed: 1 });
    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
  });

  test("undoing a duplicate resolution made before the run is refused, since the run changed the retired copy", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    const straight = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const detectionId = await t.run(async (ctx) =>
      ctx.db.insert("duplicateDetections", { questionIds: [straight, curly], reason: "Same text", confidence: 1, status: "pending" }),
    );
    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, {
      detectionId,
      questionIdsToDelete: [curly],
      keepQuestionId: straight,
      reason: "Same question in curly quotes",
      expectedRevisions: [
        { questionId: straight, revision: 0 },
        { questionId: curly, revision: 0 },
      ],
    });
    expect(await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false })).toMatchObject({
      changed: 1,
      collisions: [],
    });

    const reviewId = await t.run(async (ctx) => (await ctx.db.query("questionReviews").first())!._id);
    await expect(admin.mutation(api.admin.pruning.undoReview, { reviewId })).rejects.toThrow("newer work");
    const retired = await t.run(async (ctx) => {
      const question = await ctx.db.get(curly);
      return { status: question?.status ?? null, fingerprint: question?.fingerprint ?? null };
    });
    expect(retired).toEqual({ status: "pruned", fingerprint: fingerprintText(roadTrip) });
  });

  test("retiring a copy on the admin duplicates page clears its collision", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    const straight = await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const ran = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(ran.collisions).toHaveLength(1);
    const detectionId = await t.run(async (ctx) =>
      ctx.db.insert("duplicateDetections", { questionIds: [straight, curly], reason: "Same text", confidence: 1, status: "pending" }),
    );

    await admin.mutation(api.admin.questions.deleteDuplicateQuestions, {
      detectionId,
      questionIdsToDelete: [curly],
      keepQuestionId: straight,
      reason: "Same question in curly quotes",
      expectedRevisions: [
        { questionId: straight, revision: 0 },
        { questionId: curly, revision: 0 },
      ],
    });

    const after = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(after).toMatchObject({ changed: 0, collisions: [] });
  });

  test("a report with more collisions than it can list counts them all and lists the first ones", async () => {
    const { t } = await setup();
    const groups = FINGERPRINT_MAX_REPORTED_COLLISIONS + 1;
    await t.run(async (ctx) => {
      for (let i = 0; i < groups; i++) {
        const text = `Duplicate question number ${i} on the list?`;
        for (let copy = 0; copy < 2; copy++) {
          await ctx.db.insert("questions", { text, fingerprint: fingerprintText(text), status: "public", ...counters });
        }
      }
    });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

    expect(summary.collisionGroups).toBe(groups);
    expect(summary.collisions).toHaveLength(FINGERPRINT_MAX_REPORTED_COLLISIONS);
    expect(summary.collisions[0].fingerprint).toBe(fingerprintText("Duplicate question number 0 on the list?"));
  });

  test("a group with more questions than it can list gives its size and lists the first ones", async () => {
    const { t } = await setup();
    const copies = FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS + 1;
    const ids = await t.run(async (ctx) => {
      const ids: Array<Id<"questions">> = [];
      for (let i = 0; i < copies; i++) {
        ids.push(await ctx.db.insert("questions", { text: bus, fingerprint: fingerprintText(bus), status: "public", ...counters }));
      }
      return ids;
    });

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

    expect(summary.collisionGroups).toBe(1);
    expect(summary.collisions[0].size).toBe(copies);
    expect(summary.collisions[0].questions.map(({ questionId }) => questionId)).toEqual(
      ids.slice(0, FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS),
    );
  });
});

describe("private questions keep no fingerprint", () => {
  const editor = { subject: "editor", tokenIdentifier: "https://issuer.test|editor", metadata: { isAdmin: "true" } };

  async function setupOrganization(t: TestConvex) {
    return t.run(async (ctx) => ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }));
  }

  test("Mark Personal on a submission leaves it without a fingerprint", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);
    const submission = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "pending", fingerprint: fingerprintText(smell) });

    // What the questions page sends for Mark Personal.
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: submission,
      expectedRevision: 0,
      reviewReason: "Mark personal",
      text: smell,
      status: "private",
    });

    expect(await fingerprintOf(t, submission)).toBeNull();
    expect((await insertGenerated(smell)).insertedCount).toBe(1);
  });

  test("Approve public fingerprints a submission from its text or, with no text sent, its custom text", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);
    const withText = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "pending" });
    const statusOnly = await insertQuestion(t, { authorId: "author-2", customText: bus, status: "private" });

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: withText,
      expectedRevision: 0,
      reviewReason: "Approve",
      text: smell,
      status: "public",
    });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: statusOnly,
      expectedRevision: 0,
      reviewReason: "Approve",
      status: "approved",
    });

    expect(await fingerprintOf(t, withText)).toBe(fingerprintText(smell));
    expect(await fingerprintOf(t, statusOnly)).toBe(fingerprintText(bus));
    expect((await insertGenerated(smell, bus)).duplicates).toEqual([
      { text: smell, reason: "duplicate of existing question" },
      { text: bus, reason: "duplicate of existing question" },
    ]);
  });

  test("a public submission made private loses its fingerprint, and undo brings it back", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);
    const approved = await insertQuestion(t, { authorId: "author-1", customText: smell, text: smell, status: "public", fingerprint: fingerprintText(smell) });

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: approved,
      expectedRevision: 0,
      reviewReason: "Back to the queue",
      status: "pending",
    });

    expect(await fingerprintOf(t, approved)).toBeNull();
    expect((await insertGenerated(smell)).insertedCount).toBe(1);

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "question" });
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id });
    expect(await t.run(async (ctx) => ctx.db.get(approved))).toMatchObject({ status: "public", fingerprint: fingerprintText(smell) });
  });

  test("editing a private team prompt or organization question doesn't fingerprint it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const organizationId = await setupOrganization(t);
    const teamPrompt = await insertQuestion(t, { organizationId, authorId: "author-1", customText: smell, kind: "team_prompt", status: "private" });
    const orgQuestion = await insertQuestion(t, { organizationId, customText: bus, status: "private", fingerprint: fingerprintText(bus) });

    await admin.mutation(api.admin.questions.updateQuestion, { id: teamPrompt, expectedRevision: 0, reviewReason: "Tidy", text: smell });
    await admin.mutation(api.admin.questions.updateQuestion, { id: orgQuestion, reviewReason: "Retag", tags: ["travel"] });

    expect(await fingerprintOf(t, teamPrompt)).toBeNull();
    expect(await fingerprintOf(t, orgQuestion)).toBeNull();
  });

  test("a library question keeps its fingerprint whatever its status, and an edit recomputes it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const library = await insertQuestion(t, { text: smell, fingerprint: fingerprintText(smell) });

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: library,
      expectedRevision: 0,
      reviewReason: "Hide it",
      text: smell,
      status: "private",
    });
    expect(await fingerprintOf(t, library)).toBe(fingerprintText(smell));

    await admin.mutation(api.admin.questions.updateQuestion, { id: library, expectedRevision: 1, reviewReason: "Reword", text: bus });
    expect(await fingerprintOf(t, library)).toBe(fingerprintText(bus));
  });

  test("pruning a public submission clears its fingerprint; pruning a library question keeps it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const submission = await insertQuestion(t, { authorId: "author-1", customText: smell, text: smell, status: "public", fingerprint: fingerprintText(smell) });
    const library = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus) });
    const [submissionReview, libraryReview] = await t.run(async (ctx) => [
      await ctx.db.insert("pruning", { questionId: submission, status: "pending", reason: "Low engagement" }),
      await ctx.db.insert("pruning", { questionId: library, status: "pending", reason: "Low engagement" }),
    ]);

    await admin.mutation(api.admin.pruning.approvePruning, { pruningId: submissionReview, reason: "Prune", expectedRevision: 0 });
    await admin.mutation(api.admin.pruning.approvePruning, { pruningId: libraryReview, reason: "Prune", expectedRevision: 0 });

    expect(await fingerprintOf(t, submission)).toBeNull();
    // A pruned library question still stops generation from making it again.
    expect(await fingerprintOf(t, library)).toBe(fingerprintText(bus));
  });

  test("undoing a review doesn't bring back a fingerprint a private question had before it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const personal = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "pending", fingerprint: "q_old_personal" });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: personal,
      expectedRevision: 0,
      reviewReason: "Mark personal",
      text: smell,
      status: "private",
    });

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "question" });
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id });

    const restored = await t.run(async (ctx) => ctx.db.get(personal));
    expect(restored).toMatchObject({ status: "pending", reviewRevision: 2 });
    expect(restored?.text).toBeUndefined();
    expect(restored?.fingerprint).toBeUndefined();
  });

  test("an author editing their approved question sends it back without a fingerprint", async () => {
    const { t } = await setup();
    const identity = { subject: "author", tokenIdentifier: "https://issuer.test|author", email: "author@example.test" };
    const authorId = await t.run(async (ctx) =>
      ctx.db.insert("users", { clerkId: identity.subject, tokenIdentifier: identity.tokenIdentifier, email: identity.email }),
    );
    const approved = await insertQuestion(t, { authorId, customText: smell, text: smell, status: "public", fingerprint: fingerprintText(smell) });

    await t.withIdentity(identity).mutation(api.core.questions.updatePersonalQuestion, { questionId: approved, customText: bus, isPublic: true });

    expect(await t.run(async (ctx) => ctx.db.get(approved))).toMatchObject({ status: "pending", customText: bus });
    expect(await fingerprintOf(t, approved)).toBeNull();
  });

  test("undo on a private question is still refused when anything besides its fingerprint changed", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const personal = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "pending" });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: personal,
      expectedRevision: 0,
      reviewReason: "Mark personal",
      text: smell,
      status: "private",
    });
    await admin.mutation(api.admin.questions.updateQuestion, { id: personal, expectedRevision: 1, reviewReason: "Reword", text: bus });

    const reviews = await admin.query(api.admin.pruning.getReviewHistory, { source: "question" });
    const approval = reviews.find((review) => review.reason === "Mark personal")!;
    await expect(admin.mutation(api.admin.pruning.undoReview, { reviewId: approval._id })).rejects.toThrow("newer work");
  });

  test("an admin-created question is fingerprinted, so generation skips a copy of it", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);

    const created = await admin.mutation(api.admin.questions.createQuestion, { text: bus, status: "public" });

    expect(await fingerprintOf(t, created)).toBe(fingerprintText(bus));
    expect((await insertGenerated(bus)).duplicates).toEqual([{ text: bus, reason: "duplicate of existing question" }]);
  });

  test("a change without new text leaves a library question's or a public submission's fingerprint as it was", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const library = await insertQuestion(t, { text: smell, status: "pending", fingerprint: "q_old_library" });
    const submission = await insertQuestion(t, { authorId: "author-1", customText: bus, text: bus, status: "public", fingerprint: "q_old_submission" });

    // The question detail page sends the status alone when the text hasn't changed.
    await admin.mutation(api.admin.questions.updateQuestion, { id: library, expectedRevision: 0, reviewReason: "Approve", status: "public" });
    await admin.mutation(api.admin.questions.updateQuestion, { id: submission, reviewReason: "Retag", tags: ["travel"] });

    expect(await fingerprintOf(t, library)).toBe("q_old_library");
    expect(await fingerprintOf(t, submission)).toBe("q_old_submission");
  });

  test("publishing a reworded private submission with the status alone fingerprints the edited text", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const reworded = "Which seat do you pick first on a bus?";
    // Mark Personal saved the edited wording in text; customText keeps what was submitted.
    const submission = await insertQuestion(t, { authorId: "author-1", customText: bus, text: reworded, status: "private" });

    await admin.mutation(api.admin.questions.updateQuestion, { id: submission, expectedRevision: 0, reviewReason: "Approve", status: "public" });

    expect(await fingerprintOf(t, submission)).toBe(fingerprintText(reworded));
  });

  test("publishing a private question with no wording to fingerprint leaves it without one", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const organizationId = await setupOrganization(t);
    const blank = await insertQuestion(t, { organizationId, status: "private", fingerprint: "q_old_blank" });

    await admin.mutation(api.admin.questions.updateQuestion, { id: blank, expectedRevision: 0, reviewReason: "Publish", status: "public" });

    expect(await t.run(async (ctx) => ctx.db.get(blank))).toMatchObject({ status: "public" });
    expect(await fingerprintOf(t, blank)).toBeNull();
  });

  test("undoing a prune of a library question is still refused once the recompute changed its fingerprint", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(editor);
    const curly = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    const pruningId = await t.run(async (ctx) => ctx.db.insert("pruning", { questionId: curly, status: "pending", reason: "Low engagement" }));
    await admin.mutation(api.admin.pruning.approvePruning, { pruningId, reason: "Prune", expectedRevision: 0 });
    expect(await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false })).toMatchObject({ changed: 1 });

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    await expect(admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id })).rejects.toThrow("newer work");
    expect(await fingerprintOf(t, curly)).toBe(fingerprintText(roadTrip));
  });

  test("undoing a prune gives a public submission its fingerprint back", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);
    const submission = await insertQuestion(t, { authorId: "author-1", customText: smell, text: smell, status: "public", fingerprint: fingerprintText(smell) });
    const pruningId = await t.run(async (ctx) => ctx.db.insert("pruning", { questionId: submission, status: "pending", reason: "Low engagement" }));
    await admin.mutation(api.admin.pruning.approvePruning, { pruningId, reason: "Prune", expectedRevision: 0 });
    expect(await fingerprintOf(t, submission)).toBeNull();

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id });

    expect(await t.run(async (ctx) => ctx.db.get(submission))).toMatchObject({ status: "public", fingerprint: fingerprintText(smell) });
    expect((await insertGenerated(smell)).duplicates).toEqual([{ text: smell, reason: "duplicate of existing question" }]);
  });

  test("undoing Approve public takes back the fingerprint it gave, and doesn't restore an older one", async () => {
    const { t, insertGenerated } = await setup();
    const admin = t.withIdentity(editor);
    const submission = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "pending", fingerprint: "q_old_pending" });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: submission,
      expectedRevision: 0,
      reviewReason: "Approve",
      text: smell,
      status: "public",
    });
    expect(await fingerprintOf(t, submission)).toBe(fingerprintText(smell));

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "question" });
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id });

    expect(await t.run(async (ctx) => ctx.db.get(submission))).toMatchObject({ status: "pending" });
    expect(await fingerprintOf(t, submission)).toBeNull();
    expect((await insertGenerated(smell)).insertedCount).toBe(1);
  });
});

describe("the prompt architecture backfill", () => {
  test("skips private personal and team questions, and fingerprints library questions and public submissions", async () => {
    const { t } = await setup();
    const organizationId = await t.run(async (ctx) =>
      ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
    );
    const personal = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "private" });
    const teamPrompt = await insertQuestion(t, { organizationId, customText: bus, kind: "team_prompt", status: "private" });
    const approved = await insertQuestion(t, { authorId: "author-2", customText: roadTrip, status: "approved" });
    const library = await insertQuestion(t, { text: bus });

    await t.mutation(internal.internal.migrations.backfillPromptArchitecture, { stage: "questions" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await t.run(async (ctx) =>
      Promise.all([personal, teamPrompt, approved, library].map(async (id) => {
        const question = await ctx.db.get(id);
        return { fingerprint: question?.fingerprint ?? null, source: question?.source ?? null };
      })),
    );
    expect(rows).toEqual([
      { fingerprint: null, source: null },
      { fingerprint: null, source: null },
      { fingerprint: fingerprintText(roadTrip), source: "editor" },
      { fingerprint: fingerprintText(bus), source: "seed" },
    ]);
  });

  test("leaves questions that are already backfilled alone", async () => {
    const { t } = await setup();
    await insertQuestion(t, {
      text: roadTrip,
      fingerprint: fingerprintText(roadTrip),
      styleSlug: "reflective",
      toneSlug: "warm",
      styleVersion: 1,
      toneVersion: 1,
      source: "seed",
      safetyFlags: [],
      quality: {},
    });
    const library = await insertQuestion(t, { text: bus });

    const result = await t.mutation(internal.internal.migrations.backfillPromptArchitecture, { stage: "questions" });

    expect(result.questionsUpdated).toBe(1);
    expect(await fingerprintOf(t, library)).toBe(fingerprintText(bus));
  });

  test("moves past a full batch of skipped questions to the ones after it", async () => {
    const { t } = await setup();
    for (let i = 0; i < PROMPT_BACKFILL_BATCH_SIZE + 1; i++) {
      await insertQuestion(t, { authorId: `author-${i}`, customText: `Personal question number ${i}?`, status: "private" });
    }
    const library = await insertQuestion(t, { text: bus });

    await t.mutation(internal.internal.migrations.backfillPromptArchitecture, { stage: "questions" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await fingerprintOf(t, library)).toBe(fingerprintText(bus));
    const fingerprinted = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).filter((q) => q.fingerprint !== undefined).length);
    expect(fingerprinted).toBe(1);
  });

  test("a run from the first stage reaches the questions and adds the default blueprint", async () => {
    const { t } = await setup();
    const personal = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "private" });
    const library = await insertQuestion(t, { text: bus });

    await t.mutation(internal.internal.migrations.backfillPromptArchitecture, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await fingerprintOf(t, library)).toBe(fingerprintText(bus));
    expect(await fingerprintOf(t, personal)).toBeNull();
    const blueprints = await t.run(async (ctx) => ctx.db.query("promptBlueprints").collect());
    expect(blueprints.map(({ slug }) => slug)).toEqual([DEFAULT_BLUEPRINT_SLUG]);
  });
});

describe("clearing fingerprints private questions still hold", () => {
  async function setupQuestions(t: TestConvex) {
    const organizationId = await t.run(async (ctx) =>
      ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
    );
    return {
      library: await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) }),
      prunedLibrary: await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus), status: "pruned" }),
      approved: await insertQuestion(t, { authorId: "author-1", customText: bus, text: bus, status: "approved", fingerprint: fingerprintText(bus) }),
      personal: await insertQuestion(t, { authorId: "author-2", customText: smell, text: smell, status: "private", fingerprint: fingerprintText(smell) }),
      pending: await insertQuestion(t, { authorId: "author-3", customText: smell, status: "pending", fingerprint: "q_old_pending" }),
      teamPrompt: await insertQuestion(t, { organizationId, customText: roadTrip, kind: "team_prompt", status: "private", fingerprint: fingerprintText(roadTrip) }),
      orgQuestion: await insertQuestion(t, { organizationId, text: bus, status: "private", fingerprint: fingerprintText(bus) }),
      withoutFingerprint: await insertQuestion(t, { authorId: "author-4", customText: bus, status: "private" }),
    };
  }

  test("a dry run counts what it would clear and writes nothing", async () => {
    const { t } = await setup();
    await setupQuestions(t);
    const before = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));

    const summary = await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: true });

    expect(summary).toEqual({ scanned: 8, privateUserQuestions: 5, cleared: 4 });
    const after = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));
    expect(after).toEqual(before);
  });

  test("a real run clears only private questions' fingerprints", async () => {
    const { t, insertGenerated } = await setup();
    const ids = await setupQuestions(t);

    const summary = await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false });

    expect(summary).toEqual({ scanned: 8, privateUserQuestions: 5, cleared: 4 });
    for (const id of [ids.personal, ids.pending, ids.teamPrompt, ids.orgQuestion, ids.withoutFingerprint]) {
      expect(await fingerprintOf(t, id)).toBeNull();
    }
    expect(await fingerprintOf(t, ids.library)).toBe(fingerprintText(roadTrip));
    expect(await fingerprintOf(t, ids.prunedLibrary)).toBe(fingerprintText(bus));
    expect(await fingerprintOf(t, ids.approved)).toBe(fingerprintText(bus));
    expect((await insertGenerated(smell)).insertedCount).toBe(1);
    // The team prompt shared the library question's fingerprint; the library question still counts.
    expect((await insertGenerated(roadTrip)).duplicates).toEqual([{ text: roadTrip, reason: "duplicate of existing question" }]);

    const again = await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false });
    expect(again).toMatchObject({ cleared: 0 });
  });

  test("a run with private questions on more than one page clears them all", async () => {
    const { t } = await setup();
    const count = PRIVATE_FINGERPRINT_CLEAR_PAGE_SIZE + 1;
    for (let i = 0; i < count; i++) {
      const text = `Personal question number ${i}?`;
      await insertQuestion(t, { authorId: `author-${i}`, customText: text, status: "private", fingerprint: fingerprintText(text) });
    }

    const summary = await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false });

    expect(summary).toEqual({ scanned: count, privateUserQuestions: count, cleared: count });
    const remaining = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).filter((q) => q.fingerprint !== undefined).length);
    expect(remaining).toBe(0);
  });

  test("a short run logs only its totals", async () => {
    const { t } = await setup();
    await insertQuestion(t, { authorId: "author-1", customText: smell, status: "private", fingerprint: fingerprintText(smell) });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: true });

      const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("clearPrivateQuestionFingerprints"));
      expect(lines).toEqual([
        `clearPrivateQuestionFingerprints (dry run) total: ${JSON.stringify({ scanned: 1, privateUserQuestions: 1, cleared: 1 })}`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  test("a long run logs its running totals every 50 pages, then its totals", async () => {
    const { t } = await setup();
    // 50 full pages of library questions, then a private question on the next page.
    const filler = PRIVATE_FINGERPRINT_CLEAR_PAGE_SIZE * 50;
    await t.run(async (ctx) => {
      for (let i = 0; i < filler; i++) {
        await ctx.db.insert("questions", { text: `Filler question number ${i} for paging?`, status: "public", ...counters });
      }
    });
    await insertQuestion(t, { authorId: "author-1", customText: smell, status: "private", fingerprint: fingerprintText(smell) });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false });

      const lines = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith("clearPrivateQuestionFingerprints"));
      expect(lines).toEqual([
        `clearPrivateQuestionFingerprints progress: ${JSON.stringify({ scanned: filler, privateUserQuestions: 0, cleared: 0 })}`,
        `clearPrivateQuestionFingerprints total: ${JSON.stringify({ scanned: filler + 1, privateUserQuestions: 1, cleared: 1 })}`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  test("a review made before a run can still be undone after it", async () => {
    const { t } = await setup();
    const admin = t.withIdentity({
      subject: "editor",
      tokenIdentifier: "https://issuer.test|editor",
      metadata: { isAdmin: "true" },
    });
    // Keeping a flagged question changes nothing on it, so the review records the fingerprint it still had.
    const personal = await insertQuestion(t, { authorId: "author-1", customText: smell, status: "private", fingerprint: fingerprintText(smell) });
    const pruningId = await admin.mutation(api.admin.pruning.flagQuestion, { questionId: personal, reasons: ["awkward_wording"], notes: "Needs review" });
    await admin.mutation(api.admin.pruning.rejectPruning, { pruningId, reason: "Clear enough as written", expectedRevision: 1 });
    expect(await t.action(internal.internal.migrations.clearPrivateQuestionFingerprints, { dryRun: false })).toMatchObject({ cleared: 1 });

    const history = await admin.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    const kept = history.find((review) => review.outcome === "keep")!;
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: kept._id });

    expect(await t.run(async (ctx) => ctx.db.get(personal))).toMatchObject({ status: "private", reviewRevision: 3 });
    expect(await fingerprintOf(t, personal)).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.get(pruningId))?.status)).toBe("pending");
  });
});
