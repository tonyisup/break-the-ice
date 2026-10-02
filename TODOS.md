# TODOS

## AI usage

### Close a remaining AI usage accounting gap

**What:** One AI path can skip usage accounting in some conditions. The specifics are in the owner's private plan doc ("v0.1.0.0 security follow-ups").

**Why:** AI spend can exceed plan limits.

**Context:** Fix alongside the rate limiter / spend cap work.

**Effort:** M
**Priority:** P1
**Depends on:** Rate limiter / AI spend cap

### Alert on an AI pause and decide how to protect the shared budget

**What:** Email the owner (the existing `internal.email.sendEmail` notifier, `CRONS_NOTICE_EMAIL`) the first time user AI pauses each day, with the day's spend. Then decide how the shared user budget should be split. The specifics are in the owner's private plan doc ("v0.1.0.0 security follow-ups").

**Why:** The user budget is shared, so it can run out early for everyone, and today nobody hears about it.

**Context:** `convex/lib/aiSpend.ts` (caps), `convex/lib/aiSpendGuard.ts` (where a pause is detected). `generationRuns.requestedByUserId` and `costUsd` give per-user spend. Deferred by the owner during the v0.2.0.0 review.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Decide how AI answers cut off by the length limit are charged

**What:** Settle one rule for whether a person keeps their AI use when an answer is cut off by our output cap, for the feed, the daily email, previews and remix alike. The specifics are in the owner's private plan doc ("Security follow-ups (private)").

**Why:** Today every cut-off gives the use back. That made sense when the cap was too small for the model, but since v0.3.2.0 the cap leaves room for the model's thinking.

**Context:** `wasPaidInFull` and `retryUnusableOutput` in `convex/lib/generationRunner.ts`; the refunds happen in the callers (`convex/internal/ai.ts`, `convex/core/questions.ts`) through `wasAiCallBilled`. Deferred by the owner during the v0.3.2.0 review (decision 3aab4fc9).

**Effort:** S
**Priority:** P2
**Depends on:** None

### Size the per-call spend reservation from the output cap

**What:** Reserve each AI call's budget from its `max_tokens` (times a worst-case price) instead of a flat `RESERVE_PER_CALL_USD` of $0.02.

**Why:** The worst-case call is now 4,300 output tokens, about $0.017 on today's model. If the OpenRouter preset is pointed at a pricier model, which needs no deploy, calls could cost more than they reserve and overshoot the daily cap before settling.

**Context:** `reserveAiSpend` in `convex/lib/aiSpendGuard.ts`, `convex/lib/aiSpend.ts`, `maxOutputTokens` in `convex/lib/generationRunner.ts`. Deferred during the v0.3.2.0 review (decision 9ce5b30c).

**Effort:** M
**Priority:** P3
**Depends on:** None

### Size the AI provider timeout from the output cap

**What:** Give each OpenRouter call a timeout based on its `max_tokens`, and set `maxRetries: 0` on `openRouterClient` so only `createChatCompletionWithRetry` retries, with a spend reservation per attempt.

**Why:** The client times out at a flat 30 seconds and the SDK quietly retries twice. A 10-question batch takes about 20 seconds today, but a slower model could make someone wait about 90 seconds, and the abandoned attempts aren't recorded as spend.

**Context:** `openRouterClient` in `convex/lib/generationRunner.ts`. Deferred during the v0.3.2.0 review (decision da9ce3c3).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Generation

### Label questions for Phase 0, then compare Claude and Jev against the labels

**What:** The owner labels about 200 production questions (keep or reject, the four review reasons, safety concerns) in the Question Labels page. Then measure the owner's keep rate and reason mix, how often Claude's blind labels and the Jev gate agree with the owner, and refit the quality cutoffs in `evals/jev.mjs` on those labels.

**Why:** Phase 0's gate needs the labels, and the Jev quality cutoffs are provisional until they're fit to the owner's judgment. Refitting changes `CUTOFFS_HASH`, so rescore the baseline (`node evals/score.mjs v0-3-2-r1 --force` and so on, then `evals/baseline.mjs`) afterwards.

