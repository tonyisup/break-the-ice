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

export default crons;
