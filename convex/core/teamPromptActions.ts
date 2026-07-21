"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";
import { normalizePersistableTeamPromptText } from "../lib/teamPromptContract";

const MAX_TOPIC_NAME_LENGTH = 100;
const MAX_TOPIC_GUIDANCE_LENGTH = 1000;
const MAX_TOPIC_BOUNDARIES_LENGTH = 1000;
const PREVIEW_COUNT = 3;

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

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
  const name = requiredText(args.name, "Topic name", MAX_TOPIC_NAME_LENGTH);
  const guidance = requiredText(
    args.guidance,
    "Topic guidance",
    MAX_TOPIC_GUIDANCE_LENGTH,
  );
  const boundaries = optionalText(
    args.boundaries,
    "Topic boundaries",
    MAX_TOPIC_BOUNDARIES_LENGTH,
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
    await ctx.runMutation(internal.internal.users.decrementAIUsage, {
      userId,
      organizationId: args.organizationId,
    });
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
    return await runTopicPreviewWithUsage(ctx, args);
  },
});
