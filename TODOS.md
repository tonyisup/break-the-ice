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

### Route the remaining schedule path through the shared visibility rule

**What:** One schedule path still applies its own visibility check instead of `canReadQuestion`. The specifics are in the owner's private plan doc.

**Why:** Question visibility should follow one rule everywhere.

**Context:** Add a convex-test case alongside the change.

**Effort:** S
**Priority:** P2
**Depends on:** None

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
