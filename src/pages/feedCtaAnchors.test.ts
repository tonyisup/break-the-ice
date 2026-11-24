import { expect, it } from "vitest";
import { ctaHolderId, keepCtasInPlace } from "./feedCtaAnchors";

const feed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ _id: `q${index}` }));

it("uses the usual slot until a prompt is pinned", () => {
  expect(ctaHolderId(feed(12), {}, "newsletter")).toBe("q4");
  expect(ctaHolderId(feed(12), {}, "refine")).toBe("q9");
  expect(ctaHolderId(feed(3), {}, "newsletter")).toBeUndefined();
});

it("keeps prompts under the same questions when one above them is removed", () => {
  const questions = feed(12);
  const anchors = keepCtasInPlace(questions, {}, "q1");
  const after = questions.filter((question) => question._id !== "q1");
  expect(ctaHolderId(after, anchors, "newsletter")).toBe("q4");
  expect(ctaHolderId(after, anchors, "refine")).toBe("q9");
});

it("moves a prompt to the question above when its own question is removed", () => {
  const anchors = keepCtasInPlace(feed(12), {}, "q4");
  expect(anchors.newsletter).toBe("q3");
  expect(anchors.refine).toBe("q9");
});

it("falls back to the usual slot when a pinned question leaves the feed another way", () => {
  expect(ctaHolderId(feed(12), { newsletter: "gone" }, "newsletter")).toBe("q4");
});
