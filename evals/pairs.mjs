// Sets two generated runs side by side for the owner to choose between, blind, and reads the result.
//   node evals/pairs.mjs build <name> <run-a> <run-b> [--per-seed <n>]
//   node evals/pairs.mjs score <name> <choices.json>
// build pairs each seed's questions from the two runs (generate both on the same seeds first) and
// writes evals/judged/<name>/pairs.json, for the labeling page, and key.json, which says which
// side is which run and stays on this machine. score reads the owner's choices, a JSON object from
// pair id to "left", "right", "both" or "neither", and prints which run was picked more often.
// evals/judged/ is git-ignored: the questions and the owner's choices stay out of the repo.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_ROUNDS, PICK_ALPHA, buildPairs, scorePairs } from "./pairsRecord.mjs";
import { writeJson } from "./runRecord.mjs";

const USAGE = [
  "Usage: node evals/pairs.mjs build <name> <run-a> <run-b> [--per-seed <n>]",
  "       node evals/pairs.mjs score <name> <choices.json>",
  "(names: lowercase letters, digits and dashes)",
].join("\n");
const here = dirname(fileURLToPath(import.meta.url));
const [command, name, ...rest] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const named = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
if (!["build", "score"].includes(command) || !named(name)) fail(USAGE);
const dir = join(here, "judged", name);
const pairsPath = join(dir, "pairs.json");
const keyPath = join(dir, "key.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

if (command === "build") {
  const [runA, runB, ...flags] = rest;
  let perSeed = 4;
  if (flags.length === 2 && flags[0] === "--per-seed" && /^[1-9]\d?$/.test(flags[1])) perSeed = Number(flags[1]);
  else if (flags.length) fail(USAGE);
  if (!named(runA) || !named(runB) || runA === runB) fail(USAGE);
  // Pairs the owner may already be choosing between are never redrawn under the same name.
  if (existsSync(pairsPath) || existsSync(keyPath)) fail(`${dir} already holds pairs. Use a new name.`);
  const load = (run) => {
    const path = join(here, "runs", run, "generated.json");
    if (!existsSync(path)) fail(`Run node evals/generate.mjs ${run} first.`);
    return { run, generated: readJson(path) };
  };
  const [a, b] = [load(runA), load(runB)];
  const decisionsPath = join(here, "judged", "owner-decisions.json");
  const seen = existsSync(decisionsPath) ? readJson(decisionsPath).map((decision) => decision.text) : [];
  const { pairs, key, leftOut } = buildPairs({ name, a, b, perSeed, seen });
  if (!pairs.length) fail("The two runs share no seed with a saved question in each.");
  mkdirSync(dir, { recursive: true });
  writeJson(pairsPath, pairs);
  writeJson(keyPath, key);
  const rounds = Math.max(...pairs.map((pair) => pair.round));
  const perRound = Array.from({ length: rounds }, (_, r) => pairs.filter((pair) => pair.round === r + 1).length);
  console.log(`${pairs.length} pairs in ${rounds} rounds (${perRound.join(", ")}) written to ${dir}.`);
  console.log(`Left out as near copies of questions already judged, or written by both runs: ${leftOut.a} from ${runA}, ${leftOut.b} from ${runB}.`);
  if (!existsSync(decisionsPath)) console.log(`${decisionsPath} doesn't exist, so no question was checked against ones the owner has already judged.`);
  if (rounds < MIN_ROUNDS) console.log(`That is fewer than the ${MIN_ROUNDS} whole rounds score needs, so this set can't give a result.`);
} else {
  const [choicesFile, ...extra] = rest;
  if (!choicesFile || extra.length) fail(USAGE);
  if (!existsSync(pairsPath) || !existsSync(keyPath)) fail(`No pairs named "${name}". Run build first.`);
  if (!existsSync(choicesFile)) fail(`${choicesFile} doesn't exist.`);
  const result = scorePairs({ pairs: readJson(pairsPath), key: readJson(keyPath), choices: readJson(choicesFile) });
  writeJson(join(dir, "result.json"), result);
  const { tally, runs } = result;
  console.log(`${result.answered} pairs answered; ${result.counted} counted, in ${result.rounds} whole rounds.`);
  console.log(`Picked ${runs.a}: ${tally.a}. Picked ${runs.b}: ${tally.b}. Both fine: ${tally.both}. Neither: ${tally.neither}.`);
  console.log(`Sign test on the ${result.picks} pairs with a pick: p = ${result.p.toFixed(4)} (a run is called better below ${PICK_ALPHA}).`);
  console.log(`Seeds leaning to ${runs.a}: ${result.seedLeans.a}; to ${runs.b}: ${result.seedLeans.b}; even: ${result.seedLeans.even}.`);
  console.log(
    result.verdict === "too few rounds"
      ? `Too few whole rounds to read (${MIN_ROUNDS} needed).`
      : result.verdict === "no difference shown"
        ? "No difference shown."
        : `${runs[result.verdict]} was picked more often.`,
  );
}
