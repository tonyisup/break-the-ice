import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import ReportsPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    admin: {
      reports: { getPerformanceReport: "getPerformanceReport" },
      review: { pruneQuestions: "pruneQuestions" },
      pruning: { undoReview: "undoReview" },
      generator: { listModels: "listModels" },
    },
    core: { styles: { getStyles: "getStyles" }, tones: { getTones: "getTones" }, topics: { getTopics: "getTopics" } },
  },
}));

const row = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, text, status: "live", reviewRevision: 0, createdAt: 0, isAIGenerated: true, byPerson: false,
  style: "open-ended", tone: "playful", seen: 0, liked: 0, shared: 0, hidden: 0, avgViewMs: 0, ...extra,
});
const rows = [
  row("q-proven", "What made you laugh this week?", { seen: 100, liked: 30, shared: 4, avgViewMs: 5200, claude: "keep" }),
  row("q-flat", "What is your favourite spreadsheet?", { seen: 40, liked: 0, hidden: 6, reviewRevision: 2 }),
  row("q-lucky", "Would you rather fly or swim?", { seen: 1, liked: 1, style: "would-you-rather", model: "anthropic/claude-haiku-5.5" }),
  row("q-rejected", "What tax form do you love?", { status: "rejected", style: "would-you-rather", claude: "keep" }),
  row("q-pending", "What is on your desk?", { status: "pending", style: "would-you-rather", claude: "hold" }),
];

const pruneQuestions = vi.fn();
const undoReview = vi.fn();
let queryArgs: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  queryArgs = [];
  pruneQuestions.mockResolvedValue({ reviewId: "review-1" });
  undoReview.mockResolvedValue(null);
  vi.mocked(useQuery).mockImplementation(((name: string, args: unknown) => {
    if (name === "getPerformanceReport") {
      queryArgs.push(args);
      return { rows, eventsCounted: 182, oldestEventAt: 1, eventsTruncated: false, questionsTruncated: false };
    }
    if (name === "getStyles") return [{ id: "open-ended", slug: "open-ended", name: "Open-ended" }, { id: "would-you-rather", slug: "would-you-rather", name: "Would you rather" }];
    if (name === "getTones") return [{ id: "playful", slug: "playful", name: "Playful" }];
    if (name === "getTopics") return [];
    if (name === "listModels") return [{ _id: "m1", model: "anthropic/claude-haiku-5.5", label: "Haiku", createdAt: 0 }];
    return undefined;
  }) as never);
  const mutations: Record<string, unknown> = { pruneQuestions, undoReview };
  vi.mocked(useMutation).mockImplementation(((name: string) => mutations[name]) as never);
});
afterEach(() => vi.unstubAllGlobals());

const renderAt = (path = "/admin/reports") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>,
  );
const panel = () => within(screen.getByRole("tabpanel"));
const questionLinks = () => panel().queryAllByRole("link").map((link) => link.textContent);

describe("reports", () => {
  it("ranks library questions with enough views, best first, with the counts behind each rate", () => {
    renderAt();
    expect(screen.getByText("Library questions").nextSibling).toHaveTextContent("3");
    expect(questionLinks()).toEqual(["What made you laugh this week?", "What is your favourite spreadsheet?"]);
    expect(panel().getByText("30/100")).toBeInTheDocument();
    expect(panel().getByText("5.2s")).toBeInTheDocument();
  });

  it("puts the rarely liked first under Needs attention, and lists everything under All", () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(questionLinks()[0]).toBe("What is your favourite spreadsheet?");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(questionLinks()).toHaveLength(3);
  });

  it("asks for events from the start of the chosen period", () => {
    renderAt();
    expect(queryArgs.at(-1)).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    const since = (queryArgs.at(-1) as { since: number }).since;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(since).toBe(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("copies the selected questions with their links for an email", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAt();
    fireEvent.click(panel().getByRole("checkbox", { name: /laugh this week/ }));
    fireEvent.click(screen.getByRole("button", { name: /Copy for email/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`What made you laugh this week?\n${window.location.origin}/question/q-proven`),
    );
    expect(toast.success).toHaveBeenCalledWith("Copied 1 question with their links");
  });

  it("prunes the selected questions after a confirm, and offers undo", async () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    fireEvent.click(panel().getByRole("checkbox", { name: "Select all listed" }));
    fireEvent.click(screen.getByRole("button", { name: /Prune 2/ }));
    expect(pruneQuestions).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Prune" }));
    await waitFor(() =>
      expect(pruneQuestions).toHaveBeenCalledWith({
        questions: [{ id: "q-flat", expectedRevision: 2 }, { id: "q-proven", expectedRevision: 0 }],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Pruned 2 questions", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));
    const options = vi.mocked(toast.success).mock.calls.at(-1)![1] as unknown as { action: { onClick: () => void } };
    options.action.onClick();
    await waitFor(() => expect(undoReview).toHaveBeenCalledWith({ reviewId: "review-1" }));
  });

  it("compares styles on engagement, your decisions and Claude's, and opens a style's questions", () => {
    renderAt("/admin/reports?tab=style");
    const wyr = panel().getByRole("row", { name: /Would you rather/ });
    // 3 questions: 1 live, 1 rejected, 1 waiting. You approved 1 of the 2 decided; Claude would
    // keep 1 of the 2 it checked; and on the 1 decided question it checked, you disagreed.
    expect(within(wyr).getByText(/3 questions · 1 waiting/)).toBeInTheDocument();
    const cells = within(wyr).getAllByRole("cell").map((cell) => cell.textContent);
    const column = (name: string) => cells[screen.getAllByRole("columnheader").map((h) => h.textContent).indexOf(name) - 1];
    expect(column("Your approval")).toBe("50%1/2");
    expect(column("Claude keep")).toBe("50%1/2");
    expect(column("Agreed")).toBe("0%0/1");

    fireEvent.click(within(wyr).getByRole("button", { name: "Would you rather" }));
    expect(screen.getByRole("tab", { name: "Questions" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Style: Would you rather/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(questionLinks()).toEqual(["Would you rather fly or swim?"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(questionLinks()).toHaveLength(3);
  });

  it("compares models, with questions from before the model was recorded kept apart", () => {
    renderAt("/admin/reports?tab=model");
    expect(panel().getByRole("row", { name: /Haiku/ })).toBeInTheDocument();
    expect(panel().getByRole("row", { name: /Not recorded/ })).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Haiku" }));
    expect(screen.getByText(/Model: Haiku/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(questionLinks()).toEqual(["Would you rather fly or swim?"]);
  });

  it("exports the listed questions as CSV", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:report");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(csv.split("\n")[0]).toMatch(/^Question,Style,Tone/);
    expect(csv).toContain("What made you laugh this week?,Open-ended,Playful");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
