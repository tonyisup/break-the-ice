import { ConvexError } from "convex/values";

// Each function boundary can encode the data once more, so a query refusal read in an
// action's caller may be a JSON string of a JSON string.
const MAX_JSON_STRING_LAYERS = 3;

/**
 * The data object of a ConvexError, or undefined. After crossing ctx.runQuery or
 * ctx.runAction the data can arrive as a JSON string instead of an object, one layer
 * per boundary, so those are unwrapped. Shared by the server and the client, which
 * read the same error codes.
 */
export function convexErrorData(error: unknown): { code?: unknown; message?: unknown; [key: string]: unknown } | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  let data: unknown = error.data;
  for (let layer = 0; typeof data === "string" && layer < MAX_JSON_STRING_LAYERS; layer++) {
    try {
      data = JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
}
