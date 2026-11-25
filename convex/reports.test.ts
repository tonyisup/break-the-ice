/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
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

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const runId = await ctx.db.insert("generationRuns", {
      status: "succeeded", purpose: "quality_check", batchSize: 1, model: "m", temperature: 0, assembledPrompt: "", resultQuestionIds: [], createdAt: 0,
    });
    const check = (verdict: "keep" | "hold") => ({ verdict, reasons: [], safety: [], confidence: 5, note: "", wouldPublish: verdict === "keep", model: "m", promptVersion: 2, runId, checkedAt: 0 });
    const live = await ctx.db.insert("questions", { ...base, text: "What made you laugh this week?", status: "public", isAIGenerated: true, style: "open-ended", tone: "playful", topic: "everyday", qualityCheck: check("keep"), fingerprint: "fp-live", generatedByModel: "anthropic/claude-haiku-5.5" });
    const library = await ctx.db.insert("questions", { ...base, text: "Which smell takes you back?", status: "approved", styleSlug: "open-ended", toneSlug: "warm" });
    const pending = await ctx.db.insert("questions", { ...base, text: "Would you rather fly or swim?", status: "pending", isAIGenerated: true, style: "would-you-rather", tone: "playful", qualityCheck: check("hold") });
    const rejected = await ctx.db.insert("questions", { ...base, text: "What is a tax form you love?", status: "private", isAIGenerated: true, style: "would-you-rather", tone: "playful" });
    const retired = await ctx.db.insert("questions", { ...base, text: "Old question?", status: "pruned", prunedAt: 1 });
    const personPublic = await ctx.db.insert("questions", { ...base, customText: "What is your go-to karaoke song?", text: "What is your go-to karaoke song?", status: "public", authorId: "user|a", kind: "personal" });
    const personPrivate = await ctx.db.insert("questions", { ...base, customText: "A note to self?", status: "private", authorId: "user|a", kind: "personal" });
    const duplicate = await ctx.db.insert("questions", { ...base, text: "What made you laugh today?", status: "pruned", prunedAt: 1, duplicateOf: live });

    const event = (questionId: Id<"questions">, event: Doc<"analytics">["event"], timestamp: number, viewDuration = 0) =>
      ctx.db.insert("analytics", { questionId, event, timestamp, viewDuration });
    await event(live, "seen", 1000, 4000);
    await event(live, "seen", 2000, 2000);
    await event(live, "seen", 3000, 0);
    await event(live, "liked", 3000);
    await event(live, "shared", 3000);
    await event(library, "seen", 100, 1000);
    await event(library, "hidden", 100);
    await event(personPrivate, "seen", 3000, 1000);
    return { live, library, pending, rejected, retired, personPublic, personPrivate, duplicate };
  });
  const admin = t.withIdentity(ADMIN);
  const get = (id: Id<"questions">) => t.run((ctx) => ctx.db.get(id)) as Promise<Doc<"questions">>;
  return { t, ids, admin, get };
}

