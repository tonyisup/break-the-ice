# Changelog

All notable changes to Break the Ice are recorded here.

## [0.5.3.0] - 2026-10-06

### Added
- An eval baseline on the model the app uses. Three runs of the eval seeds on Claude Opus 5.5 (300 questions) are pooled as `evals/runs/v0-5-2.json`, so a later change is compared with `node evals/compare.mjs v0-5-2 <run>` and no longer reports a model change. None of the seven primary rates differs detectably from the earlier Gemini 3.8 Flash baseline: pass 75% (was 78%), 0 of 60 calls unusable, yield 100%.

### Changed
- `evals/README.md` names `v0-5-2` as the official baseline and keeps `v0-3-2` as the earlier one. It notes the one quality question that shifts between them (`single_ask`), and its example commands use placeholder run names so they can't rewrite a committed run.

## [0.5.2.0] - 2026-10-05

### Fixed
- A request for new questions that gives a count that isn't a number is handled the same way everywhere, which finishes the check 0.5.0.0 started. The feed and the admin preview write one question. A matrix fill refuses it with "The number of questions to generate isn't a valid number." before it picks a topic, claims the cell or uses one of the team's fills.
- Starting a pool run from the admin tools refuses a combination count that isn't a whole number of one or more, before anything is generated.

### Changed
- One feed request writes five questions at most. The feed page already asked for no more. The server now holds every caller to that, and the page and the server read the same limit, so they can't drift apart.
- A matrix fill writes one question per cell, which is what the schedule page asks for. The server no longer accepts a higher count per cell.

## [0.5.1.0] - 2026-10-05

### Fixed
- The per-person daily limit on AI requests (40 a day across feed generation, remix and team topic previews) now resets at midnight in Los Angeles all year, on the same day the daily AI budget uses. It was a fixed 24-hour window, which reset at 1am during daylight time and drifted on the days the clocks change, so the limit and the budget disagreed about where a day ends. Requests already counted today carry over.
- A matrix fill that stops at a call that timed out now tells the manager how many cells it filled and that they are saved. Before, the provider's own error reached them as a generic server error.

### Added
- A per-person limit on AI calls that don't end in an answer. Each signed-in person has five slots a day for calls that are still running, got no answer (a timeout, or a reply that couldn't be read) or were cut off by the length limit. A running call frees its slot when it is answered; the others keep theirs until the next day. With no slot free, feed generation, remix, team topic previews and matrix fill say so and ask the person to try again later. The daily email, admin tools and the eval harness are not counted.
- `npx convex run internal/aiRateLimit:resetAiUnanswered '{"key":"<Clerk user id>"}'` gives one person their five slots back, for use after a provider incident (add `--prod` after `run` for production). It says whether it found that person's row. A slot that stays held is logged with the `rateLimits` row it belongs to, and the README says how to find the people affected.

### Changed
- A matrix fill checks the person's own slots before it takes one of the team's fills, so a person already at their limit costs the team nothing. A batch fill also stops at the first cell whose answer is cut off by the length limit, as it already did for a timeout, with the same message about how far it got.
- A call is charged to the spend day its slot was counted on, so the two agree for a call that starts right at midnight.
- The README and the team prompts guide describe the limits and the new message.
- If this release is rolled back, delete the `aiRequestDaily` rows in the `rateLimits` table: the earlier code would read their new timestamps as the start of each person's 24-hour window.

## [0.5.0.0] - 2026-10-05

### Changed
- New questions are written by Claude Opus 5.5. The model is named in the code (`GENERATION_MODEL` in `convex/lib/generationRunner.ts`), no longer set through an OpenRouter preset, so a change of model shows in a diff and in every generation run's record. In blind labels of questions from three models, Opus 5.5's were kept most often. A single question takes about 7 seconds and a batch of ten about 17.
- Each call costs about four times what it did on Gemini 3.8 Flash: about 1 cent for one question and 3 cents for ten. `AI_DAILY_BUDGET_USD` and `AI_DAILY_HARD_CAP_USD` are unchanged, so the daily pause comes sooner; raise them in the Convex environment if you want the earlier headroom.
- Each AI call now sets aside an upper estimate of its cost before it runs, from its prompt size and output cap at Opus 5.5's listed price (about 5 to 10 cents), in place of a flat 2 cents. Calls in flight count at that amount until they settle to what they cost, so calls started together can't pass the daily cap on the same remaining budget. A call the provider reports no cost for is charged everything set aside for it. So is a call that times out or whose reply can't be parsed, which 0.4.10.0 charged the flat 2 cents.
- The eval harness generates with the app's default model unless `--model` names another. `evals/README.md` records the blind-label result behind the choice of model, and notes that the `v0-3-2` baseline was generated with Gemini 3.8 Flash, so a run on the default reports a model change until a new baseline is pooled.

