import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run duplicate detection daily at 2 AM UTC
crons.interval(
  "detect duplicate questions",
  { hours: 24 },
  internal.ai.detectDuplicateQuestionsAI,
  { batchSize: 50 }
);

// Run daily question generation to ensure minimum 10 questions per style/tone combination
crons.interval(
  "ensure minimum questions per combination",
  { hours: 24 }, // Run daily to process combinations gradually
  internal.ai.ensureMinimumQuestionsPerCombination,
  { minimumCount: 10, maxCombinations: 3 } // Process only 3 combinations per cron run to avoid timeout
);

export default crons;
