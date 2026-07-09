import { describe, expect, it } from "vitest";
import { extractFirstJsonValue, parseQuestionObjects } from "./promptArchitecture";

describe("parseQuestionObjects", () => {
  it("parses clean JSON", () => {
    const result = parseQuestionObjects(
      '{"questions":[{"text":"What is your go-to comfort snack?","rationale":"light"}]}',
    );
    expect(result).toEqual([{ text: "What is your go-to comfort snack?", rationale: "light" }]);
  });

  it("parses JSON followed by trailing explanation text", () => {
    const result = parseQuestionObjects(`{"questions":[{"text":"What song gets you moving?"}]}
Here are five more ideas you could use...`);
    expect(result).toEqual([{ text: "What song gets you moving?", rationale: undefined }]);
  });

  it("parses JSON wrapped in code fences", () => {
    const result = parseQuestionObjects(
      '```json\n{"questions":[{"text":"What small habit changed your mornings?"}]}\n```',
    );
    expect(result).toEqual([{ text: "What small habit changed your mornings?", rationale: undefined }]);
  });

  it("parses JSON with a preamble", () => {
    const result = parseQuestionObjects(
      'Sure! Here is the JSON:\n{"questions":[{"text":"What is the best advice you ignored?"}]}',
    );
    expect(result).toEqual([{ text: "What is the best advice you ignored?", rationale: undefined }]);
  });
});

describe("extractFirstJsonValue", () => {
  it("returns the first balanced JSON object", () => {
    const extracted = extractFirstJsonValue('prefix {"a":1} suffix {"b":2}');
    expect(extracted).toBe('{"a":1}');
  });
});