### Added
- A one-time cleanup that resets the shared question library to a list of questions to keep. Every other public library question is retired, not deleted: it keeps its text and can be brought back one at a time at `/admin/questions/<id>`. Personal, team and organization questions, questions waiting for review and questions already retired are left alone, and it changes nothing unless every question to keep is a public library question on that deployment. Take a backup, then run `npx convex run internal/migrations:retireLibraryExcept '{"dryRun":true,"keepQuestionIds":["<id>","<id>"]}'` (add `--prod` after `run` for production), check that `kept` is the number of IDs you passed, run it with `false`, and run the dry run again to check that `retired` is 0.
- What the cleanup doesn't give back is listed in the comment on `retireLibraryExcept` in `convex/internal/migrations.ts`; read it before a production run. In short: links to retired questions stop opening, likes and hides of them are dropped, the backup is the only undo for a whole run, and with a small library the feed and the daily email write new questions far more often.

### Fixed
- Batch sizes and spend amounts are checked to be whole or finite numbers before they are used: a count that isn't a number is treated as one question, a call without an output cap is refused, and the spend ledger refuses an amount that isn't finite.
- The README, the tech-stack notes and code comments describe the named model and the new set-aside.

## [0.4.10.0] - 2026-10-05

### Fixed
- Each request to the AI provider is sent once per attempt. The provider client no longer re-sends a failed or timed-out request by itself behind the app's own retry, so a rate limit, a 5xx or a dropped connection gets at most three sends where it could get nine.
- A generation call that times out, or whose reply can't be parsed, now counts toward the daily AI budget at the $0.02 set aside for it. The person's own AI use is still given back, because they got nothing.

### Changed
- A call that times out isn't sent again. Someone waiting on a slow provider gets the failure after about 30 seconds instead of up to 90. The daily email no longer retries a timed-out generation, so a reader whose call stalls gets no email that day.
- A matrix fill and the nightly pool stop at the first call that times out or can't be parsed, the way they already stop when the budget is paused, instead of trying every remaining cell. Cells already filled stay saved.
- When the provider asks for a wait before a retry (`Retry-After`, in seconds or as a date), the app waits up to 20 seconds. A longer wait ends the retries, so the request fails promptly instead of holding its job open.

## [0.4.9.0] - 2026-10-05

### Added
- The generation eval can run any OpenRouter model. `node evals/generate.mjs <run> --model anthropic/claude-sonnet-5.5` generates the same seeds with that model in place of the preset, so a model can be compared with the baseline before production switches to it. A run keeps one model: a rerun without `--model` uses the run's own, and runs that asked for different models aren't pooled as replicates.
- First single runs of three models on the eval seeds: Gemini 3.8 Flash, Claude Sonnet 5.5 and Claude Opus 5.5. At this size none differs detectably from the baseline's 78% pass rate (81%, 74% and 82%). A fourth run records what happened while the preset briefly pointed at an unreleased model: 29% of its calls came back unusable.

### Changed
- `compare.mjs` names the model each side asked for, refuses a run whose calls resolved to more than one model, and refuses a baseline built before one of its setup keys was recorded (rebuild it with `baseline.mjs --force`).
- `generate.mjs` refuses unknown arguments and a flag placed before the run name, holds a lock so the same run can't be generated twice at once, and records nothing when its first call to dev fails. When every seed was refused before generating, it says to fix the setup instead of just rerunning.
- A model name is checked where it reaches the provider, before anything is read or charged.

### Fixed
- The generated Convex API types now include the question text and tag modules added in 0.4.2.0 and 0.4.7.0.

## [0.4.8.0] - 2026-10-03

### Fixed
- Every part of the app now agrees on which questions are retired: a question is retired when it was pruned, including questions an older pruning tool only marked with a prune time. The feed, the next-question picker, newsletters, the pruning queue, admin stats, schedule auto-fill and question picker, and collections all leave retired questions out, and their links no longer open (a retired duplicate of a public question still does).
- Undoing a past review works the same before and after the cleanup below.
- When an author edits a question that was pruned, it goes back to review instead of staying half-retired.

### Added
- A one-time cleanup for questions an older pruning tool marked only with a prune time. Run it right after this deploy, since until then those questions take up space in the feed and schedule pools: `npx convex run internal/migrations:normalizeRetiredQuestions '{"dryRun":true}'` (add `--prod` after `run` for production), check the counts and listed question ids, then run it with `false`, and run the dry run again to check that `markedPruned` and `prunedAtCleared` are 0.

