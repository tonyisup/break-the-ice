/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { fingerprintText } from "./lib/promptArchitecture";
import { MAX_REVIEW_BATCH } from "./constants";
import type { Doc, Id } from "./_generated/dataModel";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const modules = import.meta.glob("./**/*.ts");
const ADMIN = { subject: "editor", tokenIdentifier: "https://issuer.test|editor", metadata: { isAdmin: "true" } };
const READER = { subject: "reader", tokenIdentifier: "https://issuer.test|reader" };

const base = { averageViewDuration: 0, totalLikes: 0, totalShows: 0 };
const aiQuestion = (text: string) => ({ ...base, text, status: "pending" as const, isAIGenerated: true, heldForReview: true, style: "would-you-rather", tone: "playful" });
const authorQuestion = (customText: string) => ({ ...base, customText, status: "pending" as const, authorId: "user|author", kind: "personal" as const });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const runId = await ctx.db.insert("generationRuns", {
      status: "succeeded", purpose: "quality_check", batchSize: 1, model: "m", temperature: 0, assembledPrompt: "", resultQuestionIds: [], createdAt: 0,
    });
    const check = { verdict: "keep" as const, reasons: [], safety: [], confidence: 5, note: "", wouldPublish: true, model: "m", promptVersion: 2, runId, checkedAt: 0 };
    return {
      ai: await ctx.db.insert("questions", { ...aiQuestion("Would you rather sing or dance at a wedding?"), qualityCheck: check }),
      ai2: await ctx.db.insert("questions", aiQuestion("Would you rather time travel forward or back?")),
      author: await ctx.db.insert("questions", { ...authorQuestion("What tiny habit made your year better?"), qualityCheck: check }),
      reviewed: await ctx.db.insert("questions", { ...base, text: "Already public?", status: "public" as const }),
    };
  });
  const admin = t.withIdentity(ADMIN);
  const get = (id: Id<"questions">) => t.run((ctx) => ctx.db.get(id)) as Promise<Doc<"questions">>;
  const reviews = () => t.run((ctx) => ctx.db.query("questionReviews").collect());
  const changes = () => t.run((ctx) => ctx.db.query("questionReviewChanges").collect());
  const pick = (...list: Id<"questions">[]) => list.map((id) => ({ id, expectedRevision: 0 }));
  return { t, ids, admin, get, reviews, changes, pick };
}

describe("reviewPendingQuestions", () => {
  test("approves several questions at once, with no note, as one undoable review", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.review.reviewPendingQuestions, { questions: s.pick(s.ids.ai, s.ids.author), decision: "approve" });

    const ai = await s.get(s.ids.ai);
    expect(ai).toMatchObject({ status: "public", text: "Would you rather sing or dance at a wedding?", reviewRevision: 1 });
    expect(ai.heldForReview).toBeUndefined();
    expect(ai.fingerprint).toBe(fingerprintText(ai.text!));
    // The check read this exact wording, so its verdict stands.
    expect(ai.qualityCheck?.verdict).toBe("keep");

    // A person's question gets its wording copied into the reviewed text and a fingerprint.
    const author = await s.get(s.ids.author);
    expect(author).toMatchObject({ status: "public", text: "What tiny habit made your year better?", reviewRevision: 1 });
    expect(author.fingerprint).toBe(fingerprintText("What tiny habit made your year better?"));
    // The check read no reviewed text, so copying the wording in takes its verdict off.
    expect(author.qualityCheck).toBeUndefined();

    const [review] = await s.reviews();
    expect(review).toMatchObject({ outcome: "approve", source: "question", reason: "Approved 2 questions", undoable: true });
    expect(review.reasons).toBeUndefined();
    expect(await s.changes()).toHaveLength(2);
  });

  test("rejects with optional reasons and a note, and stores the reasons as codes", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.review.reviewPendingQuestions, {
      questions: s.pick(s.ids.ai, s.ids.author),
      decision: "reject",
      reasons: ["awkward_wording", "repeated_construction", "awkward_wording"],
      note: "  Too samey  ",
    });

    const ai = await s.get(s.ids.ai);
    expect(ai.status).toBe("private");
    expect(ai.heldForReview).toBeUndefined();
    // A person's rejected question stays theirs, private, with no library fingerprint.
    const author = await s.get(s.ids.author);
    expect(author).toMatchObject({ status: "private", kind: "personal" });
    expect(author.fingerprint).toBeUndefined();

    const [review] = await s.reviews();
    expect(review).toMatchObject({
      outcome: "reject",
      reasons: ["awkward_wording", "repeated_construction"],
      reason: "Rejected 2 questions. Awkward wording, Repeated construction: Too samey",
    });
  });

  test("a reject needs no reasons", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.review.reviewPendingQuestions, { questions: s.pick(s.ids.ai2), decision: "reject" });
    expect((await s.reviews())[0]).toMatchObject({ reason: "Rejected 1 question", outcome: "reject" });
  });

  test("undo puts every question in the review back in the queue", async () => {
    const s = await setup();
    const { reviewId } = await s.admin.mutation(api.admin.review.reviewPendingQuestions, { questions: s.pick(s.ids.ai, s.ids.ai2), decision: "approve" });
    await s.admin.mutation(api.admin.pruning.undoReview, { reviewId });
    expect(await s.get(s.ids.ai)).toMatchObject({ status: "pending", heldForReview: true, reviewRevision: 2 });
    expect(await s.get(s.ids.ai2)).toMatchObject({ status: "pending", heldForReview: true });
  });

  test("saves nothing when any selected question is stale or already reviewed", async () => {
    const s = await setup();
    await expect(
      s.admin.mutation(api.admin.review.reviewPendingQuestions, {
        questions: [{ id: s.ids.ai, expectedRevision: 0 }, { id: s.ids.ai2, expectedRevision: 4 }],
        decision: "approve",
      }),
    ).rejects.toThrow(/changed during review/);
    await expect(
      s.admin.mutation(api.admin.review.reviewPendingQuestions, { questions: s.pick(s.ids.ai, s.ids.reviewed), decision: "approve" }),
    ).rejects.toThrow(/already been reviewed/);
    expect((await s.get(s.ids.ai)).status).toBe("pending");
    expect(await s.reviews()).toHaveLength(0);
  });

  test("refuses reasons on an approve, repeats, empty and oversized selections", async () => {
    const s = await setup();
    const review = (args: Parameters<typeof s.admin.mutation<typeof api.admin.review.reviewPendingQuestions>>[1]) =>
      s.admin.mutation(api.admin.review.reviewPendingQuestions, args);
    await expect(review({ questions: s.pick(s.ids.ai), decision: "approve", reasons: ["unclear_answer"] })).rejects.toThrow(/Only a reject/);
    await expect(review({ questions: s.pick(s.ids.ai, s.ids.ai), decision: "approve" })).rejects.toThrow(/listed twice/);
    await expect(review({ questions: [], decision: "approve" })).rejects.toThrow(/at least one/);
    const many = Array.from({ length: MAX_REVIEW_BATCH + 1 }, () => ({ id: s.ids.ai, expectedRevision: 0 }));
    await expect(review({ questions: many, decision: "approve" })).rejects.toThrow(/at most/);
  });

  test("is for admins only", async () => {
    const s = await setup();
    await expect(
      s.t.withIdentity(READER).mutation(api.admin.review.reviewPendingQuestions, { questions: s.pick(s.ids.ai), decision: "approve" }),
    ).rejects.toThrow();
    expect((await s.get(s.ids.ai)).status).toBe("pending");
  });
});
