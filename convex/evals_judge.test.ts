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
    { text: "C", verdict: { verdict: "hold" }, wouldPublish: false },
    { text: "D", verdict: { verdict: "keep" }, wouldPublish: false },
    { text: "E", error: "The quality check's answer couldn't be read" },
  ];

  test("counts by group, treating an unsure as a reject and leaving unjudged cards out of the rates", () => {
    const cards = [
      { text: "A", group: "would_publish", verdict: "keep" },
      { text: "B", group: "would_publish", verdict: "unsure" },
      { text: "C", group: "would_hold", verdict: "keep" },
      { text: "D", group: "would_hold", verdict: "reject" },
      { text: "E", group: "would_publish", verdict: "keep" },
      { text: "Never judged", group: "labeled_before", verdict: "reject" },
    ];

    expect(compareWithLabels(judged, cards)).toEqual({
      would_publish: { cards: 3, unjudged: 1, wouldPublish: 2, wouldPublishRejected: 1, wouldHold: 0, wouldHoldKept: 0 },
      would_hold: { cards: 2, unjudged: 0, wouldPublish: 0, wouldPublishRejected: 0, wouldHold: 2, wouldHoldKept: 1 },
      labeled_before: { cards: 1, unjudged: 1, wouldPublish: 0, wouldPublishRejected: 0, wouldHold: 0, wouldHoldKept: 0 },
    });
  });

  test("the pass rule allows 1 reject in 20, rounded down, and isn't decided on fewer than 60 cards", () => {
    expect([59, 60, 79, 80, 95, 100].map(allowedRejects)).toEqual([2, 3, 3, 4, 4, 5]);
    const group = (wouldPublish: number, wouldPublishRejected: number) => ({ cards: wouldPublish, unjudged: 0, wouldPublish, wouldPublishRejected, wouldHold: 0, wouldHoldKept: 0 });

    expect(passRule(group(95, 4))).toEqual({ decided: true, pass: true, rejected: 4, allowed: 4, of: 95 });
    expect(passRule(group(95, 5))).toEqual({ decided: true, pass: false, rejected: 5, allowed: 4, of: 95 });
    expect(passRule(group(MIN_PASS_CARDS - 1, 0))).toMatchObject({ decided: false });
    expect(passRule(undefined)).toMatchObject({ decided: false });
  });
});
