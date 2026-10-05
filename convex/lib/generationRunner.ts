"use node";

import OpenAI, { APIError } from "openai";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  buildRemixPrompts,
  parseQuestionObjects,
} from "./promptArchitecture";
import { callReserveUsd, MAX_PROMPT_CHARS, type SpendClass } from "./aiSpend";
import { ConvexError } from "convex/values";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import {
  billedFailure,
  ensureAiBudget,
  releaseAiReservation,
  reserveAiSpend,
  settleAiCompletion,
} from "./aiSpendGuard";

// Named here, not through an OpenRouter preset, so a model change shows in a diff and in every
// run's record. Opus 5.5 was kept most often in the Oct 2026 blind labels (evals/README.md).
export const GENERATION_MODEL = "anthropic/claude-opus-5.5";
// OpenRouter's listed price for GENERATION_MODEL, in US dollars per million tokens (Oct 2026).
// It only sizes what is set aside before a call: spend is settled to the cost the provider
// reports, which is higher if the call was routed to a dearer endpoint.
const GENERATION_PRICE_USD_PER_MTOK = { input: 4, output: 20 };
const utf8 = new TextEncoder();
/**
 * An OpenRouter preset or model name, like "anthropic/claude-sonnet-5.5", with an optional variant
 * like ":nitro".
 */
const OPENROUTER_MODEL = /^(@preset\/[a-z0-9-]+|[a-z0-9-]+\/[a-z0-9.-]+(:[a-z0-9-]+)?)$/;
/** Temperature for saved questions (feed, daily email) unless a caller sets one. */
export const DEFAULT_GENERATION_TEMPERATURE = 0.9;
export const GENERATION_PROVIDER = "openrouter";

const DEFAULT_OPENROUTER_MAX_ATTEMPTS = 3;

const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY?.trim();

if (!OPEN_ROUTER_API_KEY) {
  throw new Error("OPEN_ROUTER_API_KEY is required for OpenAI/OpenRouter client");
}

export const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPEN_ROUTER_API_KEY,
  // gstack-shortcut(dec-da9ce3c3-49b9-4c2e-b9c6-2948f4f723a6): timeout sizing deferred, upgrade when large batches time out.
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

/** Refuses a prompt over the size ceiling. Callers check before creating their run row. */
function assertPromptSize(chars: number): void {
  if (chars > MAX_PROMPT_CHARS) {
    throw new ConvexError({ code: ERROR_CODES.AI_PROMPT_TOO_LARGE, message: ERROR_MESSAGES.AI_PROMPT_TOO_LARGE });
  }
}

// A thinking model's hidden reasoning counts toward max_tokens. google/gemini-3.8-flash spent
// about 500 to 1,600 tokens before writing any JSON, so a cap sized for the JSON alone cut off
// most answers. Opus 5.5 doesn't reason unless asked to, but the allowance stays so a switch to
// a model that does can't cut answers off again.
const REASONING_ALLOWANCE_TOKENS = 2000;
// A remix answers with one plain-text question.
const REMIX_ANSWER_TOKENS = 150;

// Output is capped too, since the budget is charged after a call returns. On top of the
// reasoning, a question and its short rationale took about 85 tokens on Sonnet 5.5 and about
// 170 on Opus 5.5 (up to 210) in the Oct 2026 eval runs. Each gets 200, and the base and the
// reasoning allowance cover a long one.
const JSON_BASE_TOKENS = 300;
const TOKENS_PER_QUESTION = 200;

export function maxOutputTokens(batchSize: number): number {
  return REASONING_ALLOWANCE_TOKENS + JSON_BASE_TOKENS + TOKENS_PER_QUESTION * batchSize;
}

// Callers check the budget with ensureAiBudget before creating their run. Here each
// provider attempt reserves an upper estimate of its cost at the listed price atomically (so a
// retry after backoff is checked against the budget again, and calls in flight count toward
// the cap at that estimate), then settles it to the real cost on success or releases it on
// failure.
async function createChatCompletionWithRetry(
  ctx: ActionCtx,
  spend: { spendClass: SpendClass; runId: Id<"generationRuns"> },
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let promptChars = 0;
  let promptBytes = 0;
  for (const message of params.messages) {
    if (typeof message.content !== "string") continue;
    promptChars += message.content.length;
    promptBytes += utf8.encode(message.content).length;
  }
  assertPromptSize(promptChars);
  // Priced at the default model's rates, also for a model the eval harness names.
  const reserveUsd = callReserveUsd(promptBytes, params.max_tokens, GENERATION_PRICE_USD_PER_MTOK);

  const maxAttempts = getOpenRouterMaxAttempts();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const reservation = await reserveAiSpend(ctx, spend.spendClass, reserveUsd);
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openRouterClient.chat.completions.create(params);
    } catch (error) {
      await releaseAiReservation(ctx, reservation);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxAttempts || !shouldRetryOpenRouterError(error)) {
        throw lastError;
      }

      await sleep(getOpenRouterRetryDelayMs(error, attempt));
      continue;
    }
    await settleAiCompletion(ctx, reservation, spend.runId, completion);
    return completion;
  }

  throw lastError ?? new Error("OpenRouter chat completion failed");
}