**Context:** Deferred from plan: Phase 0 spec (the plan doc's "Phase 0 spec" tab). The labeling page and Claude's blind labels are in the owner's private Question Labels artifact; labels are not stored in this repo.

**Effort:** M
**Priority:** P1
**Depends on:** The owner's labels

### Handle answers cut off by the length limit better

**What:** Three changes:
- Retry a cut-off once. The model's thinking varies from call to call, so a second try usually fits.
- Show people the readable "couldn't use the answer" message instead of a bare server error.
- Record on the run that it was cut off: `finish_reason`, `max_tokens` and the reasoning-token count.

**Why:**
- The daily email makes one generation attempt per reader, so a single overrun means no email that day.
- Cut-offs currently read as "Unterminated string in JSON", so nobody can tell how close calls get to the cap.

**Context:** `retryUnusableOutput`, `UnusableOutputError` and `parseCandidates` in `convex/lib/generationRunner.ts`; `settleAiCompletion` in `convex/lib/aiSpendGuard.ts` stores the usage. Deferred during the v0.3.2.0 review (decision ede332ff).

**Effort:** M
**Priority:** P2
**Depends on:** Decide how AI answers cut off by the length limit are charged

### Harden generation input handling

**What:** Close a gap in how generation requests are validated. The specifics are in the owner's private plan doc ("Security follow-ups (private)").

**Why:** Found in the v0.3.2.0 review; older than that release.

**Context:** `convex/lib/promptArchitecture.ts` and the generation callers in `convex/core/fillMatrix.ts` and `convex/admin/ai.ts`.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Measure a reasoning limit with the eval before setting one

**What:** Run the Phase 0 eval seeds with and without OpenRouter's `reasoning` limit (for example low effort, or a token budget) and compare question quality, latency and cost.

**Why:** v0.3.2.0 leaves room for the model's thinking but doesn't limit it. Every feed fill and remix spends about 500 to 1,600 thinking tokens first, which costs a few seconds and some money. Capping it blind could make questions worse.

**Context:** The eval harness is on branch feat/phase0-eval-harness (`evals/`). The preset is `@preset/break-the-ice-berg-default` in `convex/lib/generationRunner.ts`.

**Effort:** S
**Priority:** P2
**Depends on:** Phase 0 eval harness merged

### Check remix output before showing it

**What:** Reject a remix whose `finish_reason` isn't "stop", not just "length". Run the generation text checks on it too: length, one question mark, a single line.

**Why:** A "content_filter" or "error" ending with partial text still comes back as a successful remix. Since v0.3.2.0 the cap no longer limits how long the visible text can be. Since v0.4.2.0, saving a remix applies the 500-character limit on question text (`MAX_QUESTION_TEXT_LENGTH`), so a remix over 500 characters is refused when the drawer saves it, after the AI request was counted. Checking the length in `remixQuestionForUser` before it returns would catch it earlier.

**Context:** `runRemixQuestion` in `convex/lib/generationRunner.ts`; `validateGeneratedQuestion` in `convex/lib/promptArchitecture.ts`; `requireQuestionText` in `convex/lib/questionText.ts`. New questions people write are capped at 500 characters, but older and admin-written questions of up to 1,000 characters can still be remixed, so a length limit needs care. Deferred during the v0.4.2.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** Decide how AI answers cut off by the length limit are charged (for whether a refused remix gives the request back)

### Expire stale matrix-fill locks

**What:** Treat matrix-fill cell locks older than about 15 minutes as stale in `claimMatrixFillCell`. Stop `fillEmptyCells` at an elapsed-time budget of about 8 minutes and return partial counts.

**Why:** A fill runs up to 50 generations in one action. If Convex kills it at the 10-minute limit, the `finally` that releases the lock never runs, and that cell stays locked for the organization forever.

**Context:** `convex/core/fillMatrix.ts`, `convex/internal/matrixFillLocks.ts`. No team uses matrix fill yet. Found in the v0.3.2.0 adversarial review.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Access control

### Check gym membership across duplicate user records in canReadQuestion

**What:** `canReadQuestion` checks `organization_members` for one user id; `ensureOrgMember`, `getOrganizations` and `getCurrentUser` accept membership on any candidate record for the identity.

**Why:** A member whose membership sits on a non-canonical duplicate record can open the gym workspace, but their likes on gym questions silently drop, history hides them, and remix says "Question not found".

**Context:** `convex/lib/questionAccess.ts`. Check membership across `collectUserCandidates(identity)` (or have callers pass candidate ids). Add a test with membership on a second user record that shares the email.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Remove the uncalled public getLikedQuestions query

**What:** `api.core.questions.getLikedQuestions` has no callers; the Liked page uses `getQuestionsByIds`.

**Why:** Less public surface to keep safe. It is visibility-checked today, so this is cleanup, not a hole.

**Context:** Several tests in `convex/question_access.test.ts` use it as their read path; switch them to `likedRelations` or `getQuestionsByIds` and add it to the removed list in `convex/public_api_lockdown.test.ts`.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Review consistency

### Close a remaining review-consistency gap in shared views

**What:** One kind of shared view can show wording that hasn't been through review in some conditions. The specifics are in the owner's private plan doc ("v0.4.6.0 follow-ups").

**Why:** Shared views should only show reviewed or public wording.

**Context:** Deferred during the v0.4.6.0 review.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Finish review consistency for author-written questions

**What:** Bring a few remaining admin and author review paths in line with v0.4.6.0, including letting an approval see an author's later rewording. The specifics are in the owner's private plan doc ("v0.4.6.0 follow-ups").

**Why:** v0.4.6.0 fixed the main author edit path; a few related paths still need the same checks.

**Context:** Deferred during the v0.4.6.0 review.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Keep an admin's draft when a queued question changes

**What:** In the admin review queue, keep an admin's unsaved text when the question gets a new revision, and show a "question changed" notice instead of replacing it. Show the server's readable message when a stale save is refused.

**Why:** Since v0.4.6.0 the text box reloads with the current wording when the question changes, which drops anything the admin was typing.

**Context:** `src/app/admin/questions/page.tsx` (queue textarea keyed by revision, `handleUpdateField`). Deferred during the v0.4.6.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Team prompts

### Show readable errors for library question schedule changes

**What:** Give `assignQuestion`, `unassignQuestion` and the publish path in `convex/core/schedules.ts` the same readable refusals Team prompts use (`SCHEDULE_NOT_DRAFT`, `SCHEDULE_DAY_INACTIVE`), and show them on the schedule page through `readableError` instead of `e.message`.

**Why:** Since v0.4.5.0 assigning a Team prompt to a published schedule explains why it was refused, but assigning a library question to the same cell still shows "Server Error" in production.

**Context:** `convex/core/schedules.ts` (assignQuestion, unassignQuestion, publish); handlers in `src/app/org/schedule/page.tsx` that call `toast.error(e.message ...)`. Consider one shared helper for the draft and delivery-day checks used by both modules. Keep a missing schedule a plain error where it's checked before membership. Deferred during the v0.4.5.0 review.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Show length counters on Team topic fields

**What:** Show a character counter (like `QuestionLengthCounter` on the question boxes) on the topic guidance and boundaries fields in the Team prompt composer.

**Why:** The fields stop at their limit, so pasted text over 1,000 characters is cut off with no warning.

**Context:** `src/app/org/schedule/TeamPromptComposer.tsx`; limits in `convex/constants.ts` (`MAX_TEAM_TOPIC_*_LENGTH`). Deferred during the v0.4.5.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Privacy

### Document the signed-out session id and regenerate it on revoke

**What:** Mention on the privacy/cookie page that signed-out likes and views carry a random session id (saved only with consent, in memory for one page load otherwise). Generate a new id in `revokeConsent`.

**Why:** Visitors who decline cookies still send an unsaved per-page-load id. After revoking and re-consenting, the pre-revocation id is saved again.

**Context:** `src/hooks/useStorage.ts` `useSessionId`, `revokeConsent`; `src/pages/InfiniteScrollPage.tsx`, `src/app/question/page.tsx`, `src/app/history/page.tsx` send it. Owner chose to keep the id for like de-duplication.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Question review

### Make Approve and Reject in the review queue undoable

**What:** The queue's Approve and Reject resend the question's style and tone, so `updateQuestion` counts them as other edits and saves the review as not undoable. Count only fields that actually changed (compare with `before`), or have the queue send just the status. Then offer undo for question reviews in the admin UI.

**Why:** A mistaken Reject on a question someone was emailed can only be fixed by approving it: moving it back to pending now hides it.

**Context:** `convex/admin/questions.ts` `updateQuestion` (`hasOtherEdits`), `src/app/admin/questions/page.tsx` `handleApprove`, undo in `convex/admin/pruning.ts`. Also from the v0.3.0.0 review: add tests for undo restoring `heldForReview`, for the queue's "+" badge at `PENDING_QUEUE_LIMIT + 1`, and positive cases for active global and organization topic ids; and reword the `isUnlistedAiQuestion` comment (undo can also restore the marker).

**Effort:** S
**Priority:** P2
**Depends on:** None

### Save organization-anchored feed questions to the organization

**What:** When a team member's feed is anchored on their organization's own style or topic, the generated question is saved as a global library question (no `organizationId`). Save it to the organization instead, or show the organization in the review queue.

**Why:** Approving such a question publishes content shaped by one organization's guidance to the global library.

**Context:** `convex/internal/ai.ts` `generateAIQuestionForUser`, `convex/internal/generation.ts` `insertGeneratedQuestions` (no `organizationId` argument), the team feed. Held for review since v0.3.0.0, so nothing publishes without an admin approving it.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Filter the daily email's similar-question search to reviewed questions

**What:** The daily email looks for a question near the reader's taste with an unfiltered vector search (top 100), then drops ineligible rows. Held questions now fill that window, so the email falls back to generating new questions more often. Filter the search by status.

**Why:** Each fallback is a paid generation and adds another held question.

**Context:** `convex/internal/newsletter.ts` (`ctx.vectorSearch("question_embeddings", ...)`); the index has `status` in `filterFields`. Check production first for embedding rows with no status (legacy), which a status filter would exclude.

**Effort:** S
**Priority:** P2
**Depends on:** A read-only production check

### Decide what exact-text dedupe does with held and rejected questions

**What:** `insertGeneratedQuestions` skips any candidate whose fingerprint matches an existing question, including held and rejected ones, so that text can never be saved as public by matrix fill, the nightly pool or admin generation. Matrix fill also counts the collision as an existing cell.

**Why:** Unreviewed and rejected rows quietly block good text and make matrix fill report cells it didn't fill.

**Context:** `convex/internal/generation.ts` `insertGeneratedQuestions`, `convex/core/fillMatrix.ts`. Needs a product decision (reuse, promote or keep blocking) per status.

**Effort:** M
**Priority:** P3
**Depends on:** Owner decision

### Keep the fingerprint on submissions pruned from public

**What:** Record whether a user-written question was public when it was pruned, and keep its fingerprint if so, like a pruned library question or a retired public duplicate.

**Why:** Since v0.4.3.0 only library questions keep a fingerprint, and a pruned submission counts as private, so pruning one (and the private fingerprint cleanup) drops it. Generation can then save the exact text of a submission an admin pruned.

**Context:** `isPrivateUserQuestion` in `convex/lib/questionAccess.ts`; `approvePruning` in `convex/admin/pruning.ts`; `updateQuestion` in `convex/admin/questions.ts` (status pruned); `clearPrivateQuestionFingerprintsPage` in `convex/internal/migrations.ts`. Pruned rows don't record their earlier status, so this needs a marker (like `duplicateWasPublic`) set when pruning, and the cleanup and the private-question rule must leave marked rows alone. Accepted by the owner during the v0.4.3.0 review (decision 7290f0f8).

**Effort:** M
**Priority:** P3
**Depends on:** None

### Show readable errors on the admin review and duplicates pages

**What:** Admin mutations in `convex/admin/questions.ts` throw plain `Error`s, which production shows as "Server Error". Throw `ConvexError` with a code and message (as the AI limits do) and read it with `convexErrorData` on the client. Include the duplicates page's "question held for review" guard, and show which group member is held.

**Why:** In production an admin can't tell why a review or duplicate resolution was refused.

**Context:** `convex/admin/questions.ts` (`deleteDuplicateQuestions`, `updateQuestion`), `src/app/admin/duplicates/page.tsx`, `convex/lib/errorData.ts`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Scope generation's slug lookups to the caller's organization

**What:** Slug lookups in generation aren't organization-scoped the way ID lookups now are. The specifics are in the owner's private plan doc ("Security follow-ups").

**Why:** Taxonomy lookups should respect organization boundaries everywhere.

**Context:** `convex/internal/generation.ts`; `resolveTaxonomySlug` in `convex/lib/taxonomyLookup.ts` already takes an organization. Pre-existing; noticed in the v0.3.0.0 review.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Remix drawer

### Clean up abandoned remix drafts on the server

**What:** Remove remix drafts nobody saved or discarded, on the server instead of relying on the drawer. Cover: a question created by a cancelled remix whose cleanup delete fails or never runs (the page reloads first); a finished remix left when the drawer unmounts without Save or Discard; and a cancelled Remix Again whose update landed, which leaves the text the person rejected until they press Save or Discard.

**Why:** Since v0.4.4.0 the drawer deletes a cancelled remix's question itself, but that delete is a best-effort browser call. When it can't run, the draft stays in the person's stash with no signal.

**Context:** `handleRemix` and `handleCancelRemix` in `src/components/remix-question-drawer/remix-question-drawer.tsx`; `addPersonalQuestion` / `deletePersonalQuestion` in `convex/core/questions.ts`. One option is a draft flag set by the drawer and cleared on Save, with a scheduled job expiring old drafts. Deferred during the v0.4.4.0 review.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Find the author the same way in all personal question mutations

**What:** Switch `deletePersonalQuestion` and `updatePersonalQuestion` to `findCanonicalUser`, like `addPersonalQuestion`.

**Why:** They look the author up by email with `.unique()`, which throws for people with duplicate user records and doesn't normalize the email. For them, a question they just created can't be updated or deleted, so Discard and the drawer's cleanup of a cancelled remix fail.

**Context:** `convex/core/questions.ts`; `findCanonicalUser` in `convex/lib/users.ts`. Add tests with duplicate user records that share an email. Deferred during the v0.4.4.0 review.

**Effort:** S
**Priority:** P2
**Depends on:** The author-edit review guards branch, which also changes `updatePersonalQuestion`

### Keep the previous remix's settings when keeping it

**What:** When "Keep Previous Remix" restores the earlier remix, also restore the style, tone and tags it was written with, and keep that remix visible (dimmed) while Remix Again runs instead of hiding it behind the spinner.

**Why:** Today Save after "Keep Previous Remix" stores the earlier text with whatever style and tone are selected now, and the person can't see what Cancel will bring back.

**Context:** `handleCancelRemix` and `handleSave` in `src/components/remix-question-drawer/remix-question-drawer.tsx`. Record the settings with each saved remix. Deferred during the v0.4.4.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Close small remix drawer gaps

**What:** (1) Treat an AI remix that comes back blank (`addPersonalQuestion` returns `null`) as a failure instead of showing a Save button that does nothing. (2) Disable the style, tone and tag controls while a remix runs, so a run's text isn't saved under settings picked mid-run. (3) Move focus to Cancel if Remix becomes disabled after the AI limit updates following a cancel, and move focus to Save or Remix when a run finishes while Cancel had focus.

**Why:** Each leaves the drawer in a confusing state for some people. (1) and (2) predate v0.4.4.0; (3) are edge cases of the focus handling added in it.

**Context:** `src/components/remix-question-drawer/remix-question-drawer.tsx`. Deferred during the v0.4.4.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Analytics

### Don't count a merged signed-out like again after unlike/re-like

**What:** The sign-in merge marks questions liked but writes no signed-in "liked" analytics row, so a later unlike/re-like counts toward `totalLikes` again.

**Why:** Small like inflation for the same person on the same device.

**Context:** `convex/core/questions.ts` `recordAnalytics` dedupes signed-in likes on `by_userId_questionId_event`. Either have `mergeKnownLikedQuestions` insert a userId "liked" row (without raising `totalLikes`) per merged question, or also treat a prior like from the same session id as a prior like.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Performance

### Resolve org access once per call when loading liked questions

**What:** `canReadQuestion` re-reads the organization and membership for every org-private question in `getLikedQuestions` (and `readableQuestionIds`).

**Why:** About 2 extra reads per org-private like; matters only at thousands of them.

**Context:** `convex/lib/questionAccess.ts`, `convex/core/questions.ts` `getLikedQuestions`. A per-call `Map<orgId, {paid, membership}>` or hoisting the lookup (the org is fixed per call) fixes it. Revisit when gyms exist.

**Effort:** S
**Priority:** P3
**Depends on:** Real gym usage

### Batch the cleanup when a popular question is deleted

**What:** `removeQuestionReferences` deletes every `userQuestions` row for the question and reads every pending duplicate group, all in the delete's own transaction. Delete the question (and its embedding) inline, then clean the rest with a scheduled, paginated internal mutation, like `cleanDanglingQuestionReferencesPage`.

**Why:** A question seen by many thousands of people, or a very large duplicate backlog, would make the delete exceed Convex's per-transaction limits and fail. Reading every pending group also makes deletes conflict with a running duplicate-detection job.

**Context:** `convex/lib/questionReferences.ts`, called by admin `deleteQuestion` and `deletePersonalQuestion`. About 3 rows per question and ~70 pending groups today. Deferred in the v0.3.1.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** Real usage growth

### Read reviewed questions for the admin list by index

**What:** `getQuestions` walks `by_creation_time` newest first and filters out pending rows, so each load reads every pending question newer than the 100th reviewed one.

**Why:** The scan grows with the review backlog and would hit Convex's read limit if thousands of questions waited for review.

**Context:** `convex/admin/questions.ts` `getQuestions`. Query `by_status` per reviewed status and merge by `_creationTime`, or add an indexed review field. Negligible at about 400 questions.

**Effort:** S
**Priority:** P3
**Depends on:** A growing review backlog

## Tests and docs

### Test saving the session id when consent arrives after page load

**What:** Add a `useLocalStorageContext` test that mounts without consent, rerenders with consent, and checks the in-use id is saved unchanged and survives a remount.

**Why:** That is the usual first-visit path, and a refactor of `useSessionId`'s effect deps would break it without failing any test.

**Context:** `src/hooks/useStorage.session.test.tsx`; a ready stub was proposed in the v0.1.0.0 review.

**Effort:** S
**Priority:** P3
**Depends on:** None

### List getQuestionsByIds in the canReadQuestion docstring

**What:** The caller list in `convex/lib/questionAccess.ts` omits `getQuestionsByIds`.

**Why:** A reader could group it with the older paths that apply their own status checks.

**Context:** Or drop the caller list and keep only the caveat about `collections.ts` and `schedules.ts`.

**Effort:** S
**Priority:** P4
**Depends on:** None

## Completed

### Route the remaining schedule path through the shared visibility rule

**What:** One schedule path still applies its own visibility check instead of `canReadQuestion`. The specifics are in the owner's private plan doc.

**Why:** Question visibility should follow one rule everywhere.

**Context:** Add a convex-test case alongside the change.

**Effort:** S
**Priority:** P2
**Depends on:** None
**Completed:** v0.3.0.0 (2026-09-30)
