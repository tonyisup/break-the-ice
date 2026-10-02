import { ConvexError } from "convex/values";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../constants";

/**
 * The trimmed text of a question someone wrote, checked before it is saved. Blank or
 * over-long text throws a ConvexError, whose message reaches the client in production.
 */
export function requireQuestionText(value: string): string {
  const text = value.trim();
  if (!text) {
    throw new ConvexError({
      code: ERROR_CODES.QUESTION_TEXT_REQUIRED,
      message: ERROR_MESSAGES.QUESTION_TEXT_REQUIRED,
    });
  }
  if (text.length > MAX_QUESTION_TEXT_LENGTH) {
    throw new ConvexError({
      code: ERROR_CODES.QUESTION_TEXT_TOO_LONG,
      message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG,
    });
  }
  return text;
}
