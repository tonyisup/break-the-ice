// The pure part of evals/judge.mjs: which questions it judges, and how it sets verdicts beside
// the owner's labels.
import { describe, expect, test } from "vitest";
import { MIN_PASS_CARDS, allowedRejects, compareWithLabels, passRule, savedQuestions } from "../evals/judgeRecord.mjs";

const definitions = {
  style: { slug: "desert-island", name: "Desert Island", definition: "One thing to bring." },
  tone: { slug: "bold", name: "Bold", definition: "Direct." },
  topic: null,
};
const batch = (seedId: string, candidates: Array<[string, string]>, ok = true) => ({
  seed: { id: seedId },
  ok,
  result: ok ? { definitions, candidates: candidates.map(([text, outcome]) => ({ text, outcome })) } : undefined,
});

describe("which questions are judged", () => {
  test("only questions a run would have saved, each once, with the definitions the judge is shown", () => {
    const runs = [
      { run: "r1", generated: { batches: [batch("s01", [["Kept one?", "saved"], ["A copy?", "duplicate"], ["Too short", "rejected"]]), batch("s02", [], false)] } },
      { run: "r2", generated: { batches: [batch("s01", [["Kept one?", "saved"], ["Another kept one?", "saved"]])] } },
    ];

    expect(savedQuestions(runs)).toEqual([
      { text: "Kept one?", run: "r1", seedId: "s01", ...definitions },
      { text: "Another kept one?", run: "r2", seedId: "s01", ...definitions },
    ]);
  });
});

describe("verdicts beside the owner's labels", () => {
  const judged = [
    { text: "A", verdict: { verdict: "keep" }, wouldPublish: true },
    { text: "B", verdict: { verdict: "keep" }, wouldPublish: true },
    { text: "C", verdict: { verdict: "hold" }, wouldPublish: false, wouldFlag: true },
    { text: "D", verdict: { verdict: "keep" }, wouldPublish: false },
    { text: "E", error: "The quality check's answer couldn't be read" },
  ];

  test("counts by group, treating an unsure as a reject and leaving unjudged cards out of the rates", () => {
    const cards = [
      { text: "A", group: "would_publish", verdict: "keep" },
      { text: "B", group: "would_publish", verdict: "unsure" },
      { text: "C", group: "for_review", verdict: "keep" },
      { text: "D", group: "for_review", verdict: "reject" },
      { text: "E", group: "would_publish", verdict: "keep" },
      { text: "Never judged", group: "labeled_before", verdict: "reject" },
    ];

    expect(compareWithLabels(judged, cards)).toEqual({
      would_publish: { cards: 3, unjudged: 1, wouldPublish: 2, wouldPublishRejected: 1, forReview: 0, forReviewKept: 0, flagged: 0, flaggedKept: 0 },
      for_review: { cards: 2, unjudged: 0, wouldPublish: 0, wouldPublishRejected: 0, forReview: 2, forReviewKept: 1, flagged: 1, flaggedKept: 1 },
      labeled_before: { cards: 1, unjudged: 1, wouldPublish: 0, wouldPublishRejected: 0, forReview: 0, forReviewKept: 0, flagged: 0, flaggedKept: 0 },
    });
  });

  test("the pass rule allows 1 reject in 20, rounded down, and isn't decided on fewer than 60 cards", () => {
    expect([59, 60, 79, 80, 95, 100].map(allowedRejects)).toEqual([2, 3, 3, 4, 4, 5]);
    const group = (wouldPublish: number, wouldPublishRejected: number) => ({ cards: wouldPublish, unjudged: 0, wouldPublish, wouldPublishRejected, forReview: 0, forReviewKept: 0, flagged: 0, flaggedKept: 0 });

    expect(passRule(group(95, 4))).toEqual({ decided: true, pass: true, rejected: 4, allowed: 4, of: 95 });
    expect(passRule(group(95, 5))).toEqual({ decided: true, pass: false, rejected: 5, allowed: 4, of: 95 });
    expect(passRule(group(MIN_PASS_CARDS - 1, 0))).toMatchObject({ decided: false });
    expect(passRule(undefined)).toMatchObject({ decided: false });
  });

  test("the pass rule is decided from exactly 60 cards, says how many it had when it isn't, and a run with nothing saved adds no questions", () => {
    const group = (wouldPublish: number, wouldPublishRejected: number) => ({ cards: wouldPublish, unjudged: 0, wouldPublish, wouldPublishRejected, forReview: 0, forReviewKept: 0, flagged: 0, flaggedKept: 0 });

    expect(passRule(group(MIN_PASS_CARDS, 3))).toEqual({ decided: true, pass: true, rejected: 3, allowed: 3, of: 60 });
    expect(passRule(group(MIN_PASS_CARDS, 4))).toMatchObject({ decided: true, pass: false });
    expect(passRule(group(12, 0))).toEqual({ decided: false, reason: "Needs at least 60 labeled cards the check would publish; there are 12." });
    expect(passRule(undefined)).toEqual({ decided: false, reason: "Needs at least 60 labeled cards the check would publish; there are 0." });
    // Cards that were labeled but never judged don't count toward the 60.
    const unjudged = compareWithLabels([], Array.from({ length: 80 }, (_, i) => ({ text: `Q${i}`, group: "would_publish", verdict: "keep" }))) as Record<string, unknown>;
    expect(unjudged.would_publish).toMatchObject({ cards: 80, unjudged: 80, wouldPublish: 0 });
    expect(passRule(unjudged.would_publish)).toMatchObject({ decided: false });

    // A blind set is decided as it was drawn. Ten rejects in 100 fail; with seven of the rejected
    // cards re-judged as holds, or missing, the remaining 3 in 93 must not read as a pass.
    const drawn = Array.from({ length: 100 }, (_, i) => ({ text: `Blind ${i}`, group: "would_publish", verdict: i < 10 ? "reject" : "keep" }));
    const asDrawn = drawn.map((card) => ({ text: card.text, verdict: { verdict: "keep" }, wouldPublish: true }));
    const publishGroup = (results: unknown[], cards: unknown[]) => (compareWithLabels(results, cards) as Record<string, unknown>).would_publish;
    expect(passRule(publishGroup(asDrawn, drawn))).toEqual({ decided: true, pass: false, rejected: 10, allowed: 5, of: 100 });
    const rejudged = asDrawn.map((result, i) => (i < 7 ? { ...result, verdict: { verdict: "hold" }, wouldPublish: false, wouldFlag: true } : result));
    expect(passRule(publishGroup(rejudged, drawn))).toEqual({
      decided: false,
      reason: "7 of the 100 cards drawn as would-publish aren't judged in this file or would no longer publish. Use the judged file the set was drawn from.",
    });
    expect(passRule(publishGroup(asDrawn.slice(7), drawn))).toMatchObject({ decided: false, reason: expect.stringMatching(/^7 of the 100 cards/) });
    // A card exported twice is counted once.
    expect(publishGroup(asDrawn, [...drawn, drawn[0]])).toMatchObject({ cards: 100, wouldPublishRejected: 10 });

    // A run file with no batches yet, and a batch marked ok that has no result, are passed over.
    expect(savedQuestions([{ run: "empty", generated: {} }, { run: "partial", generated: { batches: [{ seed: { id: "s01" }, ok: true }] } }])).toEqual([]);
    expect(compareWithLabels(judged, [])).toEqual({});
  });
});
