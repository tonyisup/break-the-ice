import { describe, expect, it } from "vitest";
import { parseEditorialReviews, questionRejectionReasons, type EditorialReview } from "./editorialReview";

const ready: EditorialReview = { readability: 4, answerability: 5, styleFit: 4, toneFit: 4, reasons: [] };
const naturalQuestion = "What snack do you save for when nobody else is around?";

describe("editorial publication gate", () => {
  it("requires a complete review even when the text passes mechanical checks", () => {
    expect(questionRejectionReasons(naturalQuestion)).toContain("editorial review required");
    expect(questionRejectionReasons(naturalQuestion, ready)).toEqual([]);
  });

  it.each([
    ["What's your most guilty pleasure snack that you secretly enjoy at odd hours?", { readability: 2 }],
    ["Which browser tab management strategy are you most like and what does it reveal about your workflow?", { styleFit: 2 }],
    ["If you could instantly automate one tedious household chore, but you had to do an equally tedious different chore by hand forever, which trade-off would you accept for a cleaner home?", { answerability: 2 }],
  ])("keeps a draft out of publication when the editor flags it: %s", (text, scores) => {
    expect(questionRejectionReasons(text, { ...ready, ...scores }).length).toBeGreaterThan(0);
  });

  it("retains mechanical validation and explicit editorial objections", () => {
    expect(questionRejectionReasons("Hello", ready)).toContain("too short");
    expect(questionRejectionReasons(naturalQuestion, { ...ready, reasons: ["Does not fit the selected tone"] })).toContain("Does not fit the selected tone");
  });
});

describe("review response parsing", () => {
  it("uses candidate indexes rather than trusting review order", () => {
    const lowScore = { ...ready, readability: 2 };
    expect(parseEditorialReviews(JSON.stringify({ reviews: [{ index: 1, ...lowScore }, { index: 0, ...ready }] }), 2)).toEqual([ready, lowScore]);
  });

  it.each([
    { reviews: [] },
    { reviews: [{ index: 0, ...ready }, { index: 0, ...ready }] },
    { reviews: [{ index: 5, ...ready }] },
    { reviews: [{ index: 0, ...ready, readability: "5" }] },
    { reviews: [{ index: 0, ...ready, readability: 9 }] },
    { reviews: [{ index: 0, ...ready, reasons: "fine" }] },
  ])("fails closed on malformed or incomplete reviews", response => {
    expect(() => parseEditorialReviews(JSON.stringify(response), 1)).toThrow();
  });
});
