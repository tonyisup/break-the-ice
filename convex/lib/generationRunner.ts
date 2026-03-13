"use node";

import OpenAI from "openai";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  buildRemixPrompts,
  parseQuestionObjects,
} from "./promptArchitecture";

export const GENERATION_MODEL = "@preset/break-the-ice-berg-default";
export const GENERATION_PROVIDER = "openrouter";

export const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  timeout: 30000,
  defaultHeaders: {
    "HTTP-Referer": "https://breaktheiceberg.com",
    "X-Title": "Break the ice(berg)",
  },
});

type GenerationPurpose = "feed" | "admin_preview" | "admin_accept" | "nightly_pool" | "newsletter" | "remix";

async function createRun(
  ctx: ActionCtx,
  args: {
    purpose: GenerationPurpose;
    requestedByUserId?: string;
    prompt: Awaited<ReturnType<ActionCtx["runQuery"]>>;
    model: string;
    temperature: number;
    sourceQuestionId?: Id<"questions">;
  },
): Promise<Id<"generationRuns">> {
  const prompt = args.prompt as any;
  return await ctx.runMutation(internal.internal.generation.createGenerationRun, {
    purpose: args.purpose,
    requestedByUserId: args.requestedByUserId,
    blueprintId: prompt.blueprint._id,
    styleId: prompt.style._id,
    toneId: prompt.tone._id,
    topicId: prompt.topic?._id,
    styleSlug: prompt.style.slug,
    toneSlug: prompt.tone.slug,
    topicSlug: prompt.topic?.slug,
    styleVersion: prompt.style.version,
    toneVersion: prompt.tone.version,
    topicVersion: prompt.topic?.version,
    batchSize: prompt.batchSize,
    model: args.model,
    provider: GENERATION_PROVIDER,
    temperature: args.temperature,
    assembledPrompt: [prompt.systemPrompt, prompt.userPrompt].join("\n\n"),
    sourceQuestionId: args.sourceQuestionId,
  });
}

export async function runPersistedQuestionGeneration(
  ctx: ActionCtx,
  args: {
    purpose: Exclude<GenerationPurpose, "admin_preview" | "remix">;
    requestedByUserId?: string;
    styleId?: Id<"styles">;
    styleSlug?: string;
    toneId?: Id<"tones">;
    toneSlug?: string;
    topicId?: Id<"topics">;
    topicSlug?: string;
    batchSize?: number;
    blueprintSlug?: string;
    excludedQuestions?: string[];
    currentQuestion?: string;
    userContext?: string;
    temperature?: number;
    poolDate?: string;
    poolStatus?: "available" | "distributed";
  },
): Promise<{
  runId: Id<"generationRuns">;
  prompt: any;
  rawResponse: string;
  saveResult: {
    insertedQuestionIds: Id<"questions">[];
    insertedCount: number;
    duplicates: Array<{ text: string; reason: string }>;
    duplicateCount: number;
    rejected: Array<{ text: string; reasons: string[] }>;
    rejectedCount: number;
  };
  questions: any[];
}> {
  const temperature = args.temperature ?? 0.9;
  const prompt = await ctx.runQuery(internal.internal.generation.buildGenerationPrompt, {
    styleId: args.styleId,
    styleSlug: args.styleSlug,
    toneId: args.toneId,
    toneSlug: args.toneSlug,
    topicId: args.topicId,
    topicSlug: args.topicSlug,
    batchSize: args.batchSize,
    blueprintSlug: args.blueprintSlug,
    excludedQuestions: args.excludedQuestions,
    currentQuestion: args.currentQuestion,
    userContext: args.userContext,
  });

  const runId = await createRun(ctx, {
    purpose: args.purpose,
    requestedByUserId: args.requestedByUserId,
    prompt,
    model: GENERATION_MODEL,
    temperature,
  });

  try {
    const completion = await openRouterClient.chat.completions.create({
      model: GENERATION_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    });

    const rawResponse = completion.choices[0]?.message?.content?.trim() ?? '{"questions":[]}';
    const parsedQuestions = parseQuestionObjects(rawResponse).slice(0, prompt.batchSize);

    const saveResult = await ctx.runMutation(internal.internal.generation.insertGeneratedQuestions, {
      runId,
      styleId: prompt.style._id,
      toneId: prompt.tone._id,
      topicId: prompt.topic?._id,
      styleSlug: prompt.style.slug,
      toneSlug: prompt.tone.slug,
      topicSlug: prompt.topic?.slug,
      styleVersion: prompt.style.version,
      toneVersion: prompt.tone.version,
      topicVersion: prompt.topic?.version,
      candidates: parsedQuestions,
      status: args.purpose === "nightly_pool" ? "public" : "public",
      poolDate: args.poolDate,
      poolStatus: args.poolStatus,
    });

    await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
      runId,
      rawResponse,
      resultQuestionIds: saveResult.insertedQuestionIds,
    });

    const questions = saveResult.insertedQuestionIds.length
      ? await ctx.runQuery(api.core.questions.getQuestionsByIds, { ids: saveResult.insertedQuestionIds })
      : [];

    return {
      runId,
      prompt,
      rawResponse,
      saveResult,
      questions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    await ctx.runMutation(internal.internal.generation.failGenerationRun, {
      runId,
      error: message,
    });
    throw error;
  }
}

