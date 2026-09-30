import { describe, expect, test } from "vitest";
import * as ai from "./core/ai";
import * as questions from "./core/questions";
import * as tags from "./core/tags";
import * as instagram from "./instagram";

// These ran with no auth check (or wrote shared data), so the client must not be able to call them.
describe("locked-down functions stay off the public API", () => {
  test.each([
    ["core/tags:initializeTags", tags.initializeTags],
    ["instagram:postToInstagram", instagram.postToInstagram],
  ])("%s is internal", (_name, fn) => {
    expect(fn.isInternal).toBe(true);
    expect((fn as { isPublic?: boolean }).isPublic).toBeUndefined();
  });

  test("removed endpoints are no longer exported", () => {
    const aiExports = Object.keys(ai);
    const questionExports = Object.keys(questions);
    for (const name of ["preview", "generateFallbackQuestion", "generateAIQuestions", "generateAIQuestionForNewsletter"]) {
      expect(aiExports).not.toContain(name);
    }
    for (const name of ["discardQuestion", "getSimilarQuestions", "getNextQuestionsByEmbedding", "getNearestQuestionsByEmbedding"]) {
      expect(questionExports).not.toContain(name);
    }
    // The feed generator the client still uses stays public.
    expect(ai.generateAIQuestionForFeed.isPublic).toBe(true);
  });
});
