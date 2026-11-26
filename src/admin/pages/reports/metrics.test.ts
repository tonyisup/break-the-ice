import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { emailCopy, questionList, rated, summarize, toCsv, VIEW_SORT, wilson, type QuestionFilter, type ReportRow } from "./metrics";

const row = (id: string, extra: Partial<ReportRow> = {}) => ({
  id: id as Id<"questions">,
  text: `Question ${id}?`,
  status: "live",
  reviewRevision: 0,
  createdAt: 0,
  isAIGenerated: true,
  byPerson: false,
  seen: 0,
  liked: 0,
  shared: 0,
  hidden: 0,
  avgViewMs: 0,
  ...extra,
}) as ReportRow;
const filter = (extra: Partial<QuestionFilter> = {}): QuestionFilter => ({ view: "top", minViews: 5, search: "", ...extra });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("wilson", () => {
  it("is wide with few views and narrows with more", () => {
    const one = wilson(1, 1);
    const many = wilson(30, 100);
    expect(one.low).toBeLessThan(many.low);
    expect(one.high).toBe(1);
    expect(many.low).toBeCloseTo(0.219, 2);
    expect(many.high).toBeCloseTo(0.396, 2);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe("rated", () => {
  it("counts a like with no seen event as a view", () => {
    expect(rated(row("a", { seen: 0, liked: 2 }))).toMatchObject({ views: 2, likeRate: 1 });
    expect(rated(row("b", { seen: 10, liked: 3, hidden: 1 }))).toMatchObject({ views: 10, likeRate: 0.3, hideRate: 0.1 });
  });
});

describe("questionList", () => {
  const rows = [
    row("lucky", { seen: 1, liked: 1 }),
    row("proven", { seen: 100, liked: 30 }),
    row("flat", { seen: 40, liked: 0 }),
    row("hidden", { seen: 40, liked: 0, hidden: 8 }),
    row("new", { seen: 6, liked: 0 }),
    row("pending", { status: "pending", seen: 100, liked: 90 }),
    row("styled", { seen: 20, liked: 5, style: "would-you-rather", text: "Would you rather fly?" }),
  ].map(rated);

  it("ranks top performers by the like rate the views can vouch for", () => {
    expect(ids(questionList(rows, filter(), VIEW_SORT.top))).toEqual(["proven", "styled", "flat", "hidden", "new"]);
  });
  it("puts questions shown often and rarely liked first when they need attention, the hidden ones ahead", () => {
    expect(ids(questionList(rows, filter({ view: "poor" }), VIEW_SORT.poor)).slice(0, 3)).toEqual(["hidden", "flat", "new"]);
  });
  it("leaves out questions below the view minimum, except under All", () => {
    expect(ids(questionList(rows, filter(), VIEW_SORT.top))).not.toContain("lucky");
    expect(ids(questionList(rows, filter({ view: "all" }), VIEW_SORT.all))).toContain("lucky");
  });
  it("lists only library questions, and filters by search and taxonomy", () => {
    expect(ids(questionList(rows, filter({ view: "all" }), VIEW_SORT.all))).not.toContain("pending");
    expect(ids(questionList(rows, filter({ view: "all", search: "FLY" }), VIEW_SORT.all))).toEqual(["styled"]);
    expect(ids(questionList(rows, filter({ view: "all", style: "would-you-rather" }), VIEW_SORT.all))).toEqual(["styled"]);
    expect(ids(questionList(rows, filter({ view: "all", style: "" }), VIEW_SORT.all))).not.toContain("styled");
  });
  it("sorts by a chosen column", () => {
    expect(ids(questionList(rows, filter(), { key: "hideRate", direction: "desc" }))[0]).toBe("hidden");
  });
});

describe("summarize", () => {
  it("adds up engagement, your decisions and Claude's verdicts per style", () => {
    const rows = [
      row("a", { style: "wyr", seen: 10, liked: 2, avgViewMs: 2000, claude: "keep" }),
      row("b", { style: "wyr", status: "rejected", seen: 0, claude: "keep" }),
      row("c", { style: "wyr", status: "rejected", claude: "hold" }),
      row("d", { style: "wyr", status: "pending", claude: "hold" }),
      row("e", { style: "wyr", status: "retired", seen: 30, liked: 1, hidden: 3, avgViewMs: 4000 }),
      row("f", { style: "wyr", isAIGenerated: false, seen: 10 }),
      row("g", {}),
    ].map(rated);
    const [wyr, none] = summarize(rows, "style");
    expect(wyr).toMatchObject({
      key: "wyr", questions: 6, live: 2, pending: 1, rejected: 2, retired: 1,
      views: 50, liked: 3, hidden: 3, likeRate: 0.06, hideRate: 0.06,
      approved: 1, decided: 3, claudeKeep: 2, claudeChecked: 4,
      // a: keep and approved (agreed); b: keep but rejected; c: hold and rejected (agreed).
      agreed: 2, compared: 3,
    });
    // Weighted by views: (2000 * 10 + 4000 * 30 + 0 * 10) / 50.
    expect(wyr.avgViewMs).toBe(2800);
    expect(none).toMatchObject({ key: "", questions: 1 });
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks, and defuses formulas", () => {
    expect(toCsv(["Q", "N"], [['Say "hi", then', 3], ["=SUM(A1)", -1]])).toBe('Q,N\n"Say ""hi"", then",3\n\'=SUM(A1),-1\n');
  });
});

describe("emailCopy", () => {
  it("lists each question with its public link", () => {
    expect(emailCopy([row("a"), row("b")], "https://example.test")).toBe(
      "Question a?\nhttps://example.test/question/a\n\nQuestion b?\nhttps://example.test/question/b",
    );
  });
});
