import { describe, expect, test } from "vitest";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_TEAM_TOPIC_BOUNDARIES_LENGTH,
  MAX_TEAM_TOPIC_GUIDANCE_LENGTH,
  MAX_TEAM_TOPIC_NAME_LENGTH,
} from "../constants";
import { convexErrorData } from "./errorData";
import { optionalTeamTopicText, requireTeamTopicText } from "./teamPromptContract";

function validationError(validate: () => unknown) {
  try {
    validate();
  } catch (error) {
    return convexErrorData(error);
  }
  throw new Error("Expected the topic text to be rejected.");
}

describe("required Team topic fields", () => {
  test.each([
    ["name", MAX_TEAM_TOPIC_NAME_LENGTH],
    ["guidance", MAX_TEAM_TOPIC_GUIDANCE_LENGTH],
  ] as const)("accept a %s at exactly the limit and check the length after trimming", (field, maxLength) => {
    const longest = "a".repeat(maxLength);

    expect(requireTeamTopicText(longest, field)).toBe(longest);
    expect(requireTeamTopicText(`\n\t ${longest}  `, field)).toBe(longest);
  });

  test.each([
    ["name", MAX_TEAM_TOPIC_NAME_LENGTH, ERROR_MESSAGES.TEAM_TOPIC_NAME_TOO_LONG],
    ["guidance", MAX_TEAM_TOPIC_GUIDANCE_LENGTH, ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_TOO_LONG],
  ] as const)("reject a %s one character over the limit, naming the field", (field, maxLength, message) => {
    expect(validationError(() => requireTeamTopicText("a".repeat(maxLength + 1), field))).toEqual({
      code: ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      message,
    });
  });

  test.each([
    ["name", ERROR_MESSAGES.TEAM_TOPIC_NAME_REQUIRED],
    ["guidance", ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_REQUIRED],
  ] as const)("reject an empty or whitespace-only %s, naming the field", (field, message) => {
    for (const value of ["", "   ", "\n\t  \n"]) {
      expect(validationError(() => requireTeamTopicText(value, field))).toEqual({
        code: ERROR_CODES.TEAM_TOPIC_REQUIRED,
        message,
      });
    }
  });
});

describe("optional Team topic boundaries", () => {
  test("treat missing or blank boundaries as absent", () => {
    for (const value of [undefined, "", "   ", "\n\t "]) {
      expect(optionalTeamTopicText(value, "boundaries")).toBeUndefined();
    }
  });

  test("accept boundaries at exactly the limit and check the length after trimming", () => {
    const longest = "a".repeat(MAX_TEAM_TOPIC_BOUNDARIES_LENGTH);

    expect(optionalTeamTopicText(longest, "boundaries")).toBe(longest);
    expect(optionalTeamTopicText(`  ${longest}\n`, "boundaries")).toBe(longest);
  });

  test("reject boundaries one character over the limit", () => {
    expect(
      validationError(() =>
        optionalTeamTopicText("a".repeat(MAX_TEAM_TOPIC_BOUNDARIES_LENGTH + 1), "boundaries"),
      ),
    ).toEqual({
      code: ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      message: ERROR_MESSAGES.TEAM_TOPIC_BOUNDARIES_TOO_LONG,
    });
  });
});
