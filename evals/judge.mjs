// Runs the quality check over the questions some generated runs would have saved, on the dev
// deployment (internal/qualityCheck:evalQualityCheck), and writes its verdicts to
// evals/judged/<name>.json. Nothing is saved on any question. Rerunning the same name judges
// only what is still missing. When evals/owner-labels.json exists, it also sets the verdicts
// beside the owner's labels and evaluates the pass rule. --only-labeled judges just the
// questions that file has labels for.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mapLimit } from "./async.mjs";
import { assertDevTarget } from "./devTarget.mjs";
import { compareWithLabels, passRule, savedQuestions } from "./judgeRecord.mjs";
import { writeJson } from "./runRecord.mjs";

// A call judges its questions one after another, a few seconds each.
const QUESTIONS_PER_CALL = 10;
const CALL_CONCURRENCY = 2;
// What a check cost on Opus 5.5 in Oct 2026, for the estimate printed before a paid run.
const USD_PER_CHECK = 0.006;

const USAGE = "Usage: node evals/judge.mjs <name> <run>... [--only-labeled]   (names: lowercase letters, digits and dashes)";
const [name, ...rest] = process.argv.slice(2);
const onlyLabeled = rest.includes("--only-labeled");
const runNames = rest.filter((arg) => arg !== "--only-labeled");
const validName = (value) => /^[a-z0-9][a-z0-9-]*$/.test(value);
if (!name || !validName(name) || runNames.length === 0 || !runNames.every(validName) || new Set(runNames).size !== runNames.length) {
  console.error(USAGE);
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
assertDevTarget(root);

const runs = runNames.map((run) => {
  const path = join(here, "runs", run, "generated.json");
  if (!existsSync(path)) {
    console.error(`Run "${run}" has no generated.json. Generate it first with evals/generate.mjs.`);
    process.exit(1);
  }
  return { run, generated: JSON.parse(readFileSync(path, "utf8")) };
});

const labelsPath = join(here, "owner-labels.json");
const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")).cards : null;
if (onlyLabeled && !labels) {
  console.error("--only-labeled needs evals/owner-labels.json, which doesn't exist.");
  process.exit(1);
}
const labeledTexts = new Set((labels ?? []).map((card) => card.text));
const questions = savedQuestions(runs).filter((question) => !onlyLabeled || labeledTexts.has(question.text));

const outDir = join(here, "judged");
const outPath = join(outDir, `${name}.json`);
mkdirSync(outDir, { recursive: true });
const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
// A question whose check failed before is tried again.
const byText = new Map((previous?.results ?? []).filter((result) => result.verdict).map((result) => [result.text, result]));
const todo = questions.filter((question) => !byText.has(question.text));

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", "convex") ? "+local" : ""}`;
const record = {
  name,
  createdAt: previous?.createdAt ?? new Date().toISOString(),
  runs: runNames,
  commits: [...new Set([...(previous?.commits ?? []), ...(todo.length ? [commit] : [])])],
  model: previous?.model ?? null,
  promptVersion: previous?.promptVersion ?? null,
};
// In the runs' order, so the file reads the same however the calls finished.
const save = () => writeJson(outPath, { ...record, results: questions.map((question) => byText.get(question.text)).filter(Boolean) });

const exec = promisify(execFile);
async function convexRun(fn, args) {
  const { stdout } = await exec("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.search(/[[{]/)));
}

let failures = 0;
if (todo.length) {
  console.log(`${todo.length} of ${questions.length} questions to judge for "${name}" at ${commit}, about $${(todo.length * USD_PER_CHECK).toFixed(2)}.`);
  const calls = [];
  for (let i = 0; i < todo.length; i += QUESTIONS_PER_CALL) calls.push(todo.slice(i, i + QUESTIONS_PER_CALL));
  await mapLimit(calls, CALL_CONCURRENCY, async (call) => {
    let answer;
    try {
      answer = await convexRun("internal/qualityCheck:evalQualityCheck", {
        items: call.map(({ text, style, tone, topic }) => ({ text, style, tone, topic })),
      });
    } catch (error) {
      failures += call.length;
      console.error(`A call of ${call.length} questions failed: ${String(error.stderr || error.message).trim().split("\n").pop()}`);
      return;
    }
    if (record.model !== null && (record.model !== answer.model || record.promptVersion !== answer.promptVersion)) {
      console.error(`"${name}" was judged by ${record.model} with instructions v${record.promptVersion}; the deployment now has ${answer.model} v${answer.promptVersion}. Start a new name.`);
      process.exit(1);
    }
    record.model = answer.model;
    record.promptVersion = answer.promptVersion;
    answer.results.forEach((result, index) => {
      const { run, seedId } = call[index];
      if (result.verdict) byText.set(result.text, { text: result.text, run, seedId, verdict: result.verdict, wouldPublish: result.wouldPublish });
      else {
        failures += 1;
        console.error(`Not judged (${result.error}): ${result.text}`);
      }
    });
    save();
  });
}
save();

const judged = questions.map((question) => byText.get(question.text)).filter(Boolean);
const publish = judged.filter((result) => result.wouldPublish).length;
console.log(`Judged ${judged.length} of ${questions.length}: the check would publish ${publish} and hold ${judged.length - publish}. Wrote ${outPath}.`);

if (labels) {
  const groups = compareWithLabels(judged, labels);
  for (const [group, counts] of Object.entries(groups)) {
    console.log(
      `${group}: ${counts.cards} labeled cards${counts.unjudged ? ` (${counts.unjudged} not judged here)` : ""}. ` +
        `Would publish ${counts.wouldPublish}, of which the owner rejected ${counts.wouldPublishRejected}. ` +
        `Would hold ${counts.wouldHold}, of which the owner kept ${counts.wouldHoldKept}.`,
    );
  }
  const rule = passRule(groups.would_publish);
  if (!rule.decided) console.log(`Pass rule: not decided. ${rule.reason}`);
  else console.log(`Pass rule: ${rule.pass ? "PASS" : "FAIL"}. The owner rejected ${rule.rejected} of ${rule.of} the check would publish; at most ${rule.allowed} are allowed.`);
}
if (failures) {
  console.error(`${failures} questions weren't judged. Rerun the same command to try them again.`);
  process.exit(1);
}
