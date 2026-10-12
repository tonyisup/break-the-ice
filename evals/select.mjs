// Picks the best of each batch in a judged run and has the owner label them blind.
//   node evals/select.mjs draw <name> <judged-name> [--pick <n>] [--controls <n>] [--start <n>]
//   node evals/select.mjs score <name> <labels.json>
// draw reads evals/judged/<judged-name>.json (from judge.mjs, usually with --context) and the runs
// it names, picks up to --pick questions a seed (3 unless said) that the judge kept at confidence
// 4 or 5 with nothing against them, adds --controls (1 unless said) drawn at random from the rest
// of each batch, and writes evals/judged/<name>/cards.json, for the labeling page, and key.json,
// which says which card is which and stays on this machine. --start numbers the cards from there
// (one past the last card already on the labeling page). score reads the owner's labels, a JSON
// object from card id to { "verdict": "keep" | "reject" | "unsure" }, and applies the first blind
// set's rule to the picked cards. evals/judged/ is git-ignored.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { savedQuestions } from "./judgeRecord.mjs";
import { writeJson } from "./runRecord.mjs";
import { PICK_MIN_CONFIDENCE, drawSet, scoreSet } from "./selectRecord.mjs";

const USAGE = [
  "Usage: node evals/select.mjs draw <name> <judged-name> [--pick <n>] [--controls <n>] [--start <n>]",
  "       node evals/select.mjs score <name> <labels.json>",
  "(names: lowercase letters, digits and dashes)",
].join("\n");
const here = dirname(fileURLToPath(import.meta.url));
const [command, name, ...rest] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const named = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
if (!["draw", "score"].includes(command) || !named(name)) fail(USAGE);
const dir = join(here, "judged", name);
const cardsPath = join(dir, "cards.json");
const keyPath = join(dir, "key.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const percent = (rate) => (rate === null ? "n/a" : `${Math.round(rate * 100)}%`);

if (command === "draw") {
  const [judgedName, ...flags] = rest;
  const options = { "--pick": 3, "--controls": 1, "--start": 1 };
  if (!named(judgedName) || flags.length % 2) fail(USAGE);
  for (let i = 0; i < flags.length; i += 2) {
    if (!Object.hasOwn(options, flags[i]) || !/^\d{1,4}$/.test(flags[i + 1])) fail(USAGE);
    options[flags[i]] = Number(flags[i + 1]);
  }
  if (options["--pick"] < 1 || options["--start"] < 1) fail(USAGE);
  // A set the owner may already be labeling is never redrawn under the same name.
  if (existsSync(cardsPath) || existsSync(keyPath)) fail(`${dir} already holds a set. Use a new name.`);
  const judgedPath = join(here, "judged", `${judgedName}.json`);
  if (!existsSync(judgedPath)) fail(`Run node evals/judge.mjs ${judgedName} <run>... first.`);
  const judged = readJson(judgedPath);
  // The run names become paths, so they are checked like the names given on the command line.
  if (!Array.isArray(judged.runs) || !judged.runs.every(named)) fail(`${judgedPath} doesn't say which runs it was judged from.`);
  const runs = judged.runs.map((run) => {
    const path = join(here, "runs", run, "generated.json");
    if (!existsSync(path)) fail(`Run "${run}", which "${judgedName}" was judged from, has no generated.json.`);
    return { run, generated: readJson(path) };
  });
  const verdicts = new Map(judged.results.filter((result) => result.verdict).map((result) => [result.text, result.verdict]));
  const saved = savedQuestions(runs);
  const unjudged = saved.filter((question) => !verdicts.has(question.text)).length;
  if (unjudged) fail(`${unjudged} of the runs' ${saved.length} questions aren't judged in "${judgedName}". Rerun judge.mjs for it first.`);
  // Seeds are told apart across runs, so two runs of the same seeds stay two batches.
  const questions = saved.map((question) => ({
    text: question.text,
    seedId: `${question.run}:${question.seedId}`,
    style: question.style.name,
    tone: question.tone.name,
    topic: question.topic?.name ?? null,
    verdict: verdicts.get(question.text),
  }));
  const { cards, key } = drawSet({ name, questions, pick: options["--pick"], controls: options["--controls"], start: options["--start"] });
  if (!cards.length) fail("Nothing to draw: the runs saved no question, or none was kept at the bar and no controls were asked for.");
  mkdirSync(dir, { recursive: true });
  writeJson(cardsPath, cards);
  writeJson(keyPath, { ...key, judged: judgedName, context: judged.context ?? null });
  const { counts } = key;
  console.log(
    `${counts.judged} questions in ${counts.seeds} batches: ${counts.cleared} were kept at confidence ${PICK_MIN_CONFIDENCE} or 5 with nothing against them. ` +
      `Picked ${counts.picked} (${counts.seedsWithoutPick} batches had none to pick) and drew ${counts.controls} from the rest.`,
  );
  console.log(`${cards.length} cards, ${cards[0].id} to ${cards.at(-1).id}, written to ${dir}.`);
} else {
  const [labelsFile, ...extra] = rest;
  if (!labelsFile || extra.length) fail(USAGE);
  if (!existsSync(keyPath)) fail(`No set named "${name}". Run draw first.`);
  if (!existsSync(labelsFile)) fail(`${labelsFile} doesn't exist.`);
  const result = scoreSet({ key: readJson(keyPath), labels: readJson(labelsFile) });
  writeJson(join(dir, "result.json"), result);
  const line = (label, side) => `${label}: ${side.labeled} of ${side.cards} labeled, ${side.rejected} rejected (${percent(side.rate)}).`;
  console.log(line("Picked", result.picked));
  console.log(line("From the rest of each batch", result.control));
  console.log(`With no picking, about ${percent(result.wholeBatch)} of a batch would be rejected.`);
  const { rule } = result;
  console.log(
    rule.decided
      ? `Pass rule: ${rule.pass ? "PASS" : "FAIL"}. The owner rejected ${rule.rejected} of ${rule.of} picked cards; at most ${rule.allowed} are allowed.`
      : `Pass rule: not decided. ${rule.reason}`,
  );
}
