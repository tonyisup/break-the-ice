# Specification: Embeddings Refactor Code Review

## Feature Description
This track addresses a series of issues found during the code review of the `refactor-embeddings` branch. The fixes involve removing duplicate code, correcting logic in several Convex functions, adding missing validators, and improving the efficiency of database queries.

## Issues to Address

### Inline Comments:
-   **`@convex/admin/pruning.ts`**: Remove duplicate function `getQuestionEmbeddingsForIds`.
-   **`@convex/admin/questions.ts`**: Fix scheduler condition to correctly check `updateData`.
-   **`@convex/core/questions.ts`**: Prevent empty arrays from being passed to `calculateAverageEmbedding`.
-   **`@convex/core/styles.ts`**: Exclude `embedding` field from returned objects.
-   **`@convex/core/tones.ts`**: Exclude `embedding` field from returned objects.
-   **`@convex/internal/migrations.ts`**: Refactor migration functions to use batching. Also, exclude system fields when replacing documents.
-   **`@convex/internal/questions.ts`**: Ensure `getQuestionIdsByEmbeddingRowIds` preserves order with nulls.
-   **`@convex/internal/styles.ts`**: Add missing validators and use an index for style lookup.
-   **`@convex/internal/tones.ts`**: Add missing validators and use an index for tone lookup.

### General Comments:
-   **`@convex/core/questions.ts`**: Extract `calculateAverageEmbedding` into a shared utility.
-   **`@convex/internal/ai.ts`**: Fix brace indentation, add missing `returns` validator, and align scores/IDs in vector-search loop.
-   **`@convex/internal/newsletter.ts`**: Refactor N+1 query to a single batch query.
-   **`@convex/internal/questions.ts`**: Refactor duplicate logic for finding questions without embeddings.
-   **`@convex/internal/styles.ts`**: Add missing `returns` validator to `addStyleEmbedding`.
-   **`@convex/internal/tones.ts`**: Add missing `returns` validator to `addToneEmbedding`.
-   **`@convex/internal/topics.ts`**: Add missing `returns` validator to `addTopicEmbedding`.
-   **`@convex/internal/users.ts`**: Filter empty embeddings before calculating average, and refactor `getUsersWithMissingEmbeddings` to be scalable.

### Duplicate Comments:
-   **`@convex/core/questions.ts`**: Filter out null IDs before calling `getQuestionsByIds`.
