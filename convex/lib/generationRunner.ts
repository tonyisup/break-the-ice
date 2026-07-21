"use node";

import OpenAI, { APIError } from "openai";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  buildRemixPrompts,
  parseQuestionObjects,
} from "./promptArchitecture";

export const GENERATION_MODEL = "@preset/break-the-ice-berg-default";
export const GENERATION_PROVIDER = "openrouter";

const DEFAULT_OPENROUTER_MAX_ATTEMPTS = 3;

const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY?.trim();

if (!OPEN_ROUTER_API_KEY) {
  throw new Error("OPEN_ROUTER_API_KEY is required for OpenAI/OpenRouter client");
}

export const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPEN_ROUTER_API_KEY,
  timeout: 30000,
  defaultHeaders: {
    "HTTP-Referer": "https://breaktheiceberg.com",
    "X-Title": "Break the ice(berg)",
  },
});

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maxValue = Number.MAX_SAFE_INTEGER,
): number {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxValue) : fallback;
}

function getOpenRouterMaxAttempts(): number {
  return parsePositiveInteger(
    process.env.OPENROUTER_MAX_ATTEMPTS,
    DEFAULT_OPENROUTER_MAX_ATTEMPTS,
    Number.MAX_SAFE_INTEGER,
  );
}

function shouldRetryOpenRouterError(error: unknown): boolean {
  if (error instanceof APIError) {
    const status = error.status;
    return status === 408 || status === 429 || (status !== undefined && status >= 500);
  }

  if (error instanceof Error) {
    return /\b(408|429|5\d{2})\b/.test(error.message);
  }

  return false;
}

function getOpenRouterRetryDelayMs(error: unknown, attempt: number): number {
  const baseDelayMs = 300 * attempt;

  if (!(error instanceof APIError)) {
    return baseDelayMs;
  }

  const headers = error.headers;
  const retryAfter =
    headers instanceof Headers
      ? headers.get("retry-after")
      : typeof headers === "object" && headers !== null && "retry-after" in headers
        ? String((headers as Record<string, string>)["retry-after"])
        : null;

  if (!retryAfter) {
    return baseDelayMs;
  }

  const retryAfterSeconds = Number.parseInt(retryAfter, 10);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return baseDelayMs;
  }

  return Math.max(baseDelayMs, retryAfterSeconds * 1000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createChatCompletionWithRetry(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const maxAttempts = getOpenRouterMaxAttempts();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await openRouterClient.chat.completions.create(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxAttempts || !shouldRetryOpenRouterError(error)) {
        throw lastError;
      }

      await sleep(getOpenRouterRetryDelayMs(error, attempt));
    }
  }

  throw lastError ?? new Error("OpenRouter chat completion failed");
}

function getChatCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    const finishReason = completion.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(
      `AI provider returned an empty completion (model=${completion.model}, finish_reason=${finishReason})`,
    );
  }
  return content;
}

type GenerationPurpose = "feed" | "admin_preview" | "admin_accept" | "nightly_pool" | "newsletter" | "remix";

type GenerationPrompt = {
  batchSize: number;
  systemPrompt: string;
  userPrompt: string;
  blueprint: {
    _id: Id<"promptBlueprints">;
    slug: string;
    version: number;
  };
  style: {
    _id: Id<"styles">;
    slug: string;
    version: number;
    name: string;
  };
  tone: {
    _id: Id<"tones">;
    slug: string;
    version: number;
    name: string;
  };
  topic: {
    _id: Id<"topics">;
    slug: string;
    version: number;
    name: string;
  } | null;
};

async function createRun(
  ctx: ActionCtx,
  args: {
    purpose: GenerationPurpose;
    requestedByUserId?: string;
    prompt: GenerationPrompt;
    model: string;
    temperature: number;
    sourceQuestionId?: Id<"questions">;
  },
): Promise<Id<"generationRuns">> {
  const { prompt } = args;
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
  prompt: GenerationPrompt;
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
    const completion = await createChatCompletionWithRetry({
      model: GENERATION_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    });

    const rawResponse = getChatCompletionContent(completion);
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
      status: "public",
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
    batchSize?: number;
  },
): Promise<{
  runId: Id<"generationRuns">;
  prompt: GenerationPrompt;
  rawResponse: string;
  previewText: string;
  previewTexts: string[];
}> {
  const temperature = args.temperature ?? 0.85;
  const prompt = await ctx.runQuery(internal.internal.generation.buildGenerationPrompt, {
    styleId: args.styleId,
    styleSlug: args.styleSlug,
    toneId: args.toneId,
    toneSlug: args.toneSlug,
    topicId: args.topicId,
    topicSlug: args.topicSlug,
    batchSize: args.batchSize ?? 1,
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
    const completion = await createChatCompletionWithRetry({
      model: GENERATION_MODEL,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
    });

    const rawResponse = getChatCompletionContent(completion);
    const parsed = parseQuestionObjects(rawResponse);
    const previewTexts = parsed
      .slice(0, prompt.batchSize)
      .map((candidate) => candidate.text.trim())
      .filter(Boolean);
    const previewText = previewTexts[0] ?? "";

    if (!previewText) {
      throw new Error("No preview questions parsed");
    }

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
      previewTexts,
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
    style?: Doc<"styles"> | null;
    tone?: Doc<"tones"> | null;
    topic?: Doc<"topics"> | null;
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
    const completion = await createChatCompletionWithRetry({
      model: GENERATION_MODEL,
      temperature: args.temperature ?? 0.9,
      messages: [
        { role: "system", content: prompts.systemPrompt },
        { role: "user", content: prompts.userPrompt },
      ],
      max_tokens: 150,
    });

    const rawResponse = getChatCompletionContent(completion);
    const remixedText = rawResponse.replace(/^["']|["']$/g, "").trim();
    if (!remixedText) {
      throw new Error("AI failed to generate a remix");
    }

    await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
      runId,
      rawResponse,
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
