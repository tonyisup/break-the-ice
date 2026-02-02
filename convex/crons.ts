import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Run duplicate detection daily at 2 AM UTC
// crons.interval(
//   "detect duplicate questions",
//   { hours: 24 },
//   internal.ai.detectDuplicateQuestionsAndEmail,
//   { batchSize: 50 }
// );

// Run daily question generation to ensure minimum 10 questions per style/tone combination
// crons.interval(
//   "ensure minimum questions per combination",
//   { hours: 24 }, // Run daily to process combinations gradually
//   internal.ai.ensureMinimumQuestionsPerCombinationAndEmail,
//   { minimumCount: 10, maxCombinations: 3 } // Process only 3 combinations per cron run to avoid timeout
// );

crons.interval(
  "populate missing question embeddings",
  { hours: 24 },
  internal.ai.populateMissingEmbeddings,
  { maxBatchSize: 50 }
);

crons.interval(
  "populate missing style embeddings",
  { hours: 24 },
  internal.ai.populateMissingStyleEmbeddings,
);

crons.interval(
  "update users with missing embeddings",
  { hours: 24 },
  internal.users.updateUsersWithMissingEmbeddingsAction,
);

crons.interval(
  "populate missing styles embeddings",
  { hours: 24 },
  internal.ai.populateMissingStyleEmbeddings,
);

crons.interval(
  "populate missing tones embeddings",
  { hours: 24 },
  internal.ai.populateMissingToneEmbeddings
);

crons.interval(
  "update questions with missing styles",
  { hours: 24 },
  internal.styles.updateQuestionsWithMissingStyleIds,
);
crons.interval(
  "update questions with missing tones",
  { hours: 24 },
  internal.tones.updateQuestionsWithMissingToneIds
);
// crons.interval(
//   "prune stale questions",
//   { hours: 24 },
//   internal.questions.pruneStaleQuestionsAndEmail,
//   { maxQuestions: 50 }
// );

// crons.daily(
//   "Post to Instagram",
//   { hourUTC: 17, minuteUTC: 0 }, // 5:00 PM UTC (e.g. 9 AM PST / 12 PM EST)
//   api.instagram.postToInstagram
// );

// Nightly question pool generation - generates fresh AI questions for daily use
crons.cron(
  "generate nightly question pool",
  "0 10 * * *", // 2:00 AM PST
  internal.ai.generateNightlyQuestionPool,
  { targetCount: 5, maxCombinations: 10 } // ~50 questions per night
);

// Assign pool questions to newsletter subscribers (runs after pool generation)
crons.cron(
  "assign pool questions to users",
  "0 11 * * *", // 3:00 AM PST (1 hour after generation)
  internal.questions.assignPoolQuestionsToUsers,
  { questionsPerUser: 6 }
);

export default crons
