import { ConvexError } from "convex/values";

/**
 * The data object of a ConvexError, or undefined. After crossing ctx.runAction the
 * data can arrive as a JSON string instead of an object, so both are accepted. Shared
 * by the server and the client, which read the same error codes.
 */
export function convexErrorData(error: unknown): { code?: unknown; message?: unknown; [key: string]: unknown } | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}
