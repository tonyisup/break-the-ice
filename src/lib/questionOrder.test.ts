import { describe, expect, it } from "vitest";
import { orderQuestionBatch } from "./questionOrder";

describe("question batch order", () => {
  it("breaks up repeated formats without dropping questions or changing the input", () => {
    const questions = [
      { text: "a", style: "trade-off" }, { text: "bb", style: "trade-off" },
      { text: "ccc", style: "memory" }, { text: "dddd", style: "memory" },
    ];
    expect(orderQuestionBatch(questions).map(q => q.text)).toEqual(["a", "ccc", "bb", "dddd"]);
    expect(questions.map(q => q.text)).toEqual(["a", "bb", "ccc", "dddd"]);
  });

  it("considers the last displayed question at a pagination boundary", () => {
    expect(orderQuestionBatch([{ text: "a", styleId: "a" }, { text: "bb", styleId: "b" }], { styleId: "a" })[0].styleId).toBe("b");
  });

  it("keeps all questions when a style anchor makes repetition unavoidable", () => {
    expect(orderQuestionBatch([{ text: "long", style: "a" }, { text: "a", style: "a" }]).map(q => q.text)).toEqual(["a", "long"]);
    expect(orderQuestionBatch([])).toEqual([]);
  });
});
