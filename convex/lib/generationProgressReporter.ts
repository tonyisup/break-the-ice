import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { GenerationProgressStage } from "./generationProgress";

/**
 * Writes a generation's stages in order without holding up the model's stream. Progress is only
 * for display, so a failed write is logged and never fails the generation. Call `flush` before
 * the action ends, so no write is left running.
 */
export function createProgressReporter(ctx: Pick<ActionCtx, "runMutation">, progressId: Id<"generationProgress">) {
  let last: GenerationProgressStage | null = null;
  let writes: Promise<void> = Promise.resolve();
  return {
    stage(stage: GenerationProgressStage): void {
      if (stage === last) return;
      last = stage;
      writes = writes
        .then(async () => {
          await ctx.runMutation(internal.internal.generationProgress.setStage, { progressId, stage });
        })
        .catch((error) => {
          console.warn("Could not record generation progress", error);
        });
    },
    flush: (): Promise<void> => writes,
  };
}
