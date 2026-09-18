import { toast } from "sonner";

export function reportAsyncError(error: unknown): void {
  console.error("Action failed", error);
  toast.error("Couldn't complete this action. Try again.");
}

/** Adapt async actions to void UI callbacks, preserving synchronous event handling. */
export function handleAsync<Args extends unknown[]>(action: (...args: Args) => void | Promise<unknown>): (...args: Args) => void {
  return (...args) => {
    try {
      void Promise.resolve(action(...args)).catch(reportAsyncError);
    } catch (error) {
      reportAsyncError(error);
    }
  };
}
