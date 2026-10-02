import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { AddPersonalQuestionDialog } from "./AddPersonalQuestionDialog";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../../../convex/constants";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTeamWorkspace", () => ({
  useTeamWorkspace: () => ({ teamWorkspaceId: undefined }),
}));

const addPersonalQuestion = vi.fn();

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue(addPersonalQuestion);
});

function submitQuestion(text: string) {
  const onOpenChange = vi.fn();
  render(<AddPersonalQuestionDialog isOpen onOpenChange={onOpenChange} />);
  const questionInput = screen.getByLabelText("Your Question");
  fireEvent.change(questionInput, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Add to Stash" }));
  return { onOpenChange, questionInput };
}

describe("AddPersonalQuestionDialog input validation", () => {
  it("limits the question field to the length limit and shows the server's readable message, staying open", async () => {
    addPersonalQuestion.mockRejectedValue(
      new ConvexError({ code: ERROR_CODES.QUESTION_TEXT_TOO_LONG, message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG }),
    );

    const { onOpenChange, questionInput } = submitQuestion("What did you learn this week?");

    expect(questionInput).toHaveAttribute("maxlength", String(MAX_QUESTION_TEXT_LENGTH));
    expect(questionInput).toHaveAccessibleDescription(`29/${MAX_QUESTION_TEXT_LENGTH} characters`);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG));
    expect(addPersonalQuestion).toHaveBeenCalledWith({
      customText: "What did you learn this week?",
      isPublic: false,
      organizationId: undefined,
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(questionInput).toHaveValue("What did you learn this week?");
  });

  it("asks for a question instead of sending blank text", () => {
    const { onOpenChange } = submitQuestion("   ");

    expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TEXT_REQUIRED);
    expect(addPersonalQuestion).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when adding fails without a readable one", async () => {
    addPersonalQuestion.mockRejectedValue(new Error("Network unavailable"));

    submitQuestion("What did you learn this week?");

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to add personal question."));
  });
});
