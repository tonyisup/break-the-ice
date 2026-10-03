import { describe, expect, test } from "vitest";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_QUESTION_TAG_LENGTH,
  MAX_QUESTION_TAGS,
} from "../constants";
import { convexErrorData } from "./errorData";
import { normalizeQuestionTags } from "./questionTags";

function validationError(tags: string[]) {
  try {
    normalizeQuestionTags(tags);
  } catch (error) {
    return convexErrorData(error);
  }
  throw new Error("Expected the tags to be rejected.");
}

const manyTags = (count: number) => Array.from({ length: count }, (_, i) => `tag-${i}`);

describe("question tags input validation", () => {
  test("trims and lowercases tags, and drops blanks and repeats", () => {
    expect(normalizeQuestionTags(["  Food ", "food", "", "   ", "TRAVEL", "travel\n"])).toEqual([
      "food",
      "travel",
    ]);
  });

  test("keeps undefined as undefined and an empty list as empty", () => {
    expect(normalizeQuestionTags(undefined)).toBeUndefined();
    expect(normalizeQuestionTags([])).toEqual([]);
  });

  test("accepts tags at exactly the count and length limits", () => {
    const longest = "a".repeat(MAX_QUESTION_TAG_LENGTH);

    expect(normalizeQuestionTags(manyTags(MAX_QUESTION_TAGS))).toHaveLength(MAX_QUESTION_TAGS);
    expect(normalizeQuestionTags([` ${longest.toUpperCase()} `])).toEqual([longest]);
  });

  test("counts tags after repeats and blanks are dropped", () => {
    const tags = [...manyTags(MAX_QUESTION_TAGS), "TAG-0", " tag-1 ", "", "  "];

    expect(normalizeQuestionTags(tags)).toEqual(manyTags(MAX_QUESTION_TAGS));
  });

  test("rejects one tag over the count limit", () => {
    expect(validationError(manyTags(MAX_QUESTION_TAGS + 1))).toEqual({
      code: ERROR_CODES.QUESTION_TAGS_TOO_MANY,
      message: ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY,
    });
  });

  test("rejects a tag one character over the length limit", () => {
    expect(validationError(["food", "a".repeat(MAX_QUESTION_TAG_LENGTH + 1)])).toEqual({
      code: ERROR_CODES.QUESTION_TAG_TOO_LONG,
      message: ERROR_MESSAGES.QUESTION_TAG_TOO_LONG,
    });
  });
});