## [0.4.7.0] - 2026-10-02

### Changed
- Questions people write can have up to 20 tags of up to 50 characters each. The server checks this when a question is saved, trims and lowercases tags, and drops blanks and repeats. Too many tags, or a tag that's too long, gets a clear message ("Questions can have up to 20 tags." or "Tags can be up to 50 characters.").
- The remix drawer applies the same limits as you add tags, and checks the tags before remixing, so a remix whose tags can't be saved doesn't use up an AI request.

## [0.4.6.0] - 2026-10-02

### Fixed
- An author's edits now go back through review consistently. An admin review started before the edit has to reload, and an earlier review can't be undone over it. Views keep showing the wording that was reviewed, including for questions approved without separately saved reviewed text.
- Authors can't edit or resubmit a question that was merged into another as a duplicate, and can't edit, resubmit or delete a question that other questions were merged into. They see a readable message asking them to contact an admin, including on the liked page.
- Embeddings follow the reviewed wording. Questions that aren't public keep none, an approval that makes a question public embeds its wording once, and the missing-embedding backfill also covers public questions whose wording is the author's own.
- Undoing an older review checks the author's wording too, and an older review that didn't record it can't make a question public.
- The admin review queue's text box shows a question's current wording after an author edits it.

### Added
- A one-time cleanup that removes embeddings non-public author-written questions still hold. Once this deploy is settled, run its dry run: `npx convex run internal/migrations:clearPrivateQuestionEmbeddings '{"dryRun":true}'` (add `--prod` after `run` for production), then run it with `false`, and run the dry run again to check that `cleared` is 0. It reports counts only.
- A database index for finding the questions merged into a question.

## [0.4.5.0] - 2026-10-02

### Fixed
- Team prompt refusals now say what went wrong instead of "Server Error". Managers see a readable message when the schedule is already published or completed, the day is no longer a delivery day, a topic field is blank or too long, or the chosen style or tone isn't available to their workspace.
- When the AI's topic preview options can't be used, the manager gets a readable "try again" message, and the request counts toward usage because the provider already charged for it.
- Topic previews refused for a blank or over-long field no longer use up one of the person's AI requests.
- Team prompts, their topics and their assignments are now credited to the account whose manager role was checked, which matters for people with more than one sign-in linked to the same email.
- The Team prompt composer switches to an available style or tone when the one it had picked stops being offered, so "Pick another one" works. It keeps your pick while the options briefly reload.
- Error messages that pass through more than one server step are read correctly, so they show their readable text instead of a generic error.

### Changed
- The topic field limits (100 characters for the name, 1,000 for guidance and boundaries) live in one place shared by the composer and the server.

## [0.4.4.0] - 2026-10-02

### Fixed
- Cancelling a remix now really cancels it. A cancelled remix no longer lands in your stash, and starting another remix right after cancelling creates one question instead of two. A cancelled remix can't finish the next remix's spinner or show its text with Save enabled. If the cancel arrives while the question is being created, that question is removed.
- Closing the drawer or leaving the page while a remix is running no longer saves the remix in the background.

### Changed
- When you remix again and then cancel, the drawer goes back to your previous remix so you can still save or discard it. The button reads "Keep Previous Remix" in that case.
- After a cancel, keyboard focus moves to the button that replaces Cancel (Save, Remix, or the drawer's Cancel when Remix isn't available), so keyboard and screen reader users keep their place.

## [0.4.3.0] - 2026-10-02

### Fixed
- Generation's duplicate check only looks at library questions now. Personal, team and organization questions that aren't public keep no fingerprint: admin edits and reviews (Mark Personal included), pruning, undo and an author's own edits no longer give one or leave one behind, and making one of these questions public fingerprints it from its wording.
- Questions added on the admin questions page get a fingerprint, so generation treats a copy of one as a duplicate.
- The prompt architecture backfill leaves personal, team and organization questions that aren't public alone, and reads the questions table one page at a time, so a re-run can't read most of the table in a single step.

### Added
- A one-time cleanup that removes the fingerprints those questions still hold. Once this deploy is settled, run its dry run: `npx convex run internal/migrations:clearPrivateQuestionFingerprints '{"dryRun":true}'` (add `--prod` after `run` for production), then run it with `false`, and run the dry run again to check that `cleared` is 0. It reports counts only, and reviews made before it ran can still be undone.

## [0.4.2.0] - 2026-10-02

### Changed
- Questions people write can be up to 500 characters: personal questions, questions submitted for the public feed, and Team prompts. The server checks the limit and the text is saved without leading or trailing spaces. Longer text, or a blank question, gets a clear message ("Questions can be up to 500 characters." or "Please enter a question."), and the draft stays in the box so it can be shortened.

