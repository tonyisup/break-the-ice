import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  decisionTarget,
  matchesFilters,
  nextFocus,
  queueKeyAction,
  reviewBatches,
  type ReviewQuestion,
} from "./queue";

const q = (id: string, extra: Partial<ReviewQuestion> = {}) =>
  ({ _id: id as Id<"questions">, _creationTime: 0, status: "pending", totalLikes: 0, totalShows: 0, averageViewDuration: 0, ...extra }) as ReviewQuestion;
const check = (verdict: "keep" | "hold", safety: string[] = []) =>
  ({ verdict, reasons: [], safety, confidence: 4, note: "", wouldPublish: false, model: "m", promptVersion: 2, runId: "r", checkedAt: 0 }) as unknown as ReviewQuestion["qualityCheck"];

describe("matchesFilters", () => {
  const keep = q("a", { isAIGenerated: true, qualityCheck: check("keep") });
  const flagged = q("b", { isAIGenerated: true, qualityCheck: check("keep", ["trauma"]) });
  const person = q("c");
  it("sorts questions by Claude's verdict, counting a safety flag as a concern", () => {
    expect([keep, flagged, person].filter((x) => matchesFilters(x, "keep", "all")).map((x) => x._id)).toEqual(["a"]);
    expect([keep, flagged, person].filter((x) => matchesFilters(x, "hold", "all")).map((x) => x._id)).toEqual(["b"]);
    expect([keep, flagged, person].filter((x) => matchesFilters(x, "unchecked", "all")).map((x) => x._id)).toEqual(["c"]);
  });
  it("filters by who wrote the question", () => {
    expect([keep, person].filter((x) => matchesFilters(x, "all", "people")).map((x) => x._id)).toEqual(["c"]);
    expect([keep, person].filter((x) => matchesFilters(x, "all", "ai")).map((x) => x._id)).toEqual(["a"]);
  });
});

describe("decisionTarget", () => {
  const list = [q("a"), q("b"), q("c")];
  it("acts on the focused question when nothing is selected", () => {
    expect(decisionTarget(list, new Set(), "b" as Id<"questions">).map((x) => x._id)).toEqual(["b"]);
  });
  it("acts on the selection, in list order, and never on a selected question the filter hides", () => {
    const selected = new Set(["c", "a", "hidden"] as Id<"questions">[]);
    expect(decisionTarget(list, selected, "b" as Id<"questions">).map((x) => x._id)).toEqual(["a", "c"]);
  });
});

describe("nextFocus", () => {
  const before = [q("a"), q("b"), q("c"), q("d")];
  it("keeps focus on a question that is still there", () => {
    expect(nextFocus(before, before, "b" as Id<"questions">)).toBe("b");
  });
  it("moves to the question that took the decided one's place", () => {
    expect(nextFocus(before, [q("a"), q("d")], "b" as Id<"questions">)).toBe("d");
  });
  it("starts at the top when nothing was in focus", () => {
    expect(nextFocus([], before, null)).toBe("a");
    expect(nextFocus(before, [q("c"), q("d")], "zz" as Id<"questions">)).toBe("c");
  });
  it("falls back to the last question, and to nothing once the queue is empty", () => {
    expect(nextFocus(before, [q("a")], "d" as Id<"questions">)).toBe("a");
    expect(nextFocus(before, [], "a" as Id<"questions">)).toBeNull();
  });
});

describe("reviewBatches", () => {
  it("splits a large selection into server-sized reviews", () => {
    expect(reviewBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(reviewBatches([], 2)).toEqual([]);
  });
});

describe("queueKeyAction", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => queueKeyAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods });
  it("maps the review keys", () => {
    expect(key("j")).toEqual({ type: "move", by: 1 });
    expect(key("ArrowUp")).toEqual({ type: "move", by: -1 });
    expect(key("a")).toEqual({ type: "approve" });
    expect(key("r")).toEqual({ type: "reject" });
    expect(key("1")).toEqual({ type: "toggleReason", reason: "awkward_wording" });
    expect(key("4")).toEqual({ type: "toggleReason", reason: "repeated_construction" });
    expect(key("a", { metaKey: true })).toEqual({ type: "selectAll" });
  });
  it("leaves other keys and browser shortcuts alone", () => {
    expect(key("5")).toBeNull();
    expect(key("r", { metaKey: true })).toBeNull();
    expect(key("q")).toBeNull();
  });
});
