# Generation eval

Measures what the question generator produces, on fixed inputs, so a prompt or model change can be
compared against a baseline. Phase 0 of the AI overhaul plan.

- `seeds.json`: the fixed inputs (20 batches of 5: every style active on both dev and production,
  tones stepped through, a topic on every other batch). Don't edit it; later runs compare on it.
- `generate.mjs <run> [--model <openrouter-model>]`: runs each seed through today's prompt builder
  and the app's default model (or the one given) on the **dev** deployment
  (`internal/evals:generateEvalBatch`, run like an admin preview, so nothing is added to the
  library). Records what the save step would do with each question (code checks, exact
  duplicates), its 5 nearest public library questions by embedding, a hash of the prompt, the
  library's size, and every model call dev recorded for the run (including the generator's own
  retries). Rerun to retry failed seeds; failed attempts stay in the record.
- `score.mjs <run>`: scores the run with Jev (needs `TYPESAFE_API_KEY`): the quality and safety
  gate for each question, and the duplicate check (both orders averaged) within each batch, across
  batches of the same style, and against the library neighbours. Also counts repeated opening
  frames. Writes `scores.json` and `summary.json`. Jev answers are cached in `jev-cache.jsonl`
  (not committed), so a rescore is free.
- `baseline.mjs <name> <run>...`: pools replicate runs of one setup into a baseline (each rate's
  counts added up, with a 95% interval). Refuses runs that aren't replicates: a different judge,
  cutoffs, seeds, prompts, definitions, model or library, or failed seeds.
- `compare.mjs <baseline> <run>...`: tests one or more runs of a changed setup against a baseline
  (see below).
- `jev.mjs`: the Jev questions and cutoffs. The judge is pinned (`JEV_MODEL`), and summaries
  record hashes of the question wording and of the cutoffs, plus `SCORING_VERSION` (in
  `stats.mjs`, bumped when the rate logic changes); `score.mjs` refuses to overwrite a summary
  scored under different ones unless given `--force`. Safety cutoffs are the plan's; quality
  cutoffs are provisional until refit on the owner's labels.

## Running it

The deployment must opt in, so production never runs it: `npx convex env set EVALS_ENABLED true`
on dev only. Commit `convex/` and push it to dev first (`generate.mjs` refuses uncommitted
`convex/` changes unless given `--allow-local`), then run:

```bash
npx convex dev --once
node evals/generate.mjs my-setup-r1
node evals/score.mjs my-setup-r1
node evals/baseline.mjs my-setup my-setup-r1 my-setup-r2 my-setup-r3
```

Use run names of your own: rerunning these on a committed run's name rewrites its files.

Without `--model` a run uses the app's default, `GENERATION_MODEL` in
`convex/lib/generationRunner.ts` (Opus 5.5 since Oct 2026). To try another generation model, name
it with `--model` (an OpenRouter model, like `anthropic/claude-sonnet-5.5`), then score and compare
as usual. A run keeps one model, so a rerun without `--model` uses the run's own, a different
`--model` is refused, and runs that asked for different models aren't replicates. `compare.mjs`
reports the model change. A name the deployment refuses fails before any model call, so the same
run can be rerun with the corrected `--model`; a well-formed name OpenRouter doesn't know fails at
the provider, and needs a new run name.

```bash
node evals/generate.mjs sonnet-5-5-r1 --model anthropic/claude-sonnet-5.5
node evals/score.mjs sonnet-5-5-r1
node evals/compare.mjs v0-5-2 sonnet-5-5-r1
```

