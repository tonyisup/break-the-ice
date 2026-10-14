// Picking the best of a judged batch and reading the owner's labels on it (evals/selectRecord.mjs),
// and the owner's decisions the judge is shown (judgeContext in evals/judgeRecord.mjs).
import { describe, expect, test } from "vitest";
import { MIN_PASS_CARDS, contextLabel, judgeContext } from "../evals/judgeRecord.mjs";
import { PICK_MIN_CONFIDENCE, clearsBar, drawSet, scoreSet } from "../evals/selectRecord.mjs";

type Verdict = { verdict: "keep" | "hold"; reasons: string[]; safety: string[]; confidence: number };
const verdict = (confidence: number, kind: "keep" | "hold" = "keep", reasons: string[] = [], safety: string[] = []): Verdict => ({
  verdict: kind,
  reasons,
  safety,
  confidence,
});

describe("the owner's decisions shown to the judge", () => {
  const names = { styles: { a: { name: "Style A" }, b: { name: "Style B" } }, tones: { t: { name: "Tone T" } } };
  const decision = (i: number, style: string, kind: "keep" | "reject" | "unsure" = "keep") => ({
    text: `${style} ${kind} ${i}?`,
    style,
    tone: "t",
    verdict: kind,
    reasons: kind === "reject" ? ["awkward_wording"] : [],
  });

  test("the latest ten of the style, then the latest of other styles up to 24, oldest first, by name", () => {
    const decisions = [
      ...Array.from({ length: 13 }, (_, i) => decision(i, "a")),
      ...Array.from({ length: 30 }, (_, i) => decision(i, "b", i % 2 ? "reject" : "keep")),
      decision(99, "b", "unsure"),
    ];

    const context = judgeContext(decisions, "a", names);

    expect(context.sameStyle.map((example) => example.text)).toEqual(Array.from({ length: 10 }, (_, i) => `a keep ${i + 3}?`));
    expect(context.sameStyle[0]).toEqual({ text: "a keep 3?", style: "Style A", tone: "Tone T", verdict: "keep", reasons: [] });
    // Ten keeps of the style leave room for two more keeps, and for twelve rejects.
    expect(context.others).toHaveLength(14);
    expect(context.others.filter((example) => example.verdict === "keep").map((example) => example.text)).toEqual(["b keep 26?", "b keep 28?"]);
    expect(context.others.filter((example) => example.verdict === "reject")).toHaveLength(12);
    expect(context.others.at(-1)).toEqual({ text: "b reject 29?", style: "Style B", tone: "Tone T", verdict: "reject", reasons: ["awkward_wording"] });
    // In the order the owner decided them, and never an "unsure".
    const order = context.others.map((example) => Number(example.text.match(/\d+/)?.[0]));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(JSON.stringify(context)).not.toContain("unsure");
  });

  test("a style with no decisions gets other styles' only, and a slug without a name is shown as it is", () => {
    const decisions = [decision(1, "b"), decision(2, "c", "reject")];
    const context = judgeContext(decisions, "a", names);
    expect(context.sameStyle).toEqual([]);
    expect(context.others.map((example) => example.style)).toEqual(["Style B", "c"]);
    expect(judgeContext([], "a", names)).toEqual({ sameStyle: [], others: [] });
  });

  test("a question the owner has already decided on is shown only the decisions made before that one", () => {
    const decisions = [decision(1, "a"), decision(2, "b", "reject"), decision(3, "a", "reject"), decision(4, "a"), decision(5, "b")];
    const shown = (text?: string) => {
      const context = judgeContext(decisions, "a", names, text);
      return [context.sameStyle.map((example) => example.text), context.others.map((example) => example.text)];
    };

    expect(shown("a reject 3?")).toEqual([["a keep 1?"], ["b reject 2?"]]);
    expect(shown("a keep 1?")).toEqual([[], []]);
    // A question with no decision of its own, or none named at all, is shown them all, as before.
    const all = [["a keep 1?", "a reject 3?", "a keep 4?"], ["b reject 2?", "b keep 5?"]];
    expect(shown("Never decided?")).toEqual(all);
    expect(shown()).toEqual(all);
  });

  test("the label follows the decisions", () => {
    const decisions = [decision(1, "a")];
    expect(contextLabel(decisions)).toMatch(/^owner-v2-[0-9a-f]{12}$/);
    expect(contextLabel(decisions)).toBe(contextLabel([decision(1, "a")]));
    expect(contextLabel(decisions)).not.toBe(contextLabel([decision(2, "a")]));
  });
});

