# Changelog

All notable changes to Break the Ice are recorded here.

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
