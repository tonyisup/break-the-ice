import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run duplicate detection daily at 2 AM UTC
crons.interval(
  "detect duplicate questions",
  { hours: 24 },
  internal.ai.detectDuplicateQuestionsAndEmail,
  { batchSize: 50 }
);

// Run daily question generation to ensure minimum 10 questions per style/tone combination
crons.interval(
  "ensure minimum questions per combination",
  { hours: 24 }, // Run daily to process combinations gradually
  internal.ai.ensureMinimumQuestionsPerCombinationAndEmail,
  { minimumCount: 10, maxCombinations: 3 } // Process only 3 combinations per cron run to avoid timeout
);

crons.interval(
  "populate missing question embeddings",
  { hours: 24 },
  internal.ai.populateMissingEmbeddings,
  { maxBatchSize: 50 }
);

crons.interval(
  "update users with missing embeddings",
  { hours: 24 },
  internal.users.updateUsersWithMissingEmbeddingsAction,
);

crons.interval(
  "prune stale questions",
  { hours: 24 },
  internal.questions.pruneStaleQuestionsAndEmail,
  { maxQuestions: 50 }
);

crons.daily(
  "Post to Instagram",
  { hourUTC: 17, minuteUTC: 0 }, // 5:00 PM UTC (e.g. 9 AM PST / 12 PM EST)
  internal.instagram.postToInstagram
);

export default crons
