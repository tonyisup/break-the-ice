import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

// Regression: launch checklist item 13 — timed-out feedback could be retried without duplicate protection.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

test("submitFeedback stores one message when the same submission is retried", async () => {
  const t = convexTest(schema, convexFunctionModules);
  const args = {
    text: "Please add more team prompts.",
    pageUrl: "https://breaktheiceberg.com/contact",
    submissionId: "submission-123",
    sessionId: "session-123",
  };

  await t.mutation(api.core.feedback.submitFeedback, args);
  await t.mutation(api.core.feedback.submitFeedback, args);

  const feedback = await t.run(async (ctx) => ctx.db.query("feedback").collect());

  expect(feedback).toHaveLength(1);
  expect(feedback[0]?.submissionId).toBe("submission-123");
  expect(feedback[0]?.text).toBe("Please add more team prompts.");
});