/** Whether the answer was cut off by our own output cap (max_tokens). */
function wasCutOff(completion: OpenAI.Chat.Completions.ChatCompletion): boolean {
  return completion.choices?.[0]?.finish_reason === "length";
}

// gstack-shortcut(dec-3aab4fc9-4154-427c-880c-4f302716a8ee): refund rule unchanged here, upgrade when it is revisited for all generation paths.
/**
 * Whether the user should keep the usage for a call that then failed. A response cut off
 * by our own output cap is our fault, so it doesn't count; the ledger still records it.
 */
function wasPaidInFull(completion: OpenAI.Chat.Completions.ChatCompletion): boolean {
  return !wasCutOff(completion);
}

/** Records a run's failure without letting a failed write replace the original error. */
async function markRunFailed(ctx: ActionCtx, runId: Id<"generationRuns">, error: unknown, fallbackMessage: string): Promise<void> {
  try {
    await ctx.runMutation(internal.internal.generation.failGenerationRun, {
      runId,
      error: error instanceof Error ? error.message : fallbackMessage,
      rawResponse: error instanceof UnusableOutputError ? error.rawResponse : undefined,
    });
  } catch (writeError) {
    console.error("Failed to mark generation run as failed", writeError);
  }
}

/**
 * The model answered, but with nothing we can use: empty, not JSON, no questions in it, or
 * cut off by our output cap partway through.
 */
class UnusableOutputError extends Error {
  constructor(
    message: string,
    readonly rawResponse?: string,
    /** Cut off by our output cap: the same request would be cut off again, so it isn't retried. */
    readonly cutOff = false,
  ) {
    super(message);
  }
}

// An empty or unreadable answer is usually a one-off, so it gets one more try.
export const UNUSABLE_OUTPUT_ATTEMPTS = 2;

// gstack-shortcut(dec-ede332ff-223c-47b1-9d49-270141aa91e0): cut-off handling kept as is, upgrade in the generation follow-ups (retry, error message, run labelling).
/**
 * Runs `attempt` once more when the model's answer couldn't be used, unless our output cap
 * cut it off. Each attempt creates and closes its own run, so every run's cost is still
 * settled exactly once. Provider errors aren't retried here: createChatCompletionWithRetry
 * already retries timeouts, 429s and 5xx, and a 400 won't get better on a second try. The
 * final error is marked billed when any attempt was paid for in full.
 */
async function retryUnusableOutput<T>(attempt: (markBilled: () => void) => Promise<T>): Promise<T> {
  let billed = false;
  const markBilled = () => {
    billed = true;
  };
  for (let n = 1; ; n += 1) {
    try {
      return await attempt(markBilled);
    } catch (error) {
      if (error instanceof UnusableOutputError && !error.cutOff && n < UNUSABLE_OUTPUT_ATTEMPTS) {
        console.warn(`Retrying generation after unusable output: ${error.message}`);
        continue;
      }
      throw billed ? billedFailure(error) : error;
    }
  }
}

function getChatCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    const finishReason = completion.choices?.[0]?.finish_reason ?? "unknown";
    throw new UnusableOutputError(
      `AI provider returned an empty completion (model=${completion.model}, finish_reason=${finishReason})`,
      undefined,
      wasCutOff(completion),
    );
  }
  return content;
}

