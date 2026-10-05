"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";
import { ensureAiRequestAllowed } from "../lib/aiRateLimit";
import { billedFailure, wasAiCallBilled } from "../lib/aiSpendGuard";
import {
  normalizePersistableTeamPromptText,
  optionalTeamTopicText,
  requireTeamTopicText,
} from "../lib/teamPromptContract";

const PREVIEW_COUNT = 3;

type TopicPreviewArgs = {
  organizationId: Id<"organizations">;
  name: string;
  guidance: string;
  boundaries?: string;
  styleId: Id<"styles">;
  toneId: Id<"tones">;
};

/**
 * Previews three questions for a topic. The action checks the topic fields before the AI
 * rate limit; they are checked again here (trimming is idempotent) so no caller can send
 * blank or over-long text to the model.
 */
export async function runTopicPreviewWithUsage(
  ctx: Parameters<typeof runPreviewQuestionGeneration>[0],
  args: TopicPreviewArgs,
  generatePreview: typeof runPreviewQuestionGeneration = runPreviewQuestionGeneration,
): Promise<{ questions: string[]; runId: Id<"generationRuns"> }> {
  const name = requireTeamTopicText(args.name, "name");
  const guidance = requireTeamTopicText(args.guidance, "guidance");
  const boundaries = optionalTeamTopicText(args.boundaries, "boundaries");
  const userId = await ctx.runQuery(
    internal.core.teamPrompts.authorizeTopicPreview,
    {
      organizationId: args.organizationId,
      styleId: args.styleId,
      toneId: args.toneId,
    },
  );
  const userContext = [
    `Team conversation topic: ${name}`,
    `Desired outcome: ${guidance}`,
    boundaries ? `Boundaries: ${boundaries}` : undefined,
    "Return distinct options that a facilitator can ask exactly as written.",
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.runMutation(internal.internal.users.checkAndIncrementAIUsage, {
    userId,
    organizationId: args.organizationId,
  });

  try {
    const preview = await generatePreview(ctx, {
      requestedByUserId: userId.toString(),
      styleId: args.styleId,
      toneId: args.toneId,
      userContext,
      batchSize: PREVIEW_COUNT,
    });

    const persistableQuestions = preview.previewTexts
      .map(normalizePersistableTeamPromptText)
      .filter((question): question is string => question !== null);
    const distinctQuestions = [...new Set(persistableQuestions)];
    // The provider has already charged for this answer, so an unusable one keeps its
    // usage and reaches the manager as a readable error. The counts are logged because
    // the readable error doesn't say which check failed.
    if (distinctQuestions.length < PREVIEW_COUNT) {
      console.warn("Topic preview options could not be used", {
        runId: preview.runId,
        generated: preview.previewTexts.length,
        persistable: persistableQuestions.length,
        distinct: distinctQuestions.length,
      });
    }
    if (distinctQuestions.length === 0) {
      throw billedFailure(new Error("No persistable topic preview questions were generated."));
    }
    if (distinctQuestions.length < PREVIEW_COUNT) {
      throw billedFailure(
        new Error("Exactly three distinct topic preview questions are required."),
      );
    }
    const questions = distinctQuestions.slice(0, PREVIEW_COUNT);

    return { questions, runId: preview.runId };
  } catch (error) {
    // A preview whose answer was paid for keeps its usage.
    if (!wasAiCallBilled(error)) {
      await ctx.runMutation(internal.internal.users.decrementAIUsage, {
        userId,
        organizationId: args.organizationId,
      });
    }
    throw error;
  }
}

export const previewTopicQuestions = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    guidance: v.string(),
    boundaries: v.optional(v.string()),
    styleId: v.id("styles"),
    toneId: v.id("tones"),
  },
  returns: v.object({
    questions: v.array(v.string()),
    runId: v.id("generationRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ questions: string[]; runId: Id<"generationRuns"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    // Checked before the AI rate limit, so a request refused for its input doesn't
    // spend the caller's AI requests.
    const name = requireTeamTopicText(args.name, "name");
    const guidance = requireTeamTopicText(args.guidance, "guidance");
    const boundaries = optionalTeamTopicText(args.boundaries, "boundaries");
    await ensureAiRequestAllowed(ctx);
    return await runTopicPreviewWithUsage(ctx, { ...args, name, guidance, boundaries });
  },
});
