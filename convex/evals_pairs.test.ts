// The seeded shuffle the blind sets are drawn with (evals/brief.mjs), the seeds files, and the
// blind pairs built from two runs (evals/pairsRecord.mjs). Nothing here touches the network or the
// owner's real decisions.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { seededShuffle } from "../evals/brief.mjs";
import { CHOICES, buildPairs, isNearCopy, scorePairs, signTest, wordRuns } from "../evals/pairsRecord.mjs";

describe("the seeded shuffle", () => {
  test("a seeded shuffle keeps every item, depends only on its key and leaves the input alone", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const shuffled = seededShuffle(items, "k");
    expect(shuffled).toEqual(seededShuffle(items, "k"));
    expect(shuffled).not.toEqual(items);
    expect(shuffled).not.toEqual(seededShuffle(items, "other"));
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items[0]).toBe(0);
  });

  test("a key keeps giving the same order, which sets already drawn depend on", () => {
    // The orders the shuffle gave when the brief moved into the app. They must never change.
    expect(seededShuffle(Array.from({ length: 12 }, (_, i) => i), "k")).toEqual([8, 4, 1, 7, 9, 2, 11, 10, 5, 0, 3, 6]);
    expect(seededShuffle(["a", "b", "c", "d", "e", "f"], "pairs:t1")).toEqual(["e", "b", "f", "d", "a", "c"]);
  });
});

describe("the seeds files", () => {
  const evals = join(__dirname, "..", "evals");
  const seedsOf = (file: string) => JSON.parse(readFileSync(join(evals, file), "utf8")).seeds as Array<{ style: string; tone: string }>;

  test("the new cells are new: no style and tone pair of theirs is one the first seeds use", () => {
    const pairsOf = (file: string) => seedsOf(file).map((seed) => `${seed.style}/${seed.tone}`);
    expect(pairsOf("seeds-new-cells.json").filter((pair) => pairsOf("seeds.json").includes(pair))).toEqual([]);
    expect(new Set(pairsOf("seeds-new-cells.json")).size).toBe(24);
  });

  test("brief.json has a name for every style and tone the shipped seeds use", () => {
    // judge.mjs --context shows the judge a decision's style and tone by these names.
    const names = JSON.parse(readFileSync(join(evals, "brief.json"), "utf8"));
    for (const file of ["seeds.json", "seeds-new-cells.json"]) {
      const unnamed = seedsOf(file).flatMap((seed) => [
        ...(names.styles[seed.style]?.name ? [] : [`styles/${seed.style}`]),
        ...(names.tones[seed.tone]?.name ? [] : [`tones/${seed.tone}`]),
      ]);
      expect(unnamed, file).toEqual([]);
    }
  });
});

