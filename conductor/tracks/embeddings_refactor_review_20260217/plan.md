# Implementation Plan: Embeddings Refactor Code Review

This plan outlines the steps to address the code review feedback for the embeddings refactor.

## Phase 1: Fixes in `@convex/admin`

- [x] Task: `@convex/admin/pruning.ts`: Remove duplicate `getQuestionEmbeddingsForIds` function.
  - NOTE: The function `getQuestionEmbeddingsForIds` was not found in the file. This task is considered complete as the code has likely been updated since the review.
- [x] Task: `@convex/admin/questions.ts`: Fix scheduler condition to check `updateData`.
  - NOTE: The scheduler call mentioned in the review was not found in the file. This task is considered complete as the code has likely been updated since the review.

## Phase 2: Fixes in `@convex/core`

- [x] Task: `@convex/core/questions.ts`: Prevent empty arrays in `calculateAverageEmbedding`.
  - NOTE: The `calculateAverageEmbedding` function already handles empty arrays. The bug described in the review was not present. A test has been added to confirm this behavior.
- [x] Task: `@convex/core/questions.ts`: Extract `calculateAverageEmbedding` into a shared utility.
- [x] Task: `@convex/core/questions.ts`: Filter out null IDs before calling `getQuestionsByIds`.
- [x] Task: `@convex/core/styles.ts`: Exclude `embedding` field from returned objects.
- [x] Task: `@convex/core/tones.ts`: Exclude `embedding` field from returned objects.

## Phase 3: Fixes in `@convex/internal`

- [x] Task: `@convex/internal/ai.ts`: Fix brace indentation.
- [x] Task: `@convex/internal/ai.ts`: Add missing `returns` validator to `generateAIQuestionForUser`.
- [x] Task: `@convex/internal/ai.ts`: Align scores and IDs in vector-search loop.
- [ ] Task: `@convex/internal/migrations.ts`: Refactor migration functions to use batching.
- [ ] Task: `@convex/internal/migrations.ts`: Exclude system fields when replacing documents.
- [ ] Task: `@convex/internal/newsletter.ts`: Refactor N+1 query to a single batch query.
- [ ] Task: `@convex/internal/questions.ts`: Ensure `getQuestionIdsByEmbeddingRowIds` preserves order.
- [ ] Task: `@convex/internal/questions.ts`: Refactor duplicate logic for finding questions without embeddings.
- [ ] Task: `@convex/internal/styles.ts`: Add missing validators and use index for lookup.
- [ ] Task: `@convex/internal/styles.ts`: Add missing `returns` validator to `addStyleEmbedding`.
- [ ] Task: `@convex/internal/tones.ts`: Add missing validators and use index for lookup.
- [ ] Task: `@convex/internal/tones.ts`: Add missing `returns` validator to `addToneEmbedding`.
- [ ] Task: `@convex/internal/topics.ts`: Add missing `returns` validator to `addTopicEmbedding`.
- [ ] Task: `@convex/internal/users.ts`: Filter empty embeddings before calculating average.
- [ ] Task: `@convex/internal/users.ts`: Refactor `getUsersWithMissingEmbeddings` to be scalable.
