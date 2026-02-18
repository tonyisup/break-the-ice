# CodeRabbit review

Inline comments:
In `@convex/admin/pruning.ts`:

- Around line 240-254: The function getQuestionEmbeddingsForIds duplicates
  internal.internal.questions.getEmbeddingsByQuestionIds; remove
  getQuestionEmbeddingsForIds and update gatherPruningTargetsImpl to call the
  existing getEmbeddingsByQuestionIds (importing or referencing
  internal.internal.questions.getEmbeddingsByQuestionIds as used elsewhere) to
  fetch embeddings for the list of questionIds, preserving the returned shape ({
  questionId, embedding }[]); ensure any callers and types in
  gatherPruningTargetsImpl are adjusted to use the consolidated function and
  delete the redundant function declaration from this file.

In `@convex/admin/questions.ts`:

- Around line 154-158: The sync is gated on the original args
  (status/styleId/toneId) so updates that resolve string fields into
  updateData.styleId/updateData.toneId are missed; change the condition before
  ctx.scheduler.runAfter(...) to check updateData.status, updateData.styleId, and
  updateData.toneId (i.e., use updateData.field !== undefined) so that
  internal.internal.questions.syncQuestionEmbeddingFilters is scheduled whenever
  the resolved updateData contains those changes; keep the same scheduler call and
  questionId payload (id).

In `@convex/core/questions.ts`:

- Around line 483-504: The bug is that an empty array (userEmb?.embedding ?? [])
  can be included in the embeddings passed to calculateAverageEmbedding, risking
  inconsistent/skewed results; update the code around the embeddings construction
  (the embeddings variable and its population) so you only include
  userEmb.embedding when it exists and is a non-empty array (e.g., check userEmb
  && Array.isArray(userEmb.embedding) && userEmb.embedding.length > 0 before
  pushing), or alternatively ensure calculateAverageEmbedding is always fed a
  filtered list by removing any empty arrays before calling it; reference the
  variables userEmb, embeddings and the function calculateAverageEmbedding when
  making the change.

In `@convex/core/styles.ts`:

- Around line 28-29: The current destructuring in conv﻿ex/core/styles.ts only
  removes organizationId (const { organizationId: \_o, ...rest } = style), leaving
  embedding in rest which triggers ReturnsValidationError against returns:
  v.object(publicStyleFields); update the destructuring to also remove embedding
  (e.g., destructure embedding as a throwaway) wherever style objects are
  processed so the spread does not include embedding; apply this change across all
  handlers mentioned (getStyle, getStyleById, getStylesWithExamples, getStyles,
  getFilteredStyles, getRandomStyle, getRandomStyleForUser) so returned objects
  conform to publicStyleFields until dropEmbeddingsFromMainTables migration runs.

In `@convex/core/tones.ts`:

- Around line 26-27: The handlers are currently only stripping organizationId
  (e.g., const { organizationId: \_o, ...rest } = tone) but must also defensively
  remove embedding to avoid validation failures; update all occurrences in this
  file (functions getTone, getToneById, getTones, getFilteredTones, getRandomTone,
  getRandomToneForUser) to destructure out both embedding and organizationId
  (e.g., const { embedding: \_e, organizationId: \_o, ...rest } = tone) and return
  rest, and do the same inside any .map() callbacks so no embedding field is
  returned to the v.object(publicToneFields) validator.

In `@convex/internal/migrations.ts`:

- Around line 17-97: The migration functions copyEmbeddingsToSeparateTables and
  dropEmbeddingsFromMainTables currently call .collect() and process entire tables
  in one mutation, which can exceed Convex per-transaction read/write limits;
  change both to batched mutations that accept (cursor?, limit) parameters and
  only query/process a page (e.g., using
  .withIndex(...).limit(limit).after(cursor) or equivalent), return the next
  cursor and counts, and add an internalAction orchestration function that
  repeatedly invokes the batched internalMutation until no cursor is returned;
  update the code paths that call these migrations to use the new internalAction
  and ensure uniqueness checks (e.g., existing lookups in question_embeddings,
  style_embeddings, etc.) remain inside the batched mutation so each batch is safe
  and idempotent.
- Around line 120-127: The current loop destructures embedding but leaves Convex
  system fields in the replacement object; update the destructuring of q in the
  migration (where you build rest for ctx.db.replace) to also extract and omit \_id
  and \_creationTime (e.g., destructure embedding as \_e and \_id and \_creationTime
  out of q) so that the object passed to ctx.db.replace(q.\_id, rest) contains only
  app-level fields; keep using the same q iteration and ctx.db.replace call but
  ensure rest excludes \_id and \_creationTime before replacing.

