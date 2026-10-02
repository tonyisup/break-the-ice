import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import AddQuestionPage from "./page";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../../../convex/constants";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/header", () => ({ Header: () => null }));
vi.mock("@/hooks/useTeamWorkspace", () => ({
  useTeamWorkspace: () => ({ isEntitlementsLoading: false, teamWorkspaceId: undefined }),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const addCustomQuestion = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  // The public-feed switch measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue(addCustomQuestion);
});

function submitQuestion(text: string) {
  render(<AddQuestionPage />);
  const questionInput = screen.getByLabelText("Your Question");
  fireEvent.change(questionInput, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Submit for Review" }));
  return questionInput;
}

describe("AddQuestionPage input validation", () => {
  it("limits the question field to the length limit and shows the server's readable message, keeping the draft", async () => {
    addCustomQuestion.mockRejectedValue(
      new ConvexError({ code: ERROR_CODES.QUESTION_TEXT_TOO_LONG, message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG }),
    );

    const questionInput = submitQuestion("What is your favorite breakfast?");

    expect(questionInput).toHaveAttribute("maxlength", String(MAX_QUESTION_TEXT_LENGTH));
    expect(questionInput).toHaveAccessibleDescription(`32/${MAX_QUESTION_TEXT_LENGTH} characters`);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG));
    expect(addCustomQuestion).toHaveBeenCalledWith({
      customText: "What is your favorite breakfast?",
      isPublic: true,
      organizationId: undefined,
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(questionInput).toHaveValue("What is your favorite breakfast?");
  });

  it("asks for a question instead of sending blank text", () => {
    submitQuestion("   ");

    expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TEXT_REQUIRED);
    expect(addCustomQuestion).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when submitting fails without a readable one", async () => {
    addCustomQuestion.mockRejectedValue(new Error("Network unavailable"));

    submitQuestion("What is your favorite breakfast?");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to submit question. Please try again."),
    );
  });
});
