/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { validate } from "convex-helpers/validators";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { questionValidator } from "./admin/pruning";
import schema from "./schema";

describe("admin pruning", () => {
  test("accepts current question documents when gathering pruning candidates", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));

    const questionId = await t.run(async (ctx) => {
      return await ctx.db.insert("questions", {
        averageViewDuration: 1_500,
        fingerprint: "q_current_schema",
        quality: { readability: 4, storyYield: 3 },
        source: "ai",
        status: "public",
        text: "Which small ritual makes a busy day feel manageable?",
        totalLikes: 0,
        totalShows: 50,
      });
    });

    const candidates = await t.query(
      internal.admin.pruning.getQuestionsForPruningReview,
      {},
    );
    const question = await t.run(async (ctx) => ctx.db.get(questionId));

    expect(candidates.map((question) => question._id)).toContain(questionId);
    expect(() =>
      validate(questionValidator, question, { throw: true }),
    ).not.toThrow();
  });
});