### Added
- The question boxes on the add question page, the personal question dialog and the Team prompt composer show a character count (for example 120/500), so the limit is visible before you reach it. Screen readers hear a message when the limit is reached.

### Fixed
- When a question, remix or Team prompt is refused because of its text, the app now says why instead of showing a generic error.
- If saving a remix fails, the remix drawer keeps showing the last remix that was saved, so Save never sends text that wasn't stored. A remix that comes back too long asks you to remix again.
- Updating a personal question with blank text is refused instead of saving an empty question.

## [0.4.1.0] - 2026-10-01

### Fixed
- Generation catches duplicates that differ only in quote style again. The model often writes curly quotes, and the step meant to straighten them changed nothing, so "What’s..." and "What's..." got different fingerprints and exact copies were saved. New AI questions are now saved with straight quotes, and a curly "What’s your favorite..." is rejected as too generic, like its straight form.
- Generation no longer fails a whole batch when two library questions share a fingerprint, for example after approving an old curly-quoted question that has a straight twin. Either copy now counts as the existing question.

### Added
- A one-time recompute for fingerprints saved before this fix. Run its dry run soon after deploying: `npx convex run internal/migrations:recomputeQuestionFingerprints '{"dryRun":true}'` (add `--prod` after `run` for production). It reports how many fingerprints change and lists public library questions that share one after the run (question IDs and status, no text), so extra copies can be retired on the admin duplicates page. Personal, team and organization questions that aren't public are left alone.

### Changed
- Eval runs record whether the model wrote curly quotes before they were straightened, so the curly-quote count in eval summaries still reflects what the model produced. `evals/compare.mjs` no longer warns when a run's questions match more than one library question, since that no longer changes what gets saved.

## [0.4.0.0] - 2026-10-01

### Added
- You can now measure what the question generator produces and test a prompt or model change against a baseline. `evals/` runs 20 fixed seeds through today's prompt builder and model on the dev deployment, without saving anything, and scores every question with Jev for quality, safety and duplicates (within a batch, across batches of the same style, and against the library). Three replicate runs are pooled into the baseline `evals/runs/v0-3-2.json` (pass rate 78.3%, 95% interval 73.3–82.6%), and `evals/compare.mjs` tests later runs against it on seven primary rates with an exact test. See `evals/README.md`.
- The eval's Convex functions only run on a deployment that sets `EVALS_ENABLED=true` (dev).

## [0.3.2.0] - 2026-09-30

### Fixed
- AI questions generate again. The AI model thinks before it answers, and that thinking counted against the length limit added in 0.2.0.0, so most answers were cut off partway: feed questions, the daily email's fallback question and admin previews failed. The limit now leaves room for the thinking. On the development server, one-question requests went from 0 of 6 to 8 of 8 succeeding, and five-question batches from about half failing to 6 of 6.
- A remix that gets cut off now fails and can be tried again, instead of showing half a question.

## [0.3.1.0] - 2026-09-30

### Fixed
- Deleting a question now removes what only made sense for it: its search vector, people's seen, liked, hidden and emailed marks, its collection entries, and pending pruning reviews and duplicate groups, so those admin queues no longer fill with items that can't be resolved. Analytics and review history are kept.
- The daily email picks another question if the one it chose is deleted while the email is being prepared, instead of sending a link that doesn't open.
- Duplicate detection, the daily email and pool assignment no longer create new rows for a question that was just deleted.

### Added
- A one-time cleanup for references left behind by questions deleted before this release (orphan search vectors, per-person marks, collection entries, pending pruning reviews and duplicate groups). Its dry run reports what it would change: `npx convex run internal/migrations:cleanDanglingQuestionReferences '{"dryRun":true}'`.

### Changed
- Marking a question as emailed looks its row up by index instead of scanning every row.

## [0.3.0.0] - 2026-09-30

### Changed
- New AI questions from the feed and the daily email now wait for review before anyone else sees them. The person they were made for still gets them, and anyone with the link or the email can open them, but they stay out of the shared feed, collections, daily-email picks and team schedules until an admin approves them. Matrix fill, the nightly pool and admin tools still publish directly.
- AI questions are written from the current version of each style, tone and topic, including its example questions. An older style, tone or topic ID (from before an admin edit) now resolves to the current version in prompts, remix and feed requests.
- New questions are no longer steered toward ones you liked before, which was producing near-duplicates.
- An AI answer that is empty, unreadable or has no questions in it gets one more try (a second generation call, counted toward the daily AI spend cap). Answers cut off by the length limit, and requests the AI provider rejects, are not retried.
- The admin review queue has its own list, oldest first, and shows when more questions are waiting than it lists. AI questions are labelled, and their Reject button hides the question from everyone. Approving or rejecting ends the hold: moving a question back to pending later hides it.
- Share pages and share images for questions waiting for review are kept out of search engines and aren't cached for long, so a rejected question doesn't linger.

