/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
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
  return { t, insertGenerated };
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
      // Personal questions never get a fingerprint, and don't get one here.
      personal: await insertQuestion(t, { customText: smellCurly, status: "private" }),
      withoutText: await insertQuestion(t, { fingerprint: "q_old_no_text" }),
    };
  }

  test("a dry run reports what would change and the collisions, and writes nothing", async () => {
    const { t } = await setup();
    const ids = await setupLibrary(t);
    const before = await t.run(async (ctx) => (await ctx.db.query("questions").collect()).map((q) => q.fingerprint ?? null));

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });

    expect(summary).toEqual({
      scanned: 6,
      withoutFingerprint: 1,
      withoutText: 1,
      changed: 2,
      updated: 1,
      heldBack: 1,
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

  test("a real run fixes fingerprints that don't collide, and holds back the rest until resolved", async () => {
    const { t, insertGenerated } = await setup();
    const ids = await setupLibrary(t);

    const summary = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });

    expect(summary).toMatchObject({ changed: 2, updated: 1, heldBack: 1, skippedAtWrite: 0 });
    expect(await fingerprintOf(t, ids.smellCurly)).toBe(fingerprintText(smell));
    // Held back: sharing the straight question's fingerprint would make generation's .unique() lookup throw.
    expect(await fingerprintOf(t, ids.roadTripCurly)).toBe("q_old_road_trip");
    expect(await fingerprintOf(t, ids.personal)).toBeNull();
    expect(await fingerprintOf(t, ids.withoutText)).toBe("q_old_no_text");

    const generated = await insertGenerated(smell, roadTrip);
    expect(generated.duplicates).toEqual([
      { text: smell, reason: "duplicate of existing question" },
      { text: roadTrip, reason: "duplicate of existing question" },
    ]);

    const again = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(again).toMatchObject({ changed: 1, updated: 0, heldBack: 1 });
    expect(again.collisions).toHaveLength(1);

    // Resolving the duplicate lets the next run fix the one that was held back.
    await t.run(async (ctx) => ctx.db.delete(ids.roadTrip));
    const resolved = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: false });
    expect(resolved).toMatchObject({ changed: 1, updated: 1, heldBack: 0, collisions: [] });
    expect(await fingerprintOf(t, ids.roadTripCurly)).toBe(fingerprintText(roadTrip));
  });

  test("two changed questions on different pages that end up alike are both held back", async () => {
    const { t } = await setup();
    const first = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_right_quote" });
    for (let i = 0; i < 100; i++) {
      const text = `Filler question number ${i} for paging?`;
      await insertQuestion(t, { text, fingerprint: fingerprintText(text) });
    }
    // A left quote where the right one belongs: a different old fingerprint, the same new one.
    const second = await insertQuestion(t, { text: roadTripCurly.replace("\u2019s", "\u2018s"), fingerprint: "q_old_left_quote" });

    const dryRun = await t.action(internal.internal.migrations.recomputeQuestionFingerprints, { dryRun: true });
    expect(dryRun).toMatchObject({ scanned: 102, changed: 2, updated: 0, heldBack: 2 });
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
    expect(await fingerprintOf(t, first)).toBe("q_old_right_quote");
    expect(await fingerprintOf(t, second)).toBe("q_old_left_quote");
  });

  test("a write skips a question that changed after the scan or whose new fingerprint was taken", async () => {
    const { t } = await setup();
    const taken = await insertQuestion(t, { text: roadTripCurly, fingerprint: "q_old_road_trip" });
    await insertQuestion(t, { text: roadTrip, fingerprint: fingerprintText(roadTrip) });
    const edited = await insertQuestion(t, { text: bus, fingerprint: fingerprintText(bus) });
    const ready = await insertQuestion(t, { text: smellCurly, fingerprint: "q_old_smell" });

    const result = await t.mutation(internal.internal.migrations.writeQuestionFingerprints, {
      updates: [
        { questionId: taken, from: "q_old_road_trip", to: fingerprintText(roadTrip) },
        { questionId: edited, from: "q_old_bus", to: fingerprintText(bus) },
        { questionId: ready, from: "q_old_smell", to: fingerprintText(smell) },
      ],
    });

    expect(result).toEqual({ updated: 1, skippedAtWrite: 2 });
    expect(await fingerprintOf(t, taken)).toBe("q_old_road_trip");
    expect(await fingerprintOf(t, ready)).toBe(fingerprintText(smell));
  });
});
