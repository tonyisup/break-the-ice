# Question review follow-up

Keep question-library cleanup in a focused follow-up session. Build on `/admin/prune`
and `/admin/duplicates`; a separate review page is not needed yet.

## Foundation at the time of the audit

- Pruning gathers candidates using engagement, hidden counts, and optional style/tone
  embedding similarity. The review page supports Keep, Prune, Edit, and Remix.
- Pruning changes status to `pruned` and retains the question record.
- Duplicate review presents candidate groups, allows a retained question to be selected,
  and has a completed-review view. Resolving duplicates currently deletes question and
  embedding records.

## Before cleaning the library

1. Add editorial reasons to the existing pruning queue: awkward wording, unclear answer,
   style/tone mismatch, and repeated construction. Include manual flagging so questions
   do not need engagement data to enter review.
2. Create a reviewed evaluation set with acceptable and unacceptable examples before
   changing the generation acceptance rubric. Keep generation improvements and existing
   library review independently measurable.
3. Show remix text as a draft with an explicit save action. The current Remix action
   immediately updates the question.
4. Refresh text fingerprints and embeddings after edits. The current `updateQuestion`
   mutation patches text without recomputing the fingerprint or scheduling text embedding
   regeneration; its embedding-filter sync only responds to status/style/tone changes.
5. Verify duplicate-group membership at mutation time and decide how to preserve saved
   collections, history, schedules, and shared links when merging duplicates. The current
   deletion mutation does not remap those references to the retained question.
6. Record the reviewer, reason, previous text/status, and outcome; provide an undo path
   where practical. Keep low engagement as a review signal, not proof of poor content.
7. Run a small review batch first and check the outcomes before a library-wide pass.

No question records were reviewed, edited, pruned, or deleted as part of the UI audit fixes.

## Implementation status — 2026-09-19

The existing review screens now support manual editorial flags, reasons, bounded
review batches, explicit remix drafts, authenticated audit history, and guarded
undo. Edits regenerate text fingerprints and embeddings, including protection
against embedding results arriving after another edit. Duplicate resolution
validates the group and retires copies while preserving their records and
references; it no longer deletes question records.

See [question-evaluation-guide.md](question-evaluation-guide.md) for the preservation
decision, undo limits, evaluation procedure, and live pilot checklist. The
[16-example calibration set](question-evaluation-set.json) has an initial assistant
editorial pass and still needs owner calibration. The generation acceptance
rubric remains unchanged. A small isolated regression pilot verifies the workflow;
the live library pilot and library-wide cleanup remain unperformed.