/** The model's questions, up to the batch size. An answer with none is unusable. */
function parseCandidates(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  rawResponse: string,
  batchSize: number,
): Array<{ text: string; rationale?: string }> {
  let parsed: Array<{ text: string; rationale?: string }>;
  try {
    parsed = parseQuestionObjects(rawResponse);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnusableOutputError(`Model output could not be read: ${reason}`, rawResponse, wasCutOff(completion));
  }
  if (parsed.length === 0) {
    throw new UnusableOutputError("Model output had no questions", rawResponse, wasCutOff(completion));
  }
  return parsed.slice(0, batchSize);
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
    /** "pending" holds new questions for review (unlisted); the default is public. */
    status?: "public" | "pending";
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
  // Only the daily email and the admin-triggered pool are system spend. Everything
  // else (feed generation, matrix fill, any purpose added later) is user spend.
  const spendClass: SpendClass =
    args.purpose === "newsletter" || args.purpose === "nightly_pool" ? "system" : "user";
  await ensureAiBudget(ctx, spendClass);

  const temperature = args.temperature ?? DEFAULT_GENERATION_TEMPERATURE;
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

  assertPromptSize(prompt.systemPrompt.length + prompt.userPrompt.length);

  return await retryUnusableOutput(async (markBilled) => {
    const runId = await createRun(ctx, {
      purpose: args.purpose,
      requestedByUserId: args.requestedByUserId,
      prompt,
      model: GENERATION_MODEL,
      temperature,
    });

    try {
      const completion = await createChatCompletionWithRetry(ctx, { spendClass, runId }, {
        model: GENERATION_MODEL,
        temperature,
        max_tokens: maxOutputTokens(prompt.batchSize),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
      });

      if (wasPaidInFull(completion)) markBilled();

      const rawResponse = getChatCompletionContent(completion);
      const parsedQuestions = parseCandidates(completion, rawResponse, prompt.batchSize);

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
        status: args.status ?? "public",
        poolDate: args.poolDate,
        poolStatus: args.poolStatus,
      });

      const counts = {
        parsedCount: parsedQuestions.length,
        insertedCount: saveResult.insertedCount,
        duplicateCount: saveResult.duplicateCount,
        rejectedCount: saveResult.rejectedCount,
      };
      if (saveResult.insertedCount === 0) {
        // Every question was a duplicate or failed validation. That isn't worth a retry, and
        // the caller just gets no questions, but the run shouldn't read as a success.
        await ctx.runMutation(internal.internal.generation.failGenerationRun, {
          runId,
          rawResponse,
          error: `No new questions saved: ${counts.duplicateCount} duplicate, ${counts.rejectedCount} rejected`,
          ...counts,
        });
      } else {
        await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
          runId,
          rawResponse,
          resultQuestionIds: saveResult.insertedQuestionIds,
          ...counts,
        });
      }

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
      await markRunFailed(ctx, runId, error, "Unknown generation error");
      throw error;
    }
  });
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
    /** "system" for admin tools; team previews are user spend. */
    spendClass?: SpendClass;
    /** An OpenRouter model to use instead of GENERATION_MODEL. Only the eval harness sets it. */
    model?: string;
  },
): Promise<{
  runId: Id<"generationRuns">;
  prompt: GenerationPrompt;
  rawResponse: string;
  previewText: string;
  previewTexts: string[];
}> {
  // Checked here, where the name reaches the provider, so no caller can pass one through
  // unchecked, and before anything is read or charged.
  if (args.model !== undefined && !OPENROUTER_MODEL.test(args.model)) {
    throw new ConvexError({
      code: "AI_MODEL_NAME",
      message: `"${args.model}" isn't an OpenRouter model name like "anthropic/claude-sonnet-5.5".`,
    });
  }
  const spendClass = args.spendClass ?? "user";
  await ensureAiBudget(ctx, spendClass);

  const model = args.model ?? GENERATION_MODEL;
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

  assertPromptSize(prompt.systemPrompt.length + prompt.userPrompt.length);

  return await retryUnusableOutput(async (markBilled) => {
    const runId = await createRun(ctx, {
      purpose: "admin_preview",
      requestedByUserId: args.requestedByUserId,
      prompt,
      model,
      temperature,
    });

    try {
      const completion = await createChatCompletionWithRetry(ctx, { spendClass, runId }, {
        model,
        temperature,
        max_tokens: maxOutputTokens(prompt.batchSize),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
      });

      if (wasPaidInFull(completion)) markBilled();

      const rawResponse = getChatCompletionContent(completion);
      // parseCandidates only returns questions with text, and at least one.
      const previewTexts = parseCandidates(completion, rawResponse, prompt.batchSize).map((candidate) =>
        candidate.text.trim(),
      );
      const previewText = previewTexts[0];

      await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
        runId,
        rawResponse,
        previewText,
        resultQuestionIds: [],
        parsedCount: previewTexts.length,
      });

      return {
        runId,
        prompt,
        rawResponse,
        previewText,
        previewTexts,
      };
    } catch (error) {
      await markRunFailed(ctx, runId, error, "Unknown generation error");
      throw error;
    }
  });
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
    /** "system" for the admin remix; a user's remix is user spend. */
    spendClass?: SpendClass;
  },
): Promise<{ runId: Id<"generationRuns">; text: string }> {
  const spendClass = args.spendClass ?? "user";
  await ensureAiBudget(ctx, spendClass);

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

  assertPromptSize(prompts.systemPrompt.length + prompts.userPrompt.length);

  return await retryUnusableOutput(async (markBilled) => {
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
      const completion = await createChatCompletionWithRetry(ctx, { spendClass, runId }, {
        model: GENERATION_MODEL,
        temperature: args.temperature ?? 0.9,
        messages: [
          { role: "system", content: prompts.systemPrompt },
          { role: "user", content: prompts.userPrompt },
        ],
        max_tokens: REASONING_ALLOWANCE_TOKENS + REMIX_ANSWER_TOKENS,
      });

      if (wasPaidInFull(completion)) markBilled();

      const rawResponse = getChatCompletionContent(completion);
      if (wasCutOff(completion)) {
        // Cut off by the cap, the text is half a question: fail rather than show it.
        throw new UnusableOutputError("The remix was cut off before it finished", rawResponse, true);
      }
      const remixedText = rawResponse.replace(/^["']|["']$/g, "").trim();
      if (!remixedText) {
        throw new UnusableOutputError("AI failed to generate a remix", rawResponse);
      }

      await ctx.runMutation(internal.internal.generation.completeGenerationRun, {
        runId,
        rawResponse,
        previewText: remixedText,
        resultQuestionIds: [],
      });

      return { runId, text: remixedText };
    } catch (error) {
      await markRunFailed(ctx, runId, error, "Unknown remix error");
      throw error;
    }
  });
}
