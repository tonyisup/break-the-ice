import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { convexFunctionModules } from "../../vitestConvexModules";

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

test("only publishes reviewed questions and stores their editorial scores", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, convexFunctionModules);
  const ids = await t.run(async ctx => ({
    styleId: await ctx.db.insert("styles", { id: "confession", name: "Confession", structure: "Ask for a light confession", color: "#666666", icon: "MessageCircle" }),
    toneId: await ctx.db.insert("tones", { id: "light", name: "Light", promptGuidanceForAI: "Keep it light", color: "#666666", icon: "Sun" }),
  }));
  const result = await t.mutation(internal.internal.generation.insertGeneratedQuestions, {
    ...ids, styleSlug: "confession", toneSlug: "light", styleVersion: 1, toneVersion: 1,
    candidates: [
      { text: "What snack do you save for when nobody else is around?", editorialReview: { readability: 5, answerability: 4, styleFit: 5, toneFit: 4, reasons: [] } },
      { text: "What is your favorite breakfast?" },
      { text: "What browser tab strategy are you most like?", editorialReview: { readability: 3, answerability: 2, styleFit: 2, toneFit: 4, reasons: ["Strained comparison"] } },
    ],
  });
  expect(result.insertedCount).toBe(1);
  expect(result.rejectedCount).toBe(2);
  expect(result.rejected[0].reasons).toContain("editorial review required");
  const stored = await t.run(ctx => ctx.db.query("questions").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ status: "public", quality: { readability: 5, answerability: 4, styleFit: 5, toneFit: 4 } });
});