describe("getPerformanceReport", () => {
  test("tallies each question's events and says where it stands", async () => {
    const s = await setup();
    const report = await s.admin.query(api.admin.reports.getPerformanceReport, {});
    const byId = new Map(report.rows.map((row) => [row.id, row]));

    expect(byId.get(s.ids.live)).toMatchObject({
      status: "live", isAIGenerated: true, byPerson: false, style: "open-ended", tone: "playful", topic: "everyday", claude: "keep",
      model: "anthropic/claude-haiku-5.5",
      // The untimed view counts as a view but not toward the average time.
      seen: 3, liked: 1, shared: 1, hidden: 0, avgViewMs: 3000,
    });
    // Older rows keep their taxonomy only in the slug fields.
    expect(byId.get(s.ids.library)).toMatchObject({ status: "live", style: "open-ended", tone: "warm", seen: 1, hidden: 1, avgViewMs: 1000 });
    expect(byId.get(s.ids.pending)).toMatchObject({ status: "pending", claude: "hold", seen: 0 });
    expect(byId.get(s.ids.rejected)?.status).toBe("rejected");
    expect(byId.get(s.ids.retired)?.status).toBe("retired");
    expect(byId.get(s.ids.personPublic)).toMatchObject({ status: "live", byPerson: true });

    // A person's private question and a resolved duplicate aren't library questions.
    expect(byId.has(s.ids.personPrivate)).toBe(false);
    expect(byId.has(s.ids.duplicate)).toBe(false);
    expect(report).toMatchObject({ eventsCounted: 8, oldestEventAt: 100, eventsTruncated: false, questionsTruncated: false });
  });

  test("counts only events from the chosen start", async () => {
    const s = await setup();
    const report = await s.admin.query(api.admin.reports.getPerformanceReport, { since: 2000 });
    const live = report.rows.find((row) => row.id === s.ids.live)!;
    expect(live).toMatchObject({ seen: 2, liked: 1, avgViewMs: 2000 });
    expect(report.rows.find((row) => row.id === s.ids.library)).toMatchObject({ seen: 0, hidden: 0 });
    expect(report.oldestEventAt).toBe(2000);
  });

  test("is for admins only", async () => {
    const s = await setup();
    await expect(s.t.withIdentity(READER).query(api.admin.reports.getPerformanceReport, {})).rejects.toThrow();
    await expect(s.t.query(api.admin.reports.getPerformanceReport, {})).rejects.toThrow();
  });
});

describe("pruneQuestions", () => {
  test("prunes several library questions as one undoable review", async () => {
    const s = await setup();
    const { reviewId } = await s.admin.mutation(api.admin.review.pruneQuestions, {
      questions: [{ id: s.ids.live, expectedRevision: 0 }, { id: s.ids.personPublic, expectedRevision: 0 }],
      note: "  Never liked ",
    });

    const live = await s.get(s.ids.live);
    expect(live).toMatchObject({ status: "pruned", reviewRevision: 1, fingerprint: "fp-live" });
    expect(live.prunedAt).toBeTypeOf("number");
    // A person's question that leaves the library loses its fingerprint.
    expect((await s.get(s.ids.personPublic)).fingerprint).toBeUndefined();

    const review = await s.t.run((ctx) => ctx.db.get(reviewId));
    expect(review).toMatchObject({ outcome: "prune", source: "pruning", undoable: true, reason: "Pruned 2 questions from reports: Never liked" });

    await s.admin.mutation(api.admin.pruning.undoReview, { reviewId });
    const restored = await s.get(s.ids.live);
    expect(restored.status).toBe("public");
    expect(restored.prunedAt).toBeUndefined();
    expect((await s.get(s.ids.personPublic)).status).toBe("public");
  });

  test("prunes nothing when any pick is out of the library or changed", async () => {
    const s = await setup();
    await expect(s.admin.mutation(api.admin.review.pruneQuestions, {
      questions: [{ id: s.ids.live, expectedRevision: 0 }, { id: s.ids.pending, expectedRevision: 0 }],
    })).rejects.toThrow("no longer in the library");
    await expect(s.admin.mutation(api.admin.review.pruneQuestions, {
      questions: [{ id: s.ids.live, expectedRevision: 0 }, { id: s.ids.library, expectedRevision: 3 }],
    })).rejects.toThrow("changed since the report loaded");
    expect((await s.get(s.ids.live)).status).toBe("public");
    expect(await s.t.run((ctx) => ctx.db.query("questionReviews").collect())).toHaveLength(0);
  });

  test("refuses an empty or repeated pick, and anyone but an admin", async () => {
    const s = await setup();
    await expect(s.admin.mutation(api.admin.review.pruneQuestions, { questions: [] })).rejects.toThrow("at least one");
    await expect(s.admin.mutation(api.admin.review.pruneQuestions, {
      questions: [{ id: s.ids.live, expectedRevision: 0 }, { id: s.ids.live, expectedRevision: 0 }],
    })).rejects.toThrow("listed twice");
    await expect(s.t.withIdentity(READER).mutation(api.admin.review.pruneQuestions, {
      questions: [{ id: s.ids.live, expectedRevision: 0 }],
    })).rejects.toThrow();
  });
});
