import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PruningPage from "./page";
import { useQuery, useMutation, useAction } from "convex/react";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    admin: {
      pruning: {
        getPendingTargets: "getPendingTargets",
        approvePruning: "approvePruning",
        rejectPruning: "rejectPruning",
        triggerGathering: "triggerGathering",
        flagQuestion: "flagQuestion",
        getReviewHistory: "getReviewHistory",
        undoReview: "undoReview",
      },
      questions: {
        updateQuestion: "updateQuestion",
        remixQuestion: "remixQuestion",
      },
    },
  },
}));

const target = (id: string) => ({
  _id: `p${id}`,
  questionId: `q${id}`,
  reason: "Low engagement",
  status: "pending",
  question: {
    _id: `q${id}`,
    text: `Question ${id}`,
    status: "public",
    reviewRevision: 3,
    totalShows: 100,
    totalLikes: 2,
    averageViewDuration: 1500,
  },
  metrics: {
    totalShows: 100,
    totalLikes: 2,
    averageViewDuration: 1500,
    hiddenCount: 5,
  },
});
let targets = [target("1")];
const update = vi.fn();
const remix = vi.fn();
const approve = vi.fn();
const keep = vi.fn();
const flag = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  targets = [target("1")];
  (useQuery as any).mockImplementation((query: any) =>
    query === "getPendingTargets" ? targets : [],
  );
  (useMutation as any).mockImplementation(
    (mutation: any) =>
      (
        ({
          updateQuestion: update,
          approvePruning: approve,
          rejectPruning: keep,
          flagQuestion: flag,
        }) as Record<string, typeof update>
      )[mutation] ?? vi.fn(),
  );
  vi.mocked(useAction).mockImplementation((action: any) =>
    action === "remixQuestion" ? remix : vi.fn(),
  );
  update.mockResolvedValue(null);
  remix.mockResolvedValue("Remixed text");
  approve.mockResolvedValue(null);
  keep.mockResolvedValue(null);
  flag.mockResolvedValue("p2");
});

const reason = () =>
  fireEvent.change(screen.getByLabelText("Review reason"), {
    target: { value: "Make the invitation easier to answer." },
  });

describe("PruningPage", () => {
  it("renders review signals without treating low engagement as poor content", () => {
    render(<PruningPage />);
    expect(screen.getByText('"Question 1"')).toBeInTheDocument();
    expect(screen.getByText("Low engagement")).toBeInTheDocument();
    expect(screen.getByText(/not proof of poor content/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune" })).toBeDisabled();
  });

  it("saves an edit explicitly with its original revision and review reason", async () => {
    render(<PruningPage />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByDisplayValue("Question 1"), {
      target: { value: "Updated question" },
    });
    expect(screen.getByLabelText("Save")).toBeDisabled();
    reason();
    fireEvent.click(screen.getByLabelText("Save"));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: "q1",
        text: "Updated question",
        expectedRevision: 3,
        reviewSource: "pruning",
        reviewOutcome: "edit",
        reviewReason: "Make the invitation easier to answer.",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Save")).not.toBeInTheDocument(),
    );
  });

  it("remix remains a draft until Save; the original stays visible", async () => {
    render(<PruningPage />);
    fireEvent.click(screen.getByLabelText("Remix"));
    await screen.findByDisplayValue("Remixed text");
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('"Question 1"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune" })).toBeDisabled();
    reason();
    fireEvent.click(screen.getByLabelText("Save"));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Remixed text",
          reviewOutcome: "remix",
          expectedRevision: 3,
        }),
      ),
    );
  });

  it("discarding a remix never mutates the question", async () => {
    render(<PruningPage />);
    fireEvent.click(screen.getByLabelText("Remix"));
    await screen.findByDisplayValue("Remixed text");
    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Remixed text")).not.toBeInTheDocument();
  });

  it("does not silently bring more questions into a completed batch", async () => {
    const view = render(<PruningPage />);
    await screen.findByText('"Question 1"');
    targets = [target("2")];
    view.rerender(<PruningPage />);
    expect(screen.getByText("This batch is complete")).toBeInTheDocument();
    expect(screen.queryByText('"Question 2"')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start next batch" }));
    expect(screen.getByText('"Question 2"')).toBeInTheDocument();
  });

  it("submits manual editorial flags with notes", async () => {
    render(<PruningPage />);
    fireEvent.click(screen.getByText("Flag a question for editorial review"));
    fireEvent.change(screen.getByLabelText("Question ID"), {
      target: { value: "q-new" },
    });
    fireEvent.click(screen.getByLabelText("Unclear answer"));
    fireEvent.change(screen.getByLabelText("What needs a closer look?"), {
      target: { value: "It is unclear what the question refers to." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to review" }));
    await waitFor(() =>
      expect(flag).toHaveBeenCalledWith({
        questionId: "q-new",
        reasons: ["unclear_answer"],
        notes: "It is unclear what the question refers to.",
      }),
    );
  });
});
