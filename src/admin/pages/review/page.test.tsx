import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import ReviewQueuePage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn(), useAction: vi.fn() }));
vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    admin: {
      questions: { getPendingQuestions: "getPendingQuestions", updateQuestion: "updateQuestion", remixQuestion: "remixQuestion" },
      review: { reviewPendingQuestions: "reviewPendingQuestions" },
      pruning: { undoReview: "undoReview" },
    },
    core: { styles: { getStyles: "getStyles" }, tones: { getTones: "getTones" } },
  },
}));

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const hold = { verdict: "hold", reasons: ["awkward_wording"], safety: [], confidence: 4, note: "Stiff phrasing.", wouldPublish: false };
const aiQuestion = { _id: "q-ai", _creationTime: 1, text: "What made you laugh this week?", isAIGenerated: true, status: "pending", reviewRevision: 3, qualityCheck: hold, ...counters };
const personQuestion = { _id: "q-user", _creationTime: 2, customText: "What is your go-to karaoke song?", authorId: "user-1", status: "pending", ...counters };
const thirdQuestion = { _id: "q-3", _creationTime: 3, text: "Which smell takes you back to childhood?", isAIGenerated: true, status: "pending", ...counters };

const reviewPendingQuestions = vi.fn();
const updateQuestion = vi.fn();
const undoReview = vi.fn();
const remixQuestion = vi.fn();
let pending: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  pending = [aiQuestion, personQuestion, thirdQuestion];
  reviewPendingQuestions.mockResolvedValue({ reviewId: "review-1" });
  updateQuestion.mockResolvedValue(null);
  undoReview.mockResolvedValue(null);
  remixQuestion.mockResolvedValue("What made you laugh out loud this week?");
  vi.mocked(useQuery).mockImplementation(((name: string) => {
    if (name === "getPendingQuestions") return pending;
    if (name === "getStyles") return [{ id: "would-you-rather", name: "Would you rather" }];
    if (name === "getTones") return [{ id: "playful", name: "Playful" }];
    return undefined;
  }) as never);
  const mutations: Record<string, unknown> = { reviewPendingQuestions, updateQuestion, undoReview };
  vi.mocked(useMutation).mockImplementation(((name: string) => mutations[name] ?? vi.fn()) as never);
  vi.mocked(useAction).mockReturnValue(remixQuestion as never);
});
afterEach(() => vi.unstubAllGlobals());

const press = (key: string, init: KeyboardEventInit = {}) => act(() => { fireEvent.keyDown(window, { key, ...init }); });
const list = () => within(screen.getByRole("region", { name: "Pending questions" }));
const focusedPane = () => within(screen.getByRole("region", { name: "Focused question" }));

