import { describe, expect, it } from "vitest";
import { shouldDeleteAuthoredQuestionOnUserDeletion } from "./functions";

describe("user deletion question cleanup", () => {
  it("keeps organization-owned Team prompts", () => {
    expect(
      shouldDeleteAuthoredQuestionOnUserDeletion({
        kind: "team_prompt",
        status: "private",
      }),
    ).toBe(false);
  });

  it("deletes authored personal private questions", () => {
    expect(
      shouldDeleteAuthoredQuestionOnUserDeletion({
        kind: "personal",
        status: "private",
      }),
    ).toBe(true);
  });
});