### Added
- Each AI generation run records how many questions it parsed, saved, skipped as duplicates and rejected. A run that saves nothing is marked failed with the reason.

### Fixed
- Editing a style or tone in admin no longer wipes its example questions, failure modes and other prompt settings, and the new version keeps its safety notes.
- Share images no longer fail for a style or tone that has more than one version, and never show another organization's copy of a style.
- Approving or editing a question keeps its style and tone version instead of switching to an old one.
- An AI answer that was paid for but couldn't be used keeps counting toward your allowance, even when its retry is stopped by the daily pause.
- Resolving duplicates can't retire a public question in favor of a hidden one, and waits until a question held for review has been approved or rejected.
- Inline edits and Remix in the admin review queue work for every queued question, not just recent ones.
- A feed request for a topic that is no longer available fails clearly instead of quietly ignoring the topic.
- The Liked page no longer offers "Add to collection" for a question waiting for review (it failed and could leave an empty collection behind).

### Removed
- The internal "questions similar to ones you liked" lookup, and three unused internal style and topic lookups.

## [0.2.0.0] - 2026-09-29

### Added
- A daily spending cap on AI. The daily budget ($1 by default) is one shared pool for all signed-in users, not an allowance per person: once their combined spend on generation they can start (new feed questions, remix, matrix fill, team topic previews) reaches it, that generation pauses for everyone for the rest of the day. The daily email and admin tools keep working up to a separate hard cap ($5 by default). Both are Convex environment variables (`AI_DAILY_BUDGET_USD`, `AI_DAILY_HARD_CAP_USD`) you can change without a deploy.
- Every tracked generation call (feed questions, remix, matrix fill, team and admin previews, the daily email) records what it actually cost, which model answered, and its token counts, on its generation run. Embedding calls and the admin image generator are not tracked or counted toward the cap.
- Limits on how fast one person can ask for AI: a burst of 10, then about one every two minutes, and at most 40 a day. Matrix fill is limited per team: one full grid at once, then 100 cells a day.

### Changed
- When AI is paused or you've hit a limit, the feed keeps showing saved questions and tells you why instead of offering an upgrade. Remix and the schedule page show the same plain message.
- Questions over 1,000 characters can't be remixed, and every AI request is capped in size and in how long an answer it can ask for.
- An AI answer that was already paid for but couldn't be used now counts toward your monthly AI allowance, unless the app's own length limit cut it off.

### Fixed
- Matrix fill stops and says why when the budget is paused or the team's limit is reached, instead of quietly skipping every cell.
- Matrix fill and topic preview errors on the schedule page are readable instead of raw error codes.

## [0.1.0.0] - 2026-09-29

### Fixed
- Private and team questions stay private everywhere. Likes, history, analytics and remix now check who can see a question before linking or returning it, so someone who has another person's private question ID can't like it, pull it into their history, or get it remixed.
- Likes count once. Repeated likes from a signed-in person, or from a signed-out visitor in the same browser, no longer inflate a question's like count, the admin like rate, or its show count. Signed-out likes on a question are also capped per hour, so switching browsers or sessions can't raise them without limit. One exception remains: after a signed-out like is merged into your account at sign-in, unliking and re-liking that question can count it again.
- Signing in no longer loses what you did while signed out. Your liked, hidden and viewed questions go to your personal workspace first, and they are cleared from the browser only after the server confirms and only if nothing changed meanwhile.
- Merging signed-out history again after a failed or repeated sign-in no longer double-counts views.
- A failed remix refunds the same allowance it used. Remixing a gym's public question uses your own allowance unless you are a member of that gym.
- View durations are capped at 10 minutes, so one bad report can't skew a question's average. History timestamps that can't be real are ignored.
- Your liked list, history and remix find your account by sign-in ID, so they keep working after an email change.

### Changed
- The signed-out session ID is now saved in the browser (with cookie consent), so a signed-out like counts once per browser rather than once per page load. Signed-in activity no longer carries that ID.

### Removed
- Public backend endpoints that could leak questions or spend AI credits without a check: the old AI preview, generate and newsletter endpoints, the similar-question and next-by-embedding queries, the discard endpoint, and the unused random style and tone queries. Nearest-question search, tag setup and Instagram posting now run on the server only.