Exact library copies are matched on each question's stored fingerprint. After a change to how
fingerprints are computed (v0.4.1.0's quote fix was one), recompute dev's before generating, or
library questions saved under an older fingerprint aren't recognized as exact copies:
`npx convex run internal/migrations:recomputeQuestionFingerprints '{"dryRun":true}'`, then again
with `false`.

Since v0.4.3.0 only library questions keep a fingerprint. Before generating on dev, also run the
one-time cleanup that clears the ones older code left on other questions:
`npx convex run internal/migrations:clearPrivateQuestionFingerprints '{"dryRun":true}'`, then
again with `false` (a second dry run should show `cleared` at 0). It can change the library
duplicate rate against a baseline generated before it ran. The recorded library size stays the
same, so `compare.mjs` won't flag that: library duplicate rates against such a baseline aren't
like for like.

Since v0.4.8.0 a question that older pruning marked with only a prune time counts as retired, so
it is no longer a library question: neighbour search and the recorded library size leave it out as
soon as the deploy lands (`compare.mjs` flags the size change). Before generating on dev, also run
the one-time cleanup that moves those questions to `pruned`:
`npx convex run internal/migrations:normalizeRetiredQuestions '{"dryRun":true}'`, then again with
`false` (a second dry run should show `markedPruned` and `prunedAtCleared` at 0). It also clears
the fingerprints that the personal, team and organization questions it changes still hold
(`fingerprintsCleared`), which can change the library duplicate rate without changing the library
size, as above.

A run on the default model, Opus 5.5, costs about $0.46 of generation on dev (charged to the dev
deployment's system AI budget) and about $0.05 of Jev. In Oct 2026 a run cost about $0.12 on
Gemini 3.8 Flash and $0.14 on Sonnet 5.5. A call that times out has no cost on its run, so a
run's reported cost leaves it out; the dev budget still counts it.

## Reading the numbers

- The official baseline is `runs/v0-5-2.json`: three replicate runs of the same seeds on the
  default model, Opus 5.5, at v0.5.2.0 (`v0-5-2-r1` to `-r3`) pooled, 300 questions. Compare a
  later run with `node evals/compare.mjs v0-5-2 <run>`.
- `runs/v0-3-2.json` is the earlier baseline, generated with Gemini 3.8 Flash through an
  OpenRouter preset the app no longer uses. None of the seven primary rates differs detectably
  between the two baselines (`runs/v0-5-2-r1/comparison-v0-3-2.json`). One quality question
  does shift, outside the seven: 40 of the 300 Opus questions fall under the provisional
  `single_ask` cutoff, against 7 of 300 before, and fewer fail on the other questions, so the
  pass rate barely moves. The earlier baseline also predates the duplicate-fingerprint and
  timeout changes described below; exact copies and provider errors were 0 on both sides.
- The gate's pass verdict is a rough guide to quality, not the owner's judgment. On the owner's
  blind labels of 60 generated questions (Oct 2026) it matched 69% of the time, and passing
  everything would have matched 75%; of the quality questions only readability separated the
  owner's keeps from rejects. Unusable output, yield and the duplicate rates don't depend on it.
- The default model was chosen on blind labels, not on the gate, whose pass rate didn't separate
  the three models in single runs of 100 (82% Opus 5.5, 81% Gemini 3.8 Flash, 74% Sonnet 5.5,
  none a detectable change from the `v0-3-2` baseline; Opus pooled over three more runs is 75%).
  Of 20 questions from each model's run, the owner kept 17, 15 and 12: too few to tell the
  models apart. Claude, labeling blind every question the three runs would have
  saved, with the owner's rubric, kept 90 of 100, 62 of 99 and 54 of 98. Those labels come from
  Opus 5.5 itself, which read its own questions a little more generously than the owner did.
- `runs/gemini-3-8-flash-r1`, `sonnet-5-5-r1` and `opus-5-5-r1` are the first single runs of each
  named model (Oct 5, 2026). `runs/preset-r1` ran the same day while that preset was temporarily
  pointed at `stealth/space-bunny-alpha`, so it is not a replicate of `v0-3-2`.
- Seven primary rates decide a comparison, chosen up front, each over independent units: pass,
  review and block rates (over every generated question, before the code checks); the library
  likely-duplicate rate (exact library copies count as duplicates); the share of batches with a
  duplicate pair; the share of model calls that came back unusable (provider errors are reported
  separately); and yield (questions returned per question asked for). Each gets Fisher's exact
  test against the pooled baseline, Bonferroni-corrected across the seven. Everything else is
  exploratory.
- "not detected" isn't "the same": each primary rate shows how far a run of that size would have
  to move before it could be detected. Pass several runs of the changed setup to pool them and
  detect smaller changes. Questions in a batch are correlated, so treat results near the
  threshold as needing more runs.
- A comparison refuses runs judged with a different Jev version, question wording, cutoffs or
  scoring version, on different seeds or neighbour counts, or with failed seeds: rescore or
  regenerate the baseline first. It reports what else changed (prompts, taxonomy, definitions,
  the model asked for and what it resolved to, deployed settings, library). When definitions
  changed, pass and review are decided without the fit questions, which are then graded against
  different text.
- The output cap's reasoning allowance and the 30-second provider timeout were sized for Gemini
  3.8 Flash, and Opus 5.5 fits them (no cut-offs in 400 questions; a batch of ten took under 20
  seconds). A model that reasons longer or answers slower is cut off or timed out more often, so
  for such a model the unusable-output and provider-error figures partly measure fit to those
  limits. A cut-off fails its whole batch and
  the seed is generated again, so yield doesn't move and the question-level rates come only from
  answers that fit. A cut-off shows in the run's attempts as an empty completion with
  `finish_reason=length`, or as unreadable output with `completionTokens` at the batch's
  `settings.maxOutputTokens`. A timed-out call is not sent again and fails its batch. Runs
  recorded while the provider client still re-sent timed-out calls by itself (the `v0-3-2`
  baseline and the single runs `gemini-3-8-flash-r1`, `sonnet-5-5-r1`, `opus-5-5-r1` and
  `preset-r1`) could absorb a slow call, so provider-error figures across that change aren't
  like for like. The `v0-5-2` runs were recorded after it.
- The regime is the admin preview path with a batch of 5 and no per-person exclusion list. The
  feed usually asks for 1 question and excludes recently seen ones.
- Library duplicates are counted against dev's library, which differs from production's and
  changes; summaries record its size. The library reset added in v0.5.0.0
  (`internal/migrations:retireLibraryExcept`) changes only the deployment it is run on: on
  production it leaves eval numbers alone, and on dev it shrinks the library the eval searches,
  which `compare.mjs` flags as a size change. Dev's taxonomy versions can also differ from
  production's.
- Sentence frames are informational: the pooled share mostly reflects styles that require their
  opener, and the cross-style share swings a lot between replicates.
- `baseline.mjs` and `compare.mjs` refuse a run listed twice, a compare run that is one of the
  baseline's own, a run generated at more than one commit (resuming at a new commit is refused
  too: use a new run name), and a run whose calls resolved to more than one model. `compare.mjs`
  also refuses a baseline built before one of its setup keys was recorded: rebuild it with
  `baseline.mjs --force`.
- `generate.mjs` holds `runs/<run>/.lock` while it runs, so the same run name can't be generated
  twice at once. If it was killed and the file is left behind, delete it.
- The repo is public. `generated.json` keeps provider and CLI error text from failed calls word
  for word; check it before committing a run that had failures.
