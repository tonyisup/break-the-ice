import { describe, expect, test } from "vitest";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../constants";
import { convexErrorData } from "./errorData";
import { requireQuestionText } from "./questionText";

function validationError(value: string) {
  try {
    requireQuestionText(value);
  } catch (error) {
    return convexErrorData(error);
  }
  throw new Error("Expected the question text to be rejected.");
}

describe("question text input validation", () => {
  test("accepts text at exactly the limit and checks the length after trimming", () => {
    const longest = "a".repeat(MAX_QUESTION_TEXT_LENGTH);

    expect(requireQuestionText(longest)).toBe(longest);
    expect(requireQuestionText(`\n\t ${longest}  `)).toBe(longest);
  });

  test("rejects text one character over the limit", () => {
    expect(validationError("a".repeat(MAX_QUESTION_TEXT_LENGTH + 1))).toEqual({
      code: ERROR_CODES.QUESTION_TEXT_TOO_LONG,
      message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG,
    });
  });

  test("rejects empty or whitespace-only text", () => {
    for (const value of ["", "   ", "\n\t  \n"]) {
      expect(validationError(value)).toEqual({
        code: ERROR_CODES.QUESTION_TEXT_REQUIRED,
        message: ERROR_MESSAGES.QUESTION_TEXT_REQUIRED,
      });
    }
  });
});
