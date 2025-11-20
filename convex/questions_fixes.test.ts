import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

// Mock environment variables before importing modules that use them
process.env.AI_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";

import { internal } from "./_generated/api";
import schema from "./schema";

test("reproduce ReturnsValidationError in getQuestionsWithMissingEmbeddings", async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert("questions", {
      text: "Test Question",
      style: "open-ended",
      tone: "deep-thoughtful",
      isAIGenerated: true,
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: Date.now(),
      // embedding is missing
    });
  });

  // Call the internal query
  // We expect this to fail if the return value doesn't match the validator
  const result = await t.query(internal.questions.getQuestionsWithMissingEmbeddings);

  expect(result).toHaveLength(1);
  // The error reported was about extra fields like _creationTime
  // If the bug exists, t.query might throw or return objects with extra fields

  // If it doesn't throw, we verify the keys
  const keys = Object.keys(result[0]);
  console.log("Result keys:", keys);

  expect(keys).toContain("_id");
  expect(keys).toContain("text");
  expect(keys).not.toContain("_creationTime");
});
