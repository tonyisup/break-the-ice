// What pairs.mjs does with two generated runs and the owner's choices. Pure, so it can be tested.
import { seededShuffle } from "./brief.mjs";

/** A card sharing this many words in a row with a question the owner has already judged is left out. */
export const NEAR_COPY_WORDS = 8;
/** The result is read at whole rounds only (one pair per seed), and at no fewer than this many. */
export const MIN_ROUNDS = 3;
/** One way of asking is called better when the sign test on the pairs with a pick is below this. */
export const PICK_ALPHA = 0.05;
export const CHOICES = ["left", "right", "both", "neither"];

const wordsOf = (text) => text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

/** Every run of `length` words in a row found in `texts`. */
export function wordRuns(texts, length = NEAR_COPY_WORDS) {
  const runs = new Set();
  for (const text of texts) {
    const words = wordsOf(text);
    for (let i = 0; i + length <= words.length; i += 1) runs.add(words.slice(i, i + length).join(" "));
  }
  return runs;
}

/** Whether `text` repeats one of `runs`: a near copy of something already seen. */
export function isNearCopy(text, runs, length = NEAR_COPY_WORDS) {
  const words = wordsOf(text);
  for (let i = 0; i + length <= words.length; i += 1) {
    if (runs.has(words.slice(i, i + length).join(" "))) return true;
  }
  return false;
}

/**
 * Blind pairs from two runs generated on the same seeds: `a` and `b` are `{ run, generated }`.
 * Each pair sets one question from each run side by side for the same style, tone and topic. A
 * round holds one pair per seed, so stopping after any whole round keeps the seeds balanced.
 * Which side is which run is drawn evenly and kept apart in `key`, which the labeling page never
 * gets. Questions that nearly copy one in `seen` (texts the owner has already judged), or that
 * both runs wrote, are left out and counted. The same name and runs always give the same pairs.
 * @param {{ name: string, a: { run: string, generated: any }, b: { run: string, generated: any }, perSeed: number, seen?: string[] }} options
 */
export function buildPairs({ name, a, b, perSeed, seen = [] }) {
  const seenRuns = wordRuns(seen);
  const leftOut = { a: 0, b: 0 };
  const usable = (generated, side, shared) => {
    const bySeed = new Map();
    for (const batch of generated.batches ?? []) {
      if (!batch.ok || !batch.result) continue;
      const texts = [];
      for (const candidate of batch.result.candidates) {
        if (candidate.outcome !== "saved") continue;
        if (isNearCopy(candidate.text, seenRuns) || shared.has(candidate.text)) leftOut[side] += 1;
        else texts.push(candidate.text);
      }
      bySeed.set(batch.seed.id, { texts, definitions: batch.result.definitions });
    }
    return bySeed;
  };
  const savedTexts = (generated) =>
    new Set((generated.batches ?? []).flatMap((batch) => (batch.ok && batch.result ? batch.result.candidates : [])).filter((c) => c.outcome === "saved").map((c) => c.text));
  const inA = savedTexts(a.generated);
  const shared = new Set([...savedTexts(b.generated)].filter((text) => inA.has(text)));
  const fromA = usable(a.generated, "a", shared);
  const fromB = usable(b.generated, "b", shared);

  const rounds = [];
  for (const [seedId, sideA] of fromA) {
    const sideB = fromB.get(seedId);
    if (!sideB) continue;
    const textsA = seededShuffle(sideA.texts, `${name}:${seedId}:a`);
    const textsB = seededShuffle(sideB.texts, `${name}:${seedId}:b`);
    const count = Math.min(perSeed, textsA.length, textsB.length);
    for (let i = 0; i < count; i += 1) {
      (rounds[i] ??= []).push({ seedId, definitions: sideA.definitions, a: textsA[i], b: textsB[i] });
    }
  }

  const pairs = [];
  /** @type {Record<string, { seedId: string, left: "a" | "b" }>} */
  const sides = {};
  rounds.forEach((round, r) => {
    const shown = seededShuffle(round, `${name}:round:${r + 1}:order`);
    // Half of each round has run `a` on the left, give or take one.
    const lefts = seededShuffle(shown.map((_, i) => ((i + r) % 2 === 0 ? "a" : "b")), `${name}:round:${r + 1}:sides`);
    shown.forEach((pair, i) => {
      const id = `p${String(pairs.length + 1).padStart(3, "0")}`;
      const left = lefts[i];
      const { style, tone, topic } = pair.definitions;
      pairs.push({
        id,
        order: pairs.length + 1,
        round: r + 1,
        style: style.name,
        tone: tone.name,
        topic: topic?.name ?? null,
        left: left === "a" ? pair.a : pair.b,
        right: left === "a" ? pair.b : pair.a,
      });
      sides[id] = { seedId: pair.seedId, left };
    });
  });
  return { pairs, key: { name, a: a.run, b: b.run, perSeed, sides }, leftOut };
}

/** The two-sided exact sign test: how likely a split at least this uneven is when picks are a coin flip. */
export function signTest(wins, picks) {
  if (picks === 0) return 1;
  const most = Math.max(wins, picks - wins);
  let term = 0.5 ** picks; // P(X = 0)
  let tail = 0;
  for (let k = 0; k <= picks; k += 1) {
    if (k >= most) tail += term;
    term = (term * (picks - k)) / (k + 1);
  }
  return Math.min(1, 2 * tail);
}

/**
 * Reads the owner's choices against the key. Only whole rounds count: the rounds, from the first,
 * in which every pair has a choice. Among pairs where one question was picked, a run is called
 * better when the sign test is below PICK_ALPHA; "both" and "neither" pairs are counted and
 * reported but don't decide it. `choices` maps a pair's id to "left", "right", "both" or "neither".
 * @param {{ pairs: Array<{ id: string, round: number }>, key: { a: string, b: string, sides: Record<string, { seedId: string, left: "a" | "b" }> }, choices: Record<string, string> }} options
 */
export function scorePairs({ pairs, key, choices }) {
  const chosen = (pair) => (CHOICES.includes(choices[pair.id]) ? choices[pair.id] : null);
  const lastRound = Math.max(0, ...pairs.map((pair) => pair.round));
  let rounds = 0;
  while (rounds < lastRound && pairs.filter((pair) => pair.round === rounds + 1).every(chosen)) rounds += 1;
  const counted = pairs.filter((pair) => pair.round <= rounds);

  const tally = { a: 0, b: 0, both: 0, neither: 0 };
  const seeds = new Map();
  for (const pair of counted) {
    const { seedId, left } = key.sides[pair.id];
    const choice = chosen(pair);
    const outcome = choice === "both" || choice === "neither" ? choice : (choice === "left") === (left === "a") ? "a" : "b";
    tally[outcome] += 1;
    const seed = seeds.get(seedId) ?? { a: 0, b: 0, both: 0, neither: 0 };
    seed[outcome] += 1;
    seeds.set(seedId, seed);
  }
  const picks = tally.a + tally.b;
  const p = signTest(tally.a, picks);
  const seedLeans = { a: 0, b: 0, even: 0 };
  for (const seed of seeds.values()) seedLeans[seed.a > seed.b ? "a" : seed.b > seed.a ? "b" : "even"] += 1;
  const verdict =
    rounds < Math.min(MIN_ROUNDS, lastRound) ? "too few rounds" : p >= PICK_ALPHA ? "no difference shown" : tally.a > tally.b ? "a" : "b";
  return {
    rounds,
    counted: counted.length,
    answered: pairs.filter(chosen).length,
    tally,
    picks,
    p,
    seedLeans,
    verdict,
    runs: { a: key.a, b: key.b },
  };
}