describe("blind pairs", () => {
  const definitions = (style: string, topic: string | null = null) => ({
    style: { slug: style, name: style.toUpperCase(), definition: "…" },
    tone: { slug: "bold", name: "Bold", definition: "…" },
    topic: topic ? { slug: topic, name: "Food", definition: "…" } : null,
  });
  const candidate = (text: string, outcome = "saved") => ({ text, outcome });
  const batch = (seedId: string, style: string, texts: Array<string | ReturnType<typeof candidate>>, topic: string | null = null) => ({
    seed: { id: seedId },
    ok: true,
    result: { definitions: definitions(style, topic), candidates: texts.map((text) => (typeof text === "string" ? candidate(text) : text)) },
  });
  const seedIds = Array.from({ length: 6 }, (_, i) => `s${i + 1}`);
  const run = (name: string, perSeed = 4) => ({
    run: name,
    generated: { batches: seedIds.map((id) => batch(id, `style-${id}`, Array.from({ length: perSeed }, (_, i) => `${name} ${id} question ${i}?`))) },
  });

  test("each round holds one pair per seed, sides are drawn evenly, and the page's cards say nothing of the runs", () => {
    const { pairs, key, leftOut } = buildPairs({ name: "t1", a: run("app"), b: run("brief"), perSeed: 3 });

    expect(pairs).toHaveLength(18);
    expect(pairs.map((pair) => pair.id)).toEqual(Array.from({ length: 18 }, (_, i) => `p${String(i + 1).padStart(3, "0")}`));
    expect(pairs.map((pair) => pair.order)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    for (const round of [1, 2, 3]) {
      const inRound = pairs.filter((pair) => pair.round === round);
      expect(inRound.map((pair) => key.sides[pair.id].seedId).sort()).toEqual(seedIds);
      expect(inRound.filter((pair) => key.sides[pair.id].left === "a")).toHaveLength(3);
    }
    for (const pair of pairs) {
      expect(Object.keys(pair).sort()).toEqual(["id", "left", "order", "right", "round", "style", "tone", "topic"]);
      const { seedId, left } = key.sides[pair.id];
      expect(pair.style).toBe(`STYLE-${seedId.toUpperCase()}`);
      expect(pair.left.startsWith(left === "a" ? "app" : "brief"), pair.id).toBe(true);
      expect(pair.right.startsWith(left === "a" ? "brief" : "app"), pair.id).toBe(true);
      expect(pair.left).toContain(` ${seedId} `);
      expect(pair.right).toContain(` ${seedId} `);
    }
    // No question is used twice.
    expect(new Set(pairs.flatMap((pair) => [pair.left, pair.right])).size).toBe(36);
    expect(key).toMatchObject({ name: "t1", a: "app", b: "brief", perSeed: 3 });
    expect(leftOut).toEqual({ a: 0, b: 0 });
    // Seeds aren't shown in the same order every round.
    const order = (round: number) => pairs.filter((pair) => pair.round === round).map((pair) => key.sides[pair.id].seedId).join();
    expect(new Set([order(1), order(2), order(3)]).size).toBeGreaterThan(1);
  });

  test("the same name and runs give the same pairs, and another name draws them again", () => {
    const build = (name: string) => buildPairs({ name, a: run("app"), b: run("brief"), perSeed: 4 });
    expect(build("t1")).toEqual(build("t1"));
    expect(build("t1").pairs.map((pair) => pair.left)).not.toEqual(build("t2").pairs.map((pair) => pair.left));
  });

  test("leaves out unsaved questions, near copies of ones already judged and ones both runs wrote, and pairs what is left", () => {
    const judged = "Which one album would you keep if every other record you own vanished tonight?";
    const a = {
      run: "app",
      generated: {
        batches: [
          batch("s1", "x", ["App one?", "Which ONE album would you keep if every other record you own vanished — tonight?", "Both wrote this?", candidate("Dup?", "duplicate")], "food"),
          batch("s2", "y", ["App two?"]),
          { seed: { id: "s3" }, ok: false, failures: [] },
        ],
      },
    };
    const b = {
      run: "brief",
      generated: { batches: [batch("s1", "x", ["Brief one?", "Brief two?", "Both wrote this?"], "food"), batch("s3", "z", ["Brief three?"])] },
    };

    const { pairs, key, leftOut } = buildPairs({ name: "t1", a, b, perSeed: 4, seen: [judged] });

    expect(pairs).toHaveLength(1);
    expect([pairs[0].left, pairs[0].right].sort()).toEqual(["App one?", expect.stringMatching(/^Brief (one|two)\?$/)]);
    expect(pairs[0].topic).toBe("Food");
    expect(key.sides).toEqual({ p001: { seedId: "s1", left: expect.stringMatching(/^[ab]$/) } });
    expect(leftOut).toEqual({ a: 2, b: 1 });
  });

  test("a near copy shares eight words in a row, whatever the case or punctuation", () => {
    const runs = wordRuns(["If you could keep only one kitchen gadget forever, which is it?"]);
    expect(isNearCopy("So: if you could keep ONLY one kitchen gadget, what then?", runs)).toBe(true);
    expect(isNearCopy("If you could keep only one kitchen tool forever, which is it?", runs)).toBe(false);
    expect(isNearCopy("Short one?", runs)).toBe(false);
  });

  test("a judged question shorter than eight words is a near copy of itself only, and is left out like any other", () => {
    const runs = wordRuns(["Tea or coffee?"]);
    expect(isNearCopy("Tea or coffee?", runs)).toBe(true);
    expect(isNearCopy("TEA, or coffee!", runs)).toBe(true);
    expect(isNearCopy("Tea or cocoa?", runs)).toBe(false);
    // A longer question that only starts with it is another question.
    expect(isNearCopy("Tea or coffee first thing on a slow Sunday morning?", runs)).toBe(false);

    const a = { run: "app", generated: { batches: [batch("s1", "x", ["tea or COFFEE", "App one?"])] } };
    const b = { run: "brief", generated: { batches: [batch("s1", "x", ["Brief one?", "Tea or cocoa?"])] } };
    const { pairs, leftOut } = buildPairs({ name: "t1", a, b, perSeed: 4, seen: ["Tea or coffee?"] });

    expect(leftOut).toEqual({ a: 1, b: 0 });
    expect(pairs.flatMap((pair) => [pair.left, pair.right]).sort()).toEqual(["App one?", expect.stringMatching(/^(Brief one|Tea or cocoa)\?$/)]);
  });

  test("the sign test is exact and two-sided", () => {
    expect(signTest(5, 10)).toBe(1);
    expect(signTest(0, 0)).toBe(1);
    expect(signTest(10, 10)).toBeCloseTo(2 / 1024, 10);
    expect(signTest(0, 10)).toBeCloseTo(2 / 1024, 10);
    expect(signTest(8, 10)).toBeCloseTo((2 * (45 + 10 + 1)) / 1024, 10);
    expect(signTest(41, 64)).toBeLessThan(0.05);
    expect(signTest(40, 64)).toBeGreaterThan(0.05);
  });

  describe("reading the choices", () => {
    const { pairs, key } = buildPairs({ name: "t1", a: run("app"), b: run("brief"), perSeed: 4 });
    /** Chooses the side holding run `pick` in every pair of the rounds given, or the fixed choice. */
    const choose = (rounds: number[], pick: (pairId: string, i: number) => "a" | "b" | "both" | "neither") => {
      const choices: Record<string, string> = {};
      pairs.filter((pair) => rounds.includes(pair.round)).forEach((pair, i) => {
        const want = pick(pair.id, i);
        choices[pair.id] = want === "both" || want === "neither" ? want : (key.sides[pair.id].left === want ? "left" : "right");
      });
      return choices;
    };

    test("counts whole rounds only, from the first, and maps each side back to its run", () => {
      const choices = { ...choose([1, 2, 3], () => "b"), ...choose([4], (_, i) => (i < 3 ? "a" : "b")) };
      delete choices[pairs.find((pair) => pair.round === 4)!.id];

      const result = scorePairs({ pairs, key, choices });

      expect(result).toMatchObject({ rounds: 3, counted: 18, answered: 23, picks: 18, verdict: "b", runs: { a: "app", b: "brief" } });
      expect(result.tally).toEqual({ a: 0, b: 18, both: 0, neither: 0 });
      expect(result.seedLeans).toEqual({ a: 0, b: 6, even: 0 });
      expect(result.p).toBeCloseTo(2 / 2 ** 18, 12);

      // A gap in round 2 stops the count at round 1, however much later rounds hold.
      const gap = { ...choices };
      delete gap[pairs.find((pair) => pair.round === 2)!.id];
      expect(scorePairs({ pairs, key, choices: gap })).toMatchObject({ rounds: 1, counted: 6, verdict: "too few rounds" });
    });

    test("a set of one or two rounds in all is too few to read, however one-sided the picks", () => {
      for (const perSeed of [1, 2]) {
        const small = buildPairs({ name: "t1", a: run("app"), b: run("brief"), perSeed });
        const choices = Object.fromEntries(small.pairs.map((pair) => [pair.id, small.key.sides[pair.id].left === "b" ? "left" : "right"]));

        const result = scorePairs({ pairs: small.pairs, key: small.key, choices });

        expect(result, `${perSeed} rounds`).toMatchObject({ rounds: perSeed, counted: perSeed * 6, tally: { a: 0, b: perSeed * 6 }, verdict: "too few rounds" });
        // The picks alone would have called it.
        expect(result.p, `${perSeed} rounds`).toBeLessThan(0.05);
      }
    });

    test("ties are counted but don't decide it, an even split shows no difference, and a made-up choice isn't an answer", () => {
      const cycle = ["a", "b", "both", "neither"] as const;
      const mixed = scorePairs({ pairs, key, choices: choose([1, 2, 3, 4], (_, i) => cycle[i % 4]) });
      expect(mixed).toMatchObject({ rounds: 4, counted: 24, picks: 12, p: 1, verdict: "no difference shown" });
      expect(mixed.tally).toEqual({ a: 6, b: 6, both: 6, neither: 6 });

      const appWins = scorePairs({ pairs, key, choices: choose([1, 2, 3, 4], (_, i) => (i % 6 === 0 ? "both" : "a")) });
      expect(appWins).toMatchObject({ picks: 20, verdict: "a" });
      expect(appWins.tally).toEqual({ a: 20, b: 0, both: 4, neither: 0 });

      const odd = { ...choose([1, 2, 3, 4], () => "a"), [pairs[0].id]: "maybe" };
      expect(scorePairs({ pairs, key, choices: odd })).toMatchObject({ rounds: 0, answered: 23, verdict: "too few rounds" });
      expect(CHOICES).toEqual(["left", "right", "both", "neither"]);
    });
  });
});
