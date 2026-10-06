import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
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

vi.mock("../../../../convex/_generated/api", () => ({
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

describe("admin questions review queue", () => {
  const updateQuestion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    vi.stubGlobal("prompt", vi.fn(() => "Reviewed"));
    updateQuestion.mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(((name: string) => {
      // The newest-questions list no longer holds the queue: it comes from its own query.
      if (name === "getQuestions") return [];
      if (name === "getPendingQuestions") return [aiQuestion, submittedQuestion];
      if (name === "getStyles" || name === "getTones") return [];
      return undefined;
    }) as never);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "updateQuestion" ? updateQuestion : vi.fn()) as never);
    vi.mocked(useAction).mockReturnValue(vi.fn() as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const card = (text: string) => screen.getByDisplayValue(text).closest(".border-2") as HTMLElement;

  it("shows the pending queue from getPendingQuestions, labelling AI questions and offering Reject for them", () => {
    render(<QuestionsPage />);

    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    const ai = within(card("What made you laugh this week?"));
    expect(ai.getByText("AI generated")).toBeInTheDocument();
    expect(ai.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(ai.queryByRole("button", { name: "Mark Personal" })).toBeNull();

    const submitted = within(card("What is your go-to karaoke song?"));
    expect(submitted.getByText("User Submitted")).toBeInTheDocument();
    expect(submitted.getByRole("button", { name: "Mark Personal" })).toBeInTheDocument();
  });

  it("shows Claude's verdict, reasons and note on a checked question, and nothing extra on an unchecked one", () => {
    const checked = {
      ...aiQuestion,
      qualityCheck: { verdict: "hold", reasons: ["awkward_wording"], safety: [], confidence: 4, note: "Stiff phrasing.", wouldPublish: false },
    };
    vi.mocked(useQuery).mockImplementation(((name: string) => {
      if (name === "getPendingQuestions") return [checked, submittedQuestion];
      if (name === "getQuestions" || name === "getStyles" || name === "getTones") return [];
      return undefined;
    }) as never);

    render(<QuestionsPage />);

    const ai = within(card("What made you laugh this week?"));
    expect(ai.getByText("Claude: hold")).toBeInTheDocument();
    expect(ai.getByText("Awkward wording")).toBeInTheDocument();
    expect(ai.getByText("Stiff phrasing.")).toBeInTheDocument();
    expect(ai.queryByText("Would publish")).toBeNull();
    expect(within(card("What is your go-to karaoke song?")).queryByText(/^Claude:/)).toBeNull();
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

  it("Reject makes an AI question private, Approve makes it public, and Mark Personal says so", async () => {
    render(<QuestionsPage />);

    fireEvent.click(within(card("What made you laugh this week?")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Question rejected and made private"));
    expect(window.prompt).toHaveBeenLastCalledWith(expect.stringMatching(/hidden from everyone/));
    expect(updateQuestion).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "q-ai", status: "private", reviewReason: "Reviewed", expectedRevision: 0 }),
    );

    fireEvent.click(within(card("What made you laugh this week?")).getByRole("button", { name: /Approve Public/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Question marked as public"));
    expect(updateQuestion).toHaveBeenLastCalledWith(expect.objectContaining({ id: "q-ai", status: "public" }));

    fireEvent.click(within(card("What is your go-to karaoke song?")).getByRole("button", { name: "Mark Personal" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Question marked as personal"));
    expect(updateQuestion).toHaveBeenLastCalledWith(expect.objectContaining({ id: "q-user", status: "private" }));
  });
});

describe("editing a queued question", () => {
  const updateQuestion = vi.fn();
  const remixQuestion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    vi.stubGlobal("prompt", vi.fn(() => "Reviewed"));
    vi.stubGlobal("confirm", vi.fn(() => true));
    updateQuestion.mockResolvedValue(null);
    remixQuestion.mockResolvedValue("What made you laugh out loud this week?");
    vi.mocked(useQuery).mockImplementation(((name: string) => {
      // The queued question is not in the main list, as for any question the queue holds.
      if (name === "getQuestions") return [];
      if (name === "getPendingQuestions") return [{ ...aiQuestion, reviewRevision: 3 }];
      if (name === "getStyles" || name === "getTones") return [];
      return undefined;
    }) as never);
    vi.mocked(useMutation).mockImplementation(((name: string) =>
      name === "updateQuestion" ? updateQuestion : vi.fn()) as never);
    vi.mocked(useAction).mockReturnValue(remixQuestion as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves an inline text edit on a question that is only in the queue", async () => {
    render(<QuestionsPage />);

    const textarea = screen.getByDisplayValue("What made you laugh this week?");
    fireEvent.blur(textarea, { target: { value: "What made you laugh hardest this week?" } });

    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q-ai", text: "What made you laugh hardest this week?", expectedRevision: 3 }),
      ),
    );
  });

  it("shows the author's new wording after they edit a queued question, so the old wording isn't saved", async () => {
    const { rerender } = render(<QuestionsPage />);
    fireEvent.focus(screen.getByDisplayValue("What made you laugh this week?"));

    vi.mocked(useQuery).mockImplementation(((name: string) => {
      if (name === "getQuestions") return [];
      if (name === "getPendingQuestions") {
        return [{ ...aiQuestion, text: undefined, customText: "What made you smile today?", reviewRevision: 4 }];
      }
      if (name === "getStyles" || name === "getTones") return [];
      return undefined;
    }) as never);
    rerender(<QuestionsPage />);

    const textarea = screen.getByDisplayValue("What made you smile today?");
    expect(screen.queryByDisplayValue("What made you laugh this week?")).not.toBeInTheDocument();
    fireEvent.blur(textarea);
    expect(updateQuestion).not.toHaveBeenCalled();
  });

  it("saves a text edit with the revision it started from", async () => {
    render(<QuestionsPage />);

    const textarea = screen.getByDisplayValue("What made you laugh this week?");
    fireEvent.focus(textarea);
    fireEvent.blur(textarea, { target: { value: "What made you laugh hardest this week?" } });

    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q-ai", text: "What made you laugh hardest this week?", expectedRevision: 3 }),
      ),
    );
  });

  it("remixes a question that is only in the queue", async () => {
    render(<QuestionsPage />);

    const queued = screen.getByDisplayValue("What made you laugh this week?").closest(".border-2") as HTMLElement;
    fireEvent.click(within(queued).getByRole("button", { name: /Remix/ }));

    await waitFor(() =>
      expect(updateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q-ai", text: "What made you laugh out loud this week?", expectedRevision: 3, reviewOutcome: "remix" }),
      ),
    );
    expect(remixQuestion).toHaveBeenCalledWith({ id: "q-ai" });
  });
});