export async function runPreviewQuestionGeneration(
  ctx: ActionCtx,
  args: {
    requestedByUserId?: string;
    styleId?: Id<"styles">;
    styleSlug?: string;
    toneId?: Id<"tones">;
    toneSlug?: string;
    topicId?: Id<"topics">;
    topicSlug?: string;
    blueprintSlug?: string;
    excludedQuestions?: string[];
    currentQuestion?: string;
    userContext?: string;
    temperature?: number;
  },
): Promise<{
  runId: Id<"generationRuns">;
  prompt: any;
  rawResponse: string;
  previewText: string;
}> {
  const temperature = args.temperature ?? 0.85;
  const prompt = await ctx.runQuery(internal.internal.generation.buildGenerationPrompt, {
    styleId: args.styleId,
    styleSlug: args.styleSlug,
    toneId: args.toneId,
    toneSlug: args.toneSlug,
    topicId: args.topicId,
    topicSlug: args.topicSlug,
    batchSize: 1,
    blueprintSlug: args.blueprintSlug,
    excludedQuestions: args.excludedQuestions,
    currentQuestion: args.currentQuestion,
    userContext: args.userContext,
  });

  const runId = await createRun(ctx, {
    purpose: "admin_preview",
    requestedByUserId: args.requestedByUserId,
    prompt,
    model: GENERATION_MODEL,
    temperature,
  });

  try {
    const completion = await openRouterClient.chat.completions.create({
      model: GENERATION_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    });

    const rawResponse = completion.choices[0]?.message?.content?.trim() ?? '{"questions":[]}';
    const preview = parseQuestionObjects(rawResponse)[0];
    const previewText = preview?.text ?? "";

    await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
      runId,
      rawResponse,
      previewText,
      resultQuestionIds: [],
    });

    return {
      runId,
      prompt,
      rawResponse,
      previewText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    await ctx.runMutation(internal.internal.generation.failGenerationRun, {
      runId,
      error: message,
    });
    throw error;
  }
}

export async function runRemixQuestion(
  ctx: ActionCtx,
  args: {
    requestedByUserId?: string;
    questionText: string;
    style?: any | null;
    tone?: any | null;
    topic?: any | null;
    sourceQuestionId?: Id<"questions">;
    temperature?: number;
  },
): Promise<{ runId: Id<"generationRuns">; text: string }> {
  const blueprint = await ctx.runQuery(internal.internal.generation.getDefaultPromptBlueprint, {});
  if (!blueprint) {
    throw new Error("Default prompt blueprint not found");
  }

  const prompts = buildRemixPrompts({
    questionText: args.questionText,
    style: args.style,
    tone: args.tone,
    topic: args.topic,
  });

  const runId = await ctx.runMutation(internal.internal.generation.createGenerationRun, {
    purpose: "remix",
    requestedByUserId: args.requestedByUserId,
    blueprintId: blueprint._id,
    styleId: args.style?._id,
    toneId: args.tone?._id,
    topicId: args.topic?._id,
    styleSlug: args.style?.slug ?? args.style?.id,
    toneSlug: args.tone?.slug ?? args.tone?.id,
    topicSlug: args.topic?.slug ?? args.topic?.id,
    styleVersion: args.style?.version ?? 1,
    toneVersion: args.tone?.version ?? 1,
    topicVersion: args.topic?.version ?? 1,
    batchSize: 1,
    model: GENERATION_MODEL,
    provider: GENERATION_PROVIDER,
    temperature: args.temperature ?? 0.9,
    assembledPrompt: [prompts.systemPrompt, prompts.userPrompt].join("\n\n"),
    sourceQuestionId: args.sourceQuestionId,
  });

  try {
    const completion = await openRouterClient.chat.completions.create({
      model: GENERATION_MODEL,
      temperature: args.temperature ?? 0.9,
      messages: [
        { role: "system", content: prompts.systemPrompt },
        { role: "user", content: prompts.userPrompt },
      ],
      max_tokens: 150,
    });

    const remixedText = completion.choices[0]?.message?.content?.trim()?.replace(/^["']|["']$/g, "").trim() ?? "";
    if (!remixedText) {
      throw new Error("AI failed to generate a remix");
    }

    await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
      runId,
      rawResponse: completion.choices[0]?.message?.content ?? "",
      previewText: remixedText,
      resultQuestionIds: [],
    });

    return { runId, text: remixedText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown remix error";
    await ctx.runMutation(internal.internal.generation.failGenerationRun, {
      runId,
      error: message,
    });
    throw error;
  }
}
