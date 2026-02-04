import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "populate missing question embeddings",
  { hours: 24 },
  internal.internal.ai.populateMissingEmbeddings,
  { maxBatchSize: 50 }
);

crons.interval(
  "populate missing style embeddings",
  { hours: 24 },
  internal.internal.ai.populateMissingStyleEmbeddings,
);

crons.interval(
  "update users with missing embeddings",
  { hours: 24 },
  internal.internal.users.updateUsersWithMissingEmbeddingsAction,
);

crons.interval(
  "populate missing styles embeddings",
  { hours: 24 },
  internal.internal.ai.populateMissingStyleEmbeddings,
);

crons.interval(
  "populate missing tones embeddings",
  { hours: 24 },
  internal.internal.ai.populateMissingToneEmbeddings
);

crons.interval(
  "update questions with missing styles",
  { hours: 24 },
  internal.internal.styles.updateQuestionsWithMissingStyleIds,
);
crons.interval(
  "update questions with missing tones",
  { hours: 24 },
  internal.internal.tones.updateQuestionsWithMissingToneIds
);

// Nightly question pool generation - generates fresh AI questions for daily use
crons.cron(
  "generate nightly question pool",
  "0 8 * * *", // 10:00 AM UTC (12:00 AM PST / 1:00 AM PDT)
  internal.internal.ai.generateNightlyQuestionPool,
  { targetCount: 5, maxCombinations: 10 } // ~50 questions per night
);

// Assign pool questions to newsletter subscribers (runs after pool generation)
crons.cron(
  "assign pool questions to users",
  "0 9 * * *", // 11:00 AM UTC (1:00 AM PST / 2:00 AM PDT)
  internal.internal.questions.assignPoolQuestionsToUsers,
  { questionsPerUser: 6 }
);

export default crons
