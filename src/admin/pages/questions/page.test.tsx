import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAction, useMutation, useQuery } from "convex/react";
import QuestionsPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    admin: {
      questions: {
        getQuestions: "getQuestions",
        getPendingQuestions: "getPendingQuestions",
        createQuestion: "createQuestion",
        updateQuestion: "updateQuestion",
        deleteQuestion: "deleteQuestion",
        remixQuestion: "remixQuestion",
      },
    },
    core: {
      styles: { getStyles: "getStyles" },
      tones: { getTones: "getTones" },
    },
  },
}));

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const aiQuestion = {
  _id: "q-ai",
  _creationTime: 2,
  text: "What made you laugh this week?",
  isAIGenerated: true,
  status: "pending",
  ...counters,
};
const submittedQuestion = {
  _id: "q-user",
  _creationTime: 1,
  customText: "What is your go-to karaoke song?",
  authorId: "user-1",
  status: "pending",
  ...counters,
};

describe("admin questions page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    vi.mocked(useQuery).mockImplementation(((name: string) => {
      // The newest-questions list no longer holds the queue: it comes from its own query.
      if (name === "getQuestions") return [];
      if (name === "getPendingQuestions") return [aiQuestion, submittedQuestion];
      if (name === "getStyles" || name === "getTones") return [];
      return undefined;
    }) as never);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as never);
    vi.mocked(useAction).mockReturnValue(vi.fn() as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("points to the review queue instead of reviewing pending questions inline", () => {
    render(<QuestionsPage />);

    const link = screen.getByRole("link", { name: /2 questions are waiting for review/ });
    expect(link).toHaveAttribute("href", "/admin/review");
    expect(screen.queryByDisplayValue("What made you laugh this week?")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("marks a hold in the list of reviewed questions, and leaves a plain keep unmarked", () => {
    const reviewed = (text: string, verdict: "keep" | "hold") => ({
      ...aiQuestion,
      _id: `reviewed-${verdict}`,
      text,
      status: "public",
      qualityCheck: { verdict, reasons: verdict === "hold" ? ["awkward_wording"] : [], safety: [], confidence: 4, note: "Stiff phrasing.", wouldPublish: false },
    });
    vi.mocked(useQuery).mockImplementation(((name: string) => {
      if (name === "getPendingQuestions" || name === "getStyles" || name === "getTones") return [];
      if (name === "getQuestions") return [reviewed("Which chore do you put off?", "hold"), reviewed("What made you smile today?", "keep")];
      return undefined;
    }) as never);

    render(<QuestionsPage />);

    // The table and the mobile cards both render; each shows the hold's mark once and no other.
    const marks = screen.getAllByText("Claude: hold");
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(mark).toHaveAttribute("title", "Stiff phrasing.");
    expect(screen.queryByText("Claude: keep")).toBeNull();
    expect(screen.queryByText("Claude: safety flag")).toBeNull();
  });
});