In `@convex/internal/questions.ts`:

- Around line 258-270: The getQuestionIdsByEmbeddingRowIds handler currently
  filters out missing rows which breaks positional alignment; update the signature
  and handler so it returns an array preserving input order with nulls for missing
  entries: change the return type to an array of nullable question ids (e.g.,
  v.array(v.null("questions"))) and in the loop for each args.embeddingRowIds use
  ctx.db.get(rowId) and push row?.questionId ?? null to the ids array so indices
  line up with embeddingRowIds. Ensure the exported function name
  getQuestionIdsByEmbeddingRowIds and args.embeddingRowIds remain unchanged.

In `@convex/internal/styles.ts`:

- Around line 64-79: The mutation updateQuestionsWithMissingStyleIds is missing
  Convex validators and is using .filter() for style lookup; add validators to the
  internalMutation call (args: v.null() and returns: v.null()) and replace the
  styles query to use the by_my_id index via .withIndex("by_my_id", (s) =>
  s.eq(s.field("id"), q.style)).first() so the code looks up styles efficiently
  and the function satisfies the required args/returns validators while keeping
  the existing patch and scheduler.runAfter logic.

In `@convex/internal/tones.ts`:

- Around line 50-65: Add missing Convex validators to
  updateQuestionsWithMissingToneIds by supplying args: {} and returns: v.null() to
  the internalMutation call, and replace the inefficient .filter(...) query on
  "tones" with .withIndex("by_my_id", (t) => t.eq(t.field("id"), q.tone)) so the
  tone lookup uses the index; keep the rest of the logic (first(), patch,
  scheduler.runAfter) unchanged.

---

Outside diff comments:
In `@convex/core/questions.ts`:

- Around line 7-34: Duplicate implementations of calculateAverageEmbedding exist
  (one in the current file and another in users.ts) which can diverge; extract a
  single canonical implementation into a shared module (e.g., create an embeddings
  utility exporting calculateAverageEmbedding) and import it from both places.
  Move the robust version that filters out empty embeddings and skips
  length-mismatched entries (the implementation shown here) into that shared
  utility, export it, then replace the local implementations in both modules with
  an import of the shared calculateAverageEmbedding to ensure a single source of
  truth.

In `@convex/internal/ai.ts`:

