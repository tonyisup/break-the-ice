"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";
import { ensureAiRequestAllowed } from "../lib/aiRateLimit";
import { wasAiCallBilled } from "../lib/aiSpendGuard";
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

export async function runTopicPreviewWithUsage(
  ctx: Parameters<typeof runPreviewQuestionGeneration>[0],
  args: TopicPreviewArgs,
  generatePreview: typeof runPreviewQuestionGeneration = runPreviewQuestionGeneration,
): Promise<{ questions: string[]; runId: Id<"generationRuns"> }> {
  const userId = await ctx.runQuery(
    internal.core.teamPrompts.authorizeTopicPreview,
    {
      organizationId: args.organizationId,
      styleId: args.styleId,
      toneId: args.toneId,
    },
  );
  const name = requireTeamTopicText(args.name, "name");
  const guidance = requireTeamTopicText(args.guidance, "guidance");
  const boundaries = optionalTeamTopicText(args.boundaries, "boundaries");
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
    if (distinctQuestions.length === 0) {
      throw new Error("No persistable topic preview questions were generated.");
    }
    if (distinctQuestions.length < PREVIEW_COUNT) {
      throw new Error(
        "Exactly three distinct topic preview questions are required. Please retry.",
      );
    }
    const questions = distinctQuestions.slice(0, PREVIEW_COUNT);

    return { questions, runId: preview.runId };
  } catch (error) {
    // A preview the provider already charged for keeps its usage.
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
    await ensureAiRequestAllowed(ctx);
    return await runTopicPreviewWithUsage(ctx, args);
  },
});