describe("picking the best of each batch", () => {
  test("a question is picked only on a keep at confidence 4 or 5 with nothing against it", () => {
    expect(PICK_MIN_CONFIDENCE).toBe(4);
    expect(clearsBar(verdict(5))).toBe(true);
    expect(clearsBar(verdict(4))).toBe(true);
    expect(clearsBar(verdict(3))).toBe(false);
    expect(clearsBar(verdict(5, "hold", ["awkward_wording"]))).toBe(false);
    expect(clearsBar(verdict(5, "keep", ["awkward_wording"]))).toBe(false);
    expect(clearsBar(verdict(5, "keep", [], ["politics_religion"]))).toBe(false);
    expect(clearsBar(undefined)).toBe(false);
  });

  const question = (seedId: string, n: number, v: Verdict | undefined) => ({
    text: `${seedId} question ${n}?`,
    seedId,
    style: "Style A",
    tone: "Tone T",
    topic: seedId === "s2" ? "Food" : null,
    verdict: v,
  });
  const questions = [
    // s1: two at 5, two at 4, one at 3, one hold. The two 5s and one 4 are picked.
    question("s1", 1, verdict(4)),
    question("s1", 2, verdict(5)),
    question("s1", 3, verdict(3)),
    question("s1", 4, verdict(5)),
    question("s1", 5, verdict(4)),
    question("s1", 6, verdict(5, "hold", ["unclear_answer"])),
    // s2: only one clears the bar.
    question("s2", 1, verdict(4)),
    question("s2", 2, verdict(2)),
    question("s2", 3, verdict(4, "hold", ["awkward_wording"])),
    // s3: none clears it, so nothing is picked, and a control is still drawn.
    question("s3", 1, verdict(3)),
    question("s3", 2, verdict(5, "keep", [], ["painful_disclosure"])),
    // Never judged: left out of everything.
    question("s3", 3, undefined),
  ];

  test("takes the surest that clear the bar, fewer when fewer do, and draws controls from the rest of the batch", () => {
    const { cards, key } = drawSet({ name: "t1", questions, pick: 3, controls: 1, start: 363 });

    expect(key.counts).toEqual({ seeds: 3, judged: 11, cleared: 5, picked: 4, controls: 3, seedsWithoutPick: 1 });
    expect(cards.map((card) => card.id)).toEqual(Array.from({ length: 7 }, (_, i) => `q${363 + i}`));
    expect(cards.map((card) => card.order)).toEqual(Array.from({ length: 7 }, (_, i) => 363 + i));
    // A card carries what the owner is shown and nothing about its group or the judge.
    for (const card of cards) expect(Object.keys(card).sort()).toEqual(["id", "order", "style", "text", "tone", "topic"]);
    expect(cards.find((card) => card.text.startsWith("s2"))?.topic).toBe("Food");

    const byText = (group: string) =>
      cards.filter((card) => key.groups[card.id].group === group).map((card) => card.text).sort();
    const picked = byText("picked");
    expect(picked).toContain("s1 question 2?");
    expect(picked).toContain("s1 question 4?");
    expect(picked.filter((text) => /^s1 question [15]\?$/.test(text))).toHaveLength(1);
    expect(picked).toContain("s2 question 1?");
    expect(picked).toHaveLength(4);
    const controls = byText("control");
    expect(controls).toHaveLength(3);
    expect(controls.map((text) => text.slice(0, 2)).sort()).toEqual(["s1", "s2", "s3"]);
    for (const text of controls) expect(picked).not.toContain(text);
    expect(cards.map((card) => card.text)).not.toContain("s3 question 3?");
    const s2pick = cards.find((card) => card.text === "s2 question 1?")!;
    expect(key.groups[s2pick.id]).toEqual({ group: "picked", seedId: "s2", verdict: "keep", confidence: 4 });
  });

  test("the same name gives the same set, another name another order, and ids pad to three digits from 1", () => {
    const draw = (name: string) => drawSet({ name, questions, pick: 3, controls: 1 });
    expect(draw("t1")).toEqual(draw("t1"));
    expect(draw("t1").cards.map((card) => card.text)).not.toEqual(draw("t2").cards.map((card) => card.text));
    expect(draw("t1").cards[0].id).toBe("q001");
    // No controls asked for, none drawn.
    expect(drawSet({ name: "t1", questions, pick: 1, controls: 0 }).key.counts).toMatchObject({ picked: 2, controls: 0 });
  });
});