- Around line 532-543: The closing brace for the if (userEmb && userEmb.length >

0. block is mis-indented and appears to close the surrounding try; fix by moving
   the brace indentation so it lines up with the opening if statement and the
   nested code (the block around userEmb, getUserEmbedding,
   getNearestQuestionsByEmbedding and building userContext), ensuring the try
   block's braces remain distinct from the if block to make control flow clear
   (adjust the indentation of the `}` that follows the examples.length check to
   match the `if (userEmb && userEmb.length > 0)` line).

- Around line 471-478: The internalAction generateAIQuestionForUser is missing a
  returns validator; add a returns validator to the internalAction declaration
  that matches the handler's return type (an array of questions or nulls) so the
  function signature uses both args and returns validators. Update the
  internalAction call for generateAIQuestionForUser to include returns: with a
  validator equivalent to an array of nullable question documents (matching
  Promise<(Doc<"questions"> | null)[]>) so the runtime type-checking aligns with
  the handler.
- Around line 155-183: The vector-search loop in convex/internal/ai.ts is
  misaligning scores and resolved IDs because getQuestionIdsByEmbeddingRowIds
  filters out missing questionIds; update getQuestionIdsByEmbeddingRowIds so it
  preserves positional correspondence with the input embeddingRowIds (return null
  for rows without a questionId instead of skipping them) so callers like the loop
  that uses searchResults[i].\_score and matchQuestionIds[i] stay aligned; also add
  the missing Convex return validator to generateAIQuestionForUser by adding
  returns: v.array(v.union(v.id("questions"), v.null())) to its function
  definition to satisfy Convex schema requirements.

In `@convex/internal/newsletter.ts`:

- Around line 86-108: The loop is doing N+1 sequential ctx.runQuery calls by
  fetching each question with internal.internal.questions.getQuestionById for
  every candidateId; change this to a single batch query (e.g., add/internalize
  internal.internal.questions.getQuestionsByIds that accepts an array of ids) and
  call ctx.runQuery once with candidateIds (from getQuestionIdsByEmbeddingRowIds),
  then perform the filtering logic (checking .text, .prunedAt, .status,
  .styleId/.toneId against excludedStyleIds/excludedToneIds and
  excludedQuestionIds) in-memory over the returned array to pick the first valid
  question; keep the same early-exit semantics (assign question and break) but
  based on the filtered batch result.

In `@convex/internal/questions.ts`:

- Around line 67-83: Duplicate logic for finding questions without embeddings
  exists in getQuestionsToEmbed and getQuestionsWithMissingEmbeddings; refactor by
  extracting a single internalQuery (e.g., getQuestionsMissingEmbeddings or a
  shared handler function) that: loads question_embeddings, builds the
  withEmbeddingIds Set, queries "questions" filtering out undefined text, and
  accepts an optional limit parameter and return-shape flag; then have
  getQuestionsToEmbed call that shared query with limit: 10 and have
  getQuestionsWithMissingEmbeddings call it with no limit (or its own
  limit/shape), updating the references to the shared function in both handlers
  (use the existing symbols getQuestionsToEmbed and
  getQuestionsWithMissingEmbeddings to locate call sites).

In `@convex/internal/styles.ts`:

- Around line 43-62: The addStyleEmbedding internalMutation is missing a returns
  validator; update the internalMutation call for addStyleEmbedding to include a
  returns property (use returns: v.null() since it doesn't return a value)
  alongside the existing args validator so the function signature validates both
  inputs and its null return; ensure the unique symbol addStyleEmbedding and the
  internalMutation invocation are the places you modify.

In `@convex/internal/tones.ts`:

- Around line 29-48: The addToneEmbedding internalMutation is missing a returns
  validator; modify the internalMutation call for addToneEmbedding to include
  returns: v.null() alongside args so it validates the null return (same pattern
  used in addStyleEmbedding and addTopicEmbedding); update the internalMutation
  definition for addToneEmbedding to include the returns validator (keeping the
  existing args: toneId and embedding and the existing handler unchanged).

In `@convex/internal/topics.ts`:

- Around line 5-24: The addTopicEmbedding internalMutation is missing a return
  validator; update its declaration to include returns: v.null() alongside the
  existing args so the function signature validates that it returns nothing (add
  the returns property in the object passed to internalMutation for
  addTopicEmbedding and use v.null()).

In `@convex/internal/users.ts`:

- Around line 243-258: The code collects embeddings via getQuestionEmbedding
  into userQuestionEmbeddings and then calls calculateAverageEmbedding, but empty
  arrays ([]) from getQuestionEmbedding can be first and cause
  calculateAverageEmbedding to treat the vector dimension as zero; filter out
  falsy/empty embeddings from userQuestionEmbeddings before calling
  calculateAverageEmbedding (e.g., remove entries where length === 0), handle the
  case where no valid embeddings remain (set questionPreferenceEmbedding to [] or
  null as appropriate) and then call updateUserPreferenceEmbedding with the
  filtered-average for args.userId to avoid diluting or returning an empty average
  when valid embeddings exist later in the list.
- Around line 264-273: getUsersWithMissingEmbeddings currently calls
  ctx.db.query("user_embeddings").collect() to load all embedding rows into
  memory; to fix, replace this full-collect approach in the handler with a
  scalable strategy—either perform a database-side anti-join (query "users" with a
  NOT EXISTS/left-join filter against "user_embeddings") or implement a paginated
  scan over "users" and check existence per-page against "user_embeddings" (e.g.,
  query by batch and filter using ctx.db.query(...) with an indexed lookup) so you
  never load all embedding rows; update the handler in
  getUsersWithMissingEmbeddings to use the chosen approach referencing
  user_embeddings, users, handler, and ctx.db.query.

---

Duplicate comments:
In `@convex/core/questions.ts`:

- Around line 274-298: getQuestionIdsByEmbeddingRowIds can return nullable
  entries, but this code passes the raw ids to
  api.core.questions.getQuestionsByIds; before calling
  ctx.runQuery(internal.internal.questions.getQuestionIdsByEmbeddingRowIds)
  results are mapped to embeddingRowIds, then after getting ids you must filter
  out null/undefined entries (e.g., const validIds = ids.filter(Boolean)) and
  early-return if validIds.length === 0, then call
  ctx.runQuery(api.core.questions.getQuestionsByIds, { ids: validIds }); update
  any subsequent use (e.g., the questions/filtered logic) to reference the results
  of the query for validIds.
