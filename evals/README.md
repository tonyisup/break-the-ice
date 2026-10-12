# Generation eval

Measures what the question generator produces, on fixed inputs, so a prompt or model change can be
compared against a baseline. Phase 0 of the AI overhaul plan.

- `seeds.json`: the fixed inputs (20 batches of 5: every style active on both dev and production,
  tones stepped through, a topic on every other batch). Don't edit it; later runs compare on it.
- `generate.mjs <run> [--model <openrouter-model>] [--seeds <name>]`: runs each seed through the
  app's own prompt, the short brief (`convex/lib/brief.ts`), and the app's default model (or the
  one given) on the **dev** deployment (`internal/evals:generateEvalBatch`, run like an admin
  preview, so nothing is added to the library). Records what the save step would do with each
  question (code checks, exact duplicates), its 5 nearest public library questions by embedding,
  a hash of the prompt and the label of the wording that wrote it (`promptLabel`, which is
  `brief-v2` today), the library's size, and every model call dev recorded for the run
  (including the generator's own retries). Rerun to retry failed seeds; failed attempts stay in
  the record.
- `score.mjs <run>`: scores the run with Jev (needs `TYPESAFE_API_KEY`): the quality and safety
  gate for each question, and the duplicate check (both orders averaged) within each batch, across
  batches of the same style, and against the library neighbours. Also counts repeated opening
  frames. Writes `scores.json` and `summary.json`. Jev answers are cached in `jev-cache.jsonl`
  (not committed), so a rescore is free.
- `baseline.mjs <name> <run>...`: pools replicate runs of one setup into a baseline (each rate's
  counts added up, with a 95% interval). Refuses runs that aren't replicates: a different judge,
  cutoffs, seeds, prompts, definitions, model or library, or failed seeds.
- `compare.mjs <baseline> <run>...`: tests one or more runs of a changed setup against a baseline
  (see below). Writes `comparison-<baseline>.json` in the first run's folder.
- `judge.mjs <name> <run>... [--only-labeled] [--context] [--model <openrouter-model>]`:
  runs the app's quality check (`convex/lib/qualityCheck.ts`) over the questions those runs
  would have saved, on dev, and writes its verdicts to `judged/<name>.json`. See "Measuring the
  quality check" below.
- `pairs.mjs build|score`: sets two runs side by side as blind pairs and reads the owner's
  choices. See "Trying another way of asking".
- `select.mjs draw|score`: draws a blind set of the judge's best picks from each batch and reads
  the owner's labels. See "Picking the best of a batch".
- `brief.mjs`, `brief.json`: what is left of the eval's own copy of the short brief, from before
  the app generated with it. `brief.mjs` is the seeded shuffle that `pairs.mjs` and `select.mjs`
  draw their sets with. `brief.json` gives `judge.mjs --context` the names of the styles and
  tones; nothing reads its `brief` and `form` lines any more.
- `seeds-new-cells.json`: 24 more seeds, eight questions each, on combinations `seeds.json`
  doesn't use.
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

The prompt shows the model questions from dev's library: public questions of the seed's style,
retired ones a reviewer gave a reason for, and one public question from each of a few other
styles. Which of them are shown is drawn from the seed's id, so a rerun and a replicate run ask
the same thing as long as those questions are the same on dev. When they have changed between
two runs, the runs' prompts differ, and `baseline.mjs` refuses runs whose prompts differ.

Without `--model` a run uses the app's default, `GENERATION_MODEL` in
`convex/lib/generationRunner.ts` (Opus 5.5 since Oct 2026). To try another generation model, name
it with `--model` (an OpenRouter model, like `anthropic/claude-sonnet-5.5`), then score and compare
as usual. A run keeps one model, so a rerun without `--model` uses the run's own, a different
`--model` is refused, and runs that asked for different models aren't replicates. `compare.mjs`
reports the model change. A name the deployment refuses fails before any model call, so the same
run can be rerun with the corrected `--model`; a well-formed name OpenRouter doesn't know fails at
the provider, and needs a new run name.

```bash
node evals/generate.mjs my-sonnet-r1 --model anthropic/claude-sonnet-5.5
node evals/score.mjs my-sonnet-r1
node evals/compare.mjs v0-5-2 my-sonnet-r1
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

A run of the 20 standard seeds on the default model, Opus 5.5, cost about $0.46 of generation on
dev in Oct 2026 (charged to the dev deployment's system AI budget) and about $0.05 of Jev. That
was with the long prompt the app sent then; the one run made with the eval's brief on the same
seeds cost $0.44. In Oct 2026 a run cost about $0.12 on Gemini 3.8 Flash and $0.14 on Sonnet
5.5. A call that times out has no cost on its run, so a run's reported cost leaves it out; the
dev budget still counts it.

## Measuring the quality check

The quality check is the call that judges each generated question in the app (keep or hold,
reasons, safety flags, a confidence from 1 to 5). `judge.mjs` runs the same call on dev over
questions from generated runs, without saving anything on a question:

```bash
node evals/judge.mjs my-judged v0-5-2-r1 v0-5-2-r2 v0-5-2-r3
```

A question that appears in more than one run is judged once. Rerunning the same name judges
only what is missing, keeps every verdict the file already has, and refuses, before it sends
a question, if the deployment's judge model or instructions version has changed since, or if
the rerun asks for another `--model` or `--context` than the name was judged with.
(The version is `QUALITY_CHECK_PROMPT_VERSION`. Drafts measured before the first release all
carried 1, so don't rerun a name from before then. It is 2 since the judge reads the brief's
lines, so a name judged at 1 can't have more added to it.) A check costs about 1 cent, charged to the dev deployment's system AI budget. The
`judged/` folder is git-ignored: the verdicts stay local, so the owner can label a set drawn
from them without seeing them.

`--model <openrouter-model>` judges with another model (like `anthropic/claude-haiku-5.5`), to
measure it against the same labels. A name keeps one model, so give every rerun of that name
the same `--model`. The cost printed before a run is at the app's model's price.

The judge reads each question's style, tone and topic as the question's run recorded them. For
a run generated since the app moved to the brief, each is the same one line the model was given
(`convex/lib/taxonomyDefinitions.ts`), cut at 300 characters. Before that they were built from
the long prompt's fill-in templates, and a judge shown those marked a question the brief wrote
down for not following them, so `judge.mjs` had a `--brief` flag that swapped in the eval's own
copy of the lines. The flag is gone. A name judged with it says so in its file (`definitions`),
and `judge.mjs` refuses a rerun of that name: start a new one.

To compare the verdicts with the owner's labels, put the labels in `evals/owner-labels.json`
(git-ignored; the labels are not stored in this repo):

```json
{ "cards": [ { "id": "q253", "text": "...", "group": "would_publish", "verdict": "keep", "reasons": [] } ] }
```

`group` is `would_publish` or `for_review` for a blind set drawn from the check's verdicts,
or `labeled_before` for questions labeled before the check existed. `verdict` is `keep`,
`reject` or `unsure`. Cards are matched to judged questions by their text. `--only-labeled`
judges just the labeled questions.

The check sorts a question three ways, and with the labels file present `judge.mjs` prints
each beside the owner's labels, for each group:

- It **would publish** a question only on a keep with no reasons, no safety flags and a
  confidence of 5.
- Every other question it would **leave for review**.
- It would **flag** a question it held, or raised a safety concern about. That is the app's
  rule for the mark a team sees on its schedule grid.

On 60 questions the owner had already labeled (16 of them not kept), measured on dev in
October 2026, it would publish 21, 1 of which the owner had rejected, and flag 3, 2 of which
the owner had rejected. With a confidence of 4 also publishing, it would publish 48, 10 of
them rejected. Those 60 were also used to write the check's instructions, so they are not the
test. A blind set is.

The pass rule for a blind set is fixed before it is labeled: of the cards the check would
publish, the owner rejects at most 1 in 20, rounded down, with an "unsure" counted as a
reject. It needs at least 60 such cards, and it is decided only on the set as it was drawn:
if a card of the `would_publish` group has no verdict in the judged file, or the file's verdict
would no longer publish it (the judge doesn't give the same answer every time), the script
says so instead of deciding. Keep the judged file a set was drawn from. That is an observed rate, not a proof: 4 rejects in
95 shows the true rate is unlikely to be above about 10%.

## Trying another way of asking

This is the record of a finished experiment, and of the tool it left.

Until the app generated with it, the short brief was a second prompt that lived only here.
`generate.mjs --brief` sent it in place of the app's prompt through the same eval-only action,
so the model, the temperature, the output cap and the save step's checks were the same and
only what was asked differed. It said who the questions are for in a few lines, described the
style, tone and topic in a line each (`brief.json`), and showed the model the owner's own
decisions as the standard: questions of the style the owner kept and rejected, with the
reasons, and a few kept questions of other styles, read from
`evals/judged/owner-decisions.json`. One run was generated each way on the 20 standard seeds,
and the two were set side by side as blind pairs for the owner to choose between. The result
is under "Reading the numbers" (`runs/pairs1-app` and `runs/pairs1-brief`).

The first test used the brief at version 1. Version 2 gave a style whose form is the style
(either/or, would you rather, one word) a `form` line: the brief asks for variety in how a
sentence is built, and without that line the variety pulled such a style's questions out of
the style.

The owner chose the brief for every generator, and the app now builds it itself
(`convex/lib/brief.ts`): the line for each style, tone and topic is kept on its row (`brief`,
and `form` on a style), and the examples are read from the library. So `generate.mjs` has no
`--brief`, and every run is of the app's prompt. A run made with `--brief` says so in its
record (`prompt`), and `generate.mjs` refuses a rerun of it: start a new run name.
`generateEvalBatch` still takes a `prompt` argument, for a later experiment; no script sends
one.

`pairs.mjs` sets any two runs of the same seeds side by side, as it did then:

```bash
node evals/generate.mjs pairs-a
node evals/generate.mjs pairs-b --model anthropic/claude-sonnet-5.5
node evals/pairs.mjs build my-pairs pairs-a pairs-b
```

`build` pairs one question from each run for the same seed, four pairs a seed unless
`--per-seed` says otherwise, and writes two files to `evals/judged/my-pairs/`. `pairs.json`
is what the owner is shown: the style, tone and topic, and a left and a right question, with
nothing that says which run wrote which. `key.json` says which side is which run and stays on
this machine. Questions that share eight words in a row with one the owner has already
judged, or that both runs wrote, are left out (a shorter question only when it is one of
those questions, word for word). The questions already judged are the ones in
`evals/judged/owner-decisions.json`, when that file exists. A round holds one pair per seed,
and half of each round has the first run on the left.

For each pair the owner picks the better question, or says both are fine, or neither is.
`node evals/pairs.mjs score my-pairs evals/judged/my-pairs/choices.json` reads those choices
(a JSON object from pair id to `left`, `right`, `both` or `neither`). Save the choices in that
folder, which git ignores, and not elsewhere in the repo. The rule is fixed before anything is
labeled:

- Only whole rounds count, starting from the first, and at least three of them. The owner
  can stop after any round; nobody looks at the result before then. `build` says so when a set
  has fewer than three rounds, and such a set is never read.
- Among the pairs where one question was picked, a run is called better when an exact
  two-sided sign test is below 0.05. With 80 pairs and a fifth of them tied, that takes 41 of
  the 64 picks.
- "Both" and "neither" are counted and reported, and so is how many seeds lean each way, but
  they don't decide it.

A pick says which question is better, not that it is good enough to publish. Pairs from the
same seed come from one call each way, so they are not independent; read the seed count
beside the sign test.

## Picking the best of a batch

This is the record of the second finished experiment, and of the tools it left.

The question that decides publishing is not which prompt is better but how often the owner
rejects what would be published. The experiment measured it for a larger batch from which only
the best were taken:

- A run was generated with the eval's brief (`generate.mjs --brief`, since removed) from
  `evals/seeds-new-cells.json`: 24 combinations of the same styles, tones and topics that the
  first 20 seeds don't use, eight questions each. The owner had read the first 20 seeds' output
  many times over, which makes a repeated construction hard to judge; these were cells nobody
  had seen.
- `judge.mjs --context` judged the run, with the owner's decisions shown beside each question.
- `select.mjs draw` took the judge's best picks from each batch, with a control from the rest,
  and the owner labeled the cards blind.

The set failed its rule. The numbers are under "Reading the numbers" (`runs/cells-brief`).

The same three steps work on a run of the app's prompt:

```bash
node evals/generate.mjs cells-run --seeds seeds-new-cells
node evals/judge.mjs cells-judged cells-run --context
node evals/select.mjs draw cells-set cells-judged --start <first-card-number>
```

- `--seeds seeds-new-cells` generates from `evals/seeds-new-cells.json` in place of
  `seeds.json`. A run keeps its seeds file, so a rerun has to be given the same `--seeds`.
- `judge.mjs --context` shows the judge the owner's decisions beside each question: the latest
  ten of the question's style, then the latest of other styles, 24 in all with at most twelve
  keeps and twelve rejects. The app's own check never gets these. A question the owner has
  already decided on is shown only the decisions made before that one, never its own. A check
  costs about 2 cents this way. The decisions are read from
  `evals/judged/owner-decisions.json` (git-ignored), a list of
  `{ "text", "style", "tone", "verdict", "reasons" }` with style and tone slugs, in the order
  the owner decided, oldest first. The judge is shown each style and tone by its name in
  `brief.json`.
- `select.mjs draw` takes, from each batch, up to three questions the judge kept at confidence
  4 or 5 with no reasons and no safety flags, surest first, and one more at random from the
  rest of the batch as a control. It writes `cards.json` for the labeling page (each card's
  number, style, tone, topic and text, nothing else) and `key.json`, which stays on this
  machine. `--start` is the number of the first card: one past the last card already on the
  labeling page, which was q362 when the experiment's set was drawn.

The owner labels the cards keep or reject, blind. `node evals/select.mjs score cells-set
evals/judged/cells-set/labels.json` reads the labels (a JSON object from card id to
`{ "verdict": ... }`; save it in that folder, which git ignores) and
applies the first blind set's rule to the picked cards: at most 1 in 20 rejected, on at least
60 of them, an "unsure" counted as a reject. It also prints the controls' rate and, weighing
the two by their share of the batches, about what the rate would be with no picking.

## Reading the numbers

- The official baseline is `runs/v0-5-2.json`: three replicate runs of the same seeds on the
  default model, Opus 5.5, at v0.5.2.0 (`v0-5-2-r1` to `-r3`) pooled, 300 questions. Compare a
  later run with `node evals/compare.mjs v0-5-2 <run>`. It was generated with the long prompt
  the app sent before the brief, so a run made since differs from it in prompts, taxonomy and
  definitions; `compare.mjs` says so, and decides pass and review without the fit questions.
- `runs/v0-3-2.json` is the earlier baseline, generated with Gemini 3.8 Flash through an
  OpenRouter preset the app no longer uses. None of the seven primary rates differs detectably
  between the two baselines (`runs/v0-5-2-r1/comparison-v0-3-2.json`). One quality question
  does shift, outside the seven: 40 of the 300 Opus questions fall under the provisional
  `single_ask` cutoff, against 7 of 300 before, and fewer fail on the other questions, so the
  pass rate barely moves. The earlier baseline also predates the duplicate-fingerprint changes
  described under "Running it" and the timeout change described below; exact copies and provider
  errors were 0 on both sides.
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
- `runs/pairs1-app` and `runs/pairs1-brief` (Oct 7, 2026) are the two runs of the first blind
  pairs test, on the 20 standard seeds: the app's prompt of the time, which was the long one,
  and the short brief at version 1,
  before the `form` lines. Of 72 pairs the owner picked the brief's question in 29 and the
  app's in 16, called both fine in 12 and neither in 15. The sign test on the 45 picks gives
  p = 0.07, so by the rule no difference was shown; of the 19 seeds, 12 leaned to the brief, 2
  to the app's prompt and 5 were even. 17 of the app's 99 saved questions were left out as near
  copies of ones the owner had already judged or as written by both runs, and none of the
  brief's 96.
- `runs/cells-brief` (Oct 8, 2026) is the short brief at version 2 on `seeds-new-cells.json`,
  the run the first pick-the-best set was drawn from. That set failed its rule: of the 68
  picked cards the owner rejected 20 (29%), and of the 24 controls 7 (29%), so the judge's
  picks were no better than the rest of the batch. It was judged with `--context` before
  `judge.mjs` had its `--brief`, so that judge read the definitions of the time, built from
  the long prompt's templates.
- Neither of those two brief runs is scored with Jev. Their records carry the definitions of
  the time, built from the long prompt's templates, which their questions were never shown, so
  `score.mjs` would grade their fit against the wrong text and `compare.mjs` wouldn't notice:
  don't compare one against a baseline. `judge.mjs` shows the judge the definitions a run
  recorded, so don't judge one of the two under a new name either.
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
  for word, and the deployment's stored error for each failed model call (`attempts[].error`);
  check it before committing a run that had failures.
