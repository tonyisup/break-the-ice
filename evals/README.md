# Generation eval

Measures what the question generator produces, on fixed inputs, so a prompt or model change can be
compared against a baseline. Phase 0 of the AI overhaul plan.

- `seeds.json`: the fixed inputs (20 batches of 5: every style active on both dev and production,
  tones stepped through, a topic on every other batch). Don't edit it; later runs compare on it.
- `generate.mjs <run>`: runs each seed through today's prompt builder and model on the **dev**
  deployment (`internal/evals:generateEvalBatch`, run like an admin preview, so nothing is added
  to the library). Records what the save step would do with each question (code checks, exact
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
  cutoffs, seeds, prompts, definitions or library, or failed seeds.
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
node evals/generate.mjs v0-3-2-r1
node evals/score.mjs v0-3-2-r1
node evals/baseline.mjs v0-3-2 v0-3-2-r1 v0-3-2-r2 v0-3-2-r3
```

A run costs about $0.15 of generation on dev (charged to the dev deployment's system AI budget)
and about $0.05 of Jev.

## Reading the numbers

- The official baseline is `runs/v0-3-2.json`: three replicate runs of the same seeds
  (`v0-3-2-r1` to `-r3`) pooled. Compare a later run with `node evals/compare.mjs v0-3-2 <run>`.
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
  resolved model, deployed settings, library). When definitions changed, pass and review are
  decided without the fit questions, which are then graded against different text.
- The regime is the admin preview path with a batch of 5 and no per-person exclusion list. The
  feed usually asks for 1 question and excludes recently seen ones.
- Library duplicates are counted against dev's library, which is smaller than production's and
  changes; summaries record its size. Dev's taxonomy versions can also differ from production's.
- Sentence frames are informational: the pooled share mostly reflects styles that require their
  opener, and the cross-style share swings a lot between replicates.
