import { describe, expect, it } from "vitest";
import { extractFirstJsonValue, fingerprintText, normalizeQuestion, parseQuestionObjects } from "./promptArchitecture";

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

// Curly quotes are written as escapes so an editor can't quietly turn them into straight ones.
describe("normalizeQuestion", () => {
  it("turns curly quotes into straight ones", () => {
    expect(normalizeQuestion("\u201CWhat\u2019s your \u2018usual\u2019 order?\u201D")).toBe(
      "\"What's your 'usual' order?\"",
    );
  });
});

describe("fingerprintText", () => {
  it("gives questions that differ only in quote style the same fingerprint", () => {
    expect(fingerprintText("What\u2019s the \u201Cbest\u201D snack you\u2018ve had?")).toBe(
      fingerprintText("What's the \"best\" snack you've had?"),
    );
  });
});
