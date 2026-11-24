import { v, type Infer } from "convex/values";

/**
 * How far one feed generation has got, in the order it happens. "thinking" and "writing" come
 * from the model's stream, so a stage only shows once that work has really started.
 */
export const generationProgressStage = v.union(
  v.literal("preparing"),
  v.literal("connecting"),
  v.literal("thinking"),
  v.literal("writing"),
  v.literal("saving"),
  v.literal("done"),
  v.literal("failed"),
);

export type GenerationProgressStage = Infer<typeof generationProgressStage>;

/** The stages the generation runner reports while it works. */
export type GenerationRunnerStage = Extract<GenerationProgressStage, "connecting" | "thinking" | "writing" | "saving">;

const PROGRESS_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the page's key for a request has the form it generates (a UUID). */
export function isProgressKey(key: string): boolean {
  return PROGRESS_KEY.test(key);
}
