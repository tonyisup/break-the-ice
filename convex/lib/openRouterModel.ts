import { ConvexError } from "convex/values";

/**
 * An OpenRouter preset or model name, like "anthropic/claude-sonnet-5.5", with an optional variant
 * like ":nitro".
 */
const OPENROUTER_MODEL = /^(@preset\/[a-z0-9-]+|[a-z0-9-]+\/[a-z0-9.-]+(:[a-z0-9-]+)?)$/;

export function isOpenRouterModel(model: string): boolean {
  return OPENROUTER_MODEL.test(model);
}

/** Refuses a model name that isn't an OpenRouter one, before it can reach the provider. */
export function assertOpenRouterModel(model: string): void {
  if (!isOpenRouterModel(model)) {
    throw new ConvexError({
      code: "AI_MODEL_NAME",
      message: `"${model}" isn't an OpenRouter model name like "anthropic/claude-sonnet-5.5".`,
    });
  }
}
