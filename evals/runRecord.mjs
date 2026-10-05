import { renameSync, writeFileSync } from "node:fs";

/** Writes JSON through a temp file and a rename, so an interrupted write never leaves half a file. */
export function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

// How generate.mjs keeps a run's record across reruns. Pure, so the resume rule can be tested.

/** Seeds still to generate: those without a successful batch. */
export function pendingSeeds(seeds, batches) {
  return seeds.filter((seed) => !batches.get(seed.id)?.ok);
}

/** Keeps earlier failed attempts: the failure history is part of the result. */
export function recordSuccess(batches, seed, result, commit) {
  batches.set(seed.id, { seed, ok: true, commit, failures: batches.get(seed.id)?.failures ?? [], result });
}

export function recordFailure(batches, seed, message, commit) {
  const failure = { stage: classifyFailure(message), commit, message };
  batches.set(seed.id, { seed, ok: false, failures: [...(batches.get(seed.id)?.failures ?? []), failure] });
}

/** Batches in seeds.json order, skipping seeds never attempted. */
export function orderedBatches(seeds, batches) {
  return seeds.map((seed) => batches.get(seed.id)).filter(Boolean);
}

/**
 * Which step a failed `npx convex run` broke at, from the error code or message. Generation
 * failures are counted from the deployment's own run records; the rest explain batches that never
 * came back.
 */
export function classifyFailure(message) {
  const text = String(message ?? "");
  if (/EVALS_DISABLED|EVAL_SETUP|AI_MODEL_NAME|Could not find (public )?function|No active \w+ entry/.test(text)) return "setup";
  if (/AI_BUDGET_PAUSED|paused for today/.test(text)) return "budget";
  if (/could not be read|empty completion|had no questions|AI_GENERATION_FAILED|cut off/.test(text)) return "generation";
  if (/Uncaught|Server Error/.test(text)) return "server";
  return "cli";
}

/** Adds newly fetched generation runs to the record, once each; a fresh read replaces an older one. */
export function mergeAttempts(existing, fresh) {
  const byRun = new Map(existing.map((attempt) => [attempt.runId, attempt]));
  for (const attempt of fresh) byRun.set(attempt.runId, attempt);
  return [...byRun.values()];
}

/** The last lines of a failed CLI call's output, where the cause is. */
export function cliError(error) {
  return (error?.stderr || error?.message || String(error)).trim().split("\n").slice(-3).join(" ");
}