describe("review queue", () => {
  it("lists the queue oldest first and focuses the first question, with Claude's verdict beside it", () => {
    render(<ReviewQueuePage />);
    expect(list().getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("What made you laugh this week?"),
      expect.stringContaining("What is your go-to karaoke song?"),
      expect.stringContaining("Which smell takes you back to childhood?"),
    ]);
    expect(focusedPane().getByDisplayValue("What made you laugh this week?")).toBeInTheDocument();
    expect(focusedPane().getByText("Claude: hold")).toBeInTheDocument();
    expect(focusedPane().getByText("Stiff phrasing.")).toBeInTheDocument();
  });

  it("links each row to the question's details, for screens too narrow for the focused pane", () => {
    render(<ReviewQueuePage />);
    expect(list().getByRole("link", { name: "Details: What is your go-to karaoke song?" })).toHaveAttribute("href", "/admin/questions/q-user");
  });

  it("approves the focused question with A, asking for nothing, and offers undo", async () => {
    render(<ReviewQueuePage />);
    press("a");
    await waitFor(() =>
      expect(reviewPendingQuestions).toHaveBeenCalledWith({ questions: [{ id: "q-ai", expectedRevision: 3 }], decision: "approve" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Approved 1 question", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));

    const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as { action: { onClick: () => void } };
    options.action.onClick();
    await waitFor(() => expect(undoReview).toHaveBeenCalledWith({ reviewId: "review-1" }));
  });

  it("rejects with the reasons picked by number key, then clears them", async () => {
    render(<ReviewQueuePage />);
    press("1");
    press("4");
    expect(screen.getByRole("button", { name: /Awkward wording/ })).toHaveAttribute("aria-pressed", "true");
    press("r");
    await waitFor(() =>
      expect(reviewPendingQuestions).toHaveBeenCalledWith({
        questions: [{ id: "q-ai", expectedRevision: 3 }],
        decision: "reject",
        reasons: ["awkward_wording", "repeated_construction"],
      }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Awkward wording/ })).toHaveAttribute("aria-pressed", "false"));
  });

  it("decides every selected question at once, and sends a note when there is one", async () => {
    render(<ReviewQueuePage />);
    fireEvent.click(list().getByRole("checkbox", { name: /karaoke/ }));
    press("j"); press("j");
    press("x");
    fireEvent.change(screen.getByRole("textbox", { name: "Note (optional)" }), { target: { value: "Good batch" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve 2/ }));
    await waitFor(() =>
      expect(reviewPendingQuestions).toHaveBeenCalledWith({
        questions: [{ id: "q-user", expectedRevision: 0 }, { id: "q-3", expectedRevision: 0 }],
        decision: "approve",
        note: "Good batch",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Approved 2 questions", expect.anything());
  });

  it("selects everything shown with Cmd+A, leaving out what the filter hides", async () => {
    render(<ReviewQueuePage />);
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    press("a", { metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: /Keep private/ }));
    await waitFor(() =>
      expect(reviewPendingQuestions).toHaveBeenCalledWith({ questions: [{ id: "q-user", expectedRevision: 0 }], decision: "reject" }),
    );
  });

  it("filters to Claude's concerns", () => {
    render(<ReviewQueuePage />);
    fireEvent.click(screen.getByRole("button", { name: "Claude: concern" }));
    expect(list().getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("What made you laugh this week?")]);
  });

  it("leaves shortcuts alone while typing in the note", () => {
    render(<ReviewQueuePage />);
    const noteBox = screen.getByRole("textbox", { name: "Note (optional)" });
    noteBox.focus();
    fireEvent.keyDown(noteBox, { key: "a" });
    expect(reviewPendingQuestions).not.toHaveBeenCalled();
  });

  it("moves focus to the next question once the decided one leaves the queue", () => {
    const { rerender } = render(<ReviewQueuePage />);
    pending = [personQuestion, thirdQuestion];
    rerender(<ReviewQueuePage />);
    expect(focusedPane().getByDisplayValue("What is your go-to karaoke song?")).toBeInTheDocument();
  });

  it("saves a wording edit with the revision it started from", async () => {
    render(<ReviewQueuePage />);
    const box = focusedPane().getByDisplayValue("What made you laugh this week?");
    fireEvent.focus(box);
    fireEvent.blur(box, { target: { value: "What made you laugh hardest this week?" } });
    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith({
        id: "q-ai",
        text: "What made you laugh hardest this week?",
        expectedRevision: 3,
        reviewReason: "Edited during review",
      }),
    );
  });

  it("shows an author's new wording after they edit, so the old wording isn't saved", () => {
    const { rerender } = render(<ReviewQueuePage />);
    fireEvent.focus(focusedPane().getByDisplayValue("What made you laugh this week?"));
    pending = [{ ...aiQuestion, text: undefined, customText: "What made you smile today?", reviewRevision: 4 }, personQuestion];
    rerender(<ReviewQueuePage />);
    const box = focusedPane().getByDisplayValue("What made you smile today?");
    fireEvent.blur(box);
    expect(updateQuestion).not.toHaveBeenCalled();
  });

  it("proposes a remix and applies it only when chosen", async () => {
    render(<ReviewQueuePage />);
    fireEvent.click(focusedPane().getByRole("button", { name: /Remix/ }));
    expect(await focusedPane().findByText("What made you laugh out loud this week?")).toBeInTheDocument();
    expect(updateQuestion).not.toHaveBeenCalled();
    fireEvent.click(focusedPane().getByRole("button", { name: "Use this wording" }));
    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q-ai", text: "What made you laugh out loud this week?", expectedRevision: 3, reviewOutcome: "remix" }),
      ),
    );
  });

  it("reports a failed review and keeps the selection", async () => {
    reviewPendingQuestions.mockRejectedValueOnce(new Error("A selected question changed during review. Reload before saving."));
    render(<ReviewQueuePage />);
    fireEvent.click(list().getByRole("checkbox", { name: /karaoke/ }));
    press("a");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A selected question changed during review. Reload before saving."));
    expect(list().getByRole("checkbox", { name: /karaoke/ })).toBeChecked();
  });

  it("says when the queue is empty", () => {
    pending = [];
    render(<ReviewQueuePage />);
    expect(screen.getByText("Nothing waiting for review.")).toBeInTheDocument();
  });
});
