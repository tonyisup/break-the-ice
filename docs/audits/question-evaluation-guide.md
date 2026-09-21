# Question evaluation and pilot review

## Calibration set

`question-evaluation-set.json` contains 16 authored examples: eight acceptable and
eight unacceptable, with contextual labels and rationales. Codex completed an
initial editorial pass on 2026-09-19. These are **provisional assistant labels**,
not owner-approved judgments or a sample of measured production performance.
The owner should review each label before using this as the acceptance baseline.
In particular, confirm the desired depth of serious questions and how much
repeated construction is acceptable within a batch.

Repeated construction is contextual. A familiar sentence opener alone does not
make a question unacceptable. Engagement metrics are deliberately excluded from
these labels. A question can be good even when few people have seen or liked it.

The generation prompt, acceptance thresholds, and taxonomy rubric are unchanged.
Do not change them until the calibration labels are approved. Freeze the approved
fixture version, run the old and proposed evaluator against identical examples,
and report false accepts and false rejects separately, broken down by editorial
reason. Report batch-level repetition checks with their supplied context.
Do not treat agreement on these 16 examples as a production quality estimate;
add a held-out sample of real generated questions before drawing that conclusion.

## Existing-library pilot

Review up to ten questions in `/admin/prune`. Each card requires a written reason
for Keep, Prune, or Save draft. Remix only creates a draft; compare it with the
original, edit it if necessary, and explicitly save or discard it. Saving does not
close the review: then Keep or Prune the resulting question. The page holds the
current batch instead of automatically adding more cards as decisions are made.
Open Recent review history and check every outcome before starting another batch.

Record the batch date, question IDs, signal/editorial reason, decision, reviewer,
and any corrections. Report Keep, Prune, Edit, Remix, and Undo counts separately
from generation-evaluation accuracy. Kept questions are not automatically
requeued for the same unchanged content; a manual flag can reopen review.

The regression suite runs a two-question local pilot: it keeps an acceptable
low-engagement question, prunes an ambiguous question, verifies the history, and
undoes the prune. Additional tests exercise edits, embedding races, duplicate
retirement, reference preservation, and undo conflicts. This verifies workflow
behavior using isolated fixtures. **No live library review batch has been run.**
A live pilot should follow deployment and owner calibration; check its outcomes
before a library-wide review. No library-wide mutation is performed by this work.

## Duplicate preservation decision

Resolving a group keeps one question in discovery and retires the other copies
with `status: pruned`, a timestamp, and a `duplicateOf` link. Records, original
text, images, counters, and IDs remain intact. Collections, user history, analytics,
and scheduled assignments keep referencing the original questions. There is no
counter aggregation, history rewriting, or redirection to different text.

Existing public URLs, their images, and social previews remain readable for
retired duplicate copies that were public before resolution. Private copies do
not gain public visibility. Ordinary editorial pruning does not gain this public
link exception. The retained question must belong to the same group and question
workspace; all other members must be selected, still exist, and be unretired.
The old bulk duplicate-deletion endpoint now refuses the operation.

The mutation records the authenticated reviewer, reason, before/after text and
status, and all members together. Undo reopens the group and restores previous
states atomically. It fails if a newer edit/review changed a member; it never
silently overwrites newer work. Text edits and undo remove stale vectors and
schedule regeneration. Late embedding results are accepted only if the text
still matches. Missing embeddings remain eligible for the existing retry job.

Undo supports text/status reviews, Keep, Prune, and duplicate decisions. Mixed
admin edits involving tags, taxonomy, or images are recorded but are not offered
as undoable, since deleted image blobs and related changes cannot be restored
from the text/status snapshot. Manual flag events are recorded without undo;
Keep closes a flag after inspection. History shows the latest 30 events per
review area, and records both the original and undo reviewer.

## Verification — 2026-09-19

- Full Vitest suite: 62 files, 268 tests passed. See the [retained run output](question-review-vitest-2026-09-19.txt) for the command, counts, and timing.
- Type checks and production build passed. Changed files have no ESLint errors;
  repository-wide lint still fails on existing errors elsewhere.
- Local fixture browser checks: pruning and duplicates render at desktop/mobile
  widths without error overlays or horizontal overflow. Remix makes no question
  mutation until Save; saving records its text, reason, source, and revision.
- 21st local UI review: zero findings. Its project-context scan reused existing
  shadcn components and tokens. Catalog search was unavailable without 21st login;
  no generated or downloaded component was installed.


## Review-fix verification — 2026-09-21

- `npm run test:run` completed successfully: 62 files, 273 tests passed. The
  [saved output](question-review-vitest-2026-09-21.txt) includes the exact run
  results. New coverage checks required review metadata, normalized storage for
  large reviews, and recovery from failed duplicate resolve/reject/edit requests.
- `npm run typecheck` and `npm run build` passed. Existing lint errors in the
  question list, question detail, and pool pages remain outside these fixes.
- Generic design tokens now match `:root`; `.dark` values are separate overrides.
  The design Markdown was regenerated from that corrected snapshot.
- Review metadata lives in `questionReviews`; before/after snapshots live in
  `questionReviewChanges`, indexed by `reviewId`. History joins these records;
  undo still validates every changed question before restoring the group.
