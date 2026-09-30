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