describe("reading the owner's labels on a drawn set", () => {
  /** A key with `picked` picked cards and `controls` controls out of `judged` questions. */
  const keyOf = (picked: number, controls: number, judged: number) => ({
    counts: { judged, picked },
    groups: Object.fromEntries([
      ...Array.from({ length: picked }, (_, i) => [`p${i}`, { group: "picked" }]),
      ...Array.from({ length: controls }, (_, i) => [`c${i}`, { group: "control" }]),
    ]),
  });
  const labelsOf = (key: ReturnType<typeof keyOf>, rejectIds: string[], skip: string[] = []) =>
    Object.fromEntries(
      Object.keys(key.groups)
        .filter((id) => !skip.includes(id))
        .map((id) => [id, { verdict: rejectIds.includes(id) ? "reject" : "keep" }]),
    );

  test("the first blind set's rule on the picked cards: at most 1 in 20 rejected, on 60 or more, all labeled", () => {
    const key = keyOf(60, 20, 160);
    const pass = scoreSet({ key, labels: labelsOf(key, ["p1", "p2", "p3", "c1", "c2", "c3", "c4", "c5", "c6"]) });
    expect(pass.rule).toEqual({ decided: true, pass: true, rejected: 3, allowed: 3, of: 60 });
    expect(pass.picked).toEqual({ cards: 60, labeled: 60, rejected: 3, rate: 0.05 });
    expect(pass.control).toEqual({ cards: 20, labeled: 20, rejected: 6, rate: 0.3 });
    // 60 of the 160 were picked: 3/8 of a batch at 5% and 5/8 at 30%.
    expect(pass.wholeBatch).toBeCloseTo((60 / 160) * 0.05 + (100 / 160) * 0.3, 10);

    const fail = scoreSet({ key, labels: labelsOf(key, ["p1", "p2", "p3", "p4"]) });
    expect(fail.rule).toEqual({ decided: true, pass: false, rejected: 4, allowed: 3, of: 60 });
    expect(MIN_PASS_CARDS).toBe(60);
  });

  test("an unsure counts as a reject, and the rule waits for every picked card and for 60 of them", () => {
    const key = keyOf(60, 2, 100);
    const labels: Record<string, { verdict: string }> = labelsOf(key, [], ["p59", "c1"]);
    labels.p0 = { verdict: "unsure" };
    const waiting = scoreSet({ key, labels });
    expect(waiting.picked).toMatchObject({ cards: 60, labeled: 59, rejected: 1 });
    expect(waiting.control).toMatchObject({ cards: 2, labeled: 1, rejected: 0, rate: 0 });
    expect(waiting.rule).toEqual({ decided: false, reason: "1 picked cards have no label yet." });

    const small = keyOf(59, 0, 100);
    const few = scoreSet({ key: small, labels: labelsOf(small, []) });
    expect(few.rule).toEqual({ decided: false, reason: "Needs at least 60 picked cards; there are 59." });
    // With no controls labeled there is no whole-batch estimate.
    expect(few.control.rate).toBeNull();
    expect(few.wholeBatch).toBeNull();
  });
});
