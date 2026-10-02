import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { RemixQuestionDrawer } from "./remix-question-drawer";
import { ERROR_CODES, ERROR_MESSAGES } from "../../../convex/constants";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/useTeamWorkspace", () => ({
  useTeamWorkspace: () => ({ activeWorkspace: null, isEntitlementsLoading: false, teamWorkspaceId: undefined }),
}));

// vaul needs layout APIs jsdom lacks; an open drawer is just its content here.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: Pass,
    DrawerDescription: Pass,
    DrawerFooter: Pass,
    DrawerClose: Pass,
  };
});

const question = {
  _id: "q1",
  _creationTime: 0,
  text: "What is your favorite breakfast?",
  tags: [],
  totalLikes: 0,
  totalShows: 0,
  averageViewDuration: 0,
} as never;

const addPersonalQuestion = vi.fn();

function renderDrawer(remix: ReturnType<typeof vi.fn>) {
  (useAction as ReturnType<typeof vi.fn>).mockReturnValue(remix);
  const onOpenChange = vi.fn();
  render(
    <RemixQuestionDrawer
      question={question}
      styleId={"s1" as never}
      toneId={"t1" as never}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue(addPersonalQuestion);
});

describe("RemixQuestionDrawer remix errors", () => {
  it("shows the server's readable message when the daily AI budget is paused, and lets the person try again later", async () => {
    const paused = new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
    renderDrawer(vi.fn().mockRejectedValue(paused));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Remix failed: ${ERROR_MESSAGES.AI_BUDGET_PAUSED}`);
    });
    expect(addPersonalQuestion).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
  });

  it("still shows a plain error's message", async () => {
    renderDrawer(vi.fn().mockRejectedValue(new Error("Question not found.")));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Remix failed: Question not found.");
    });
    expect(screen.getByRole("button", { name: "Remix" })).toBeInTheDocument();
  });
});

describe("RemixQuestionDrawer first remix", () => {
  it("does not show a first remix the server refuses to save, and lets the person remix again", async () => {
    addPersonalQuestion.mockRejectedValueOnce(
      new ConvexError({ code: ERROR_CODES.QUESTION_TEXT_TOO_LONG, message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG }),
    );
    renderDrawer(vi.fn().mockResolvedValue("A remix the server refuses?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Remix failed: ${ERROR_MESSAGES.AI_REMIX_RESULT_TOO_LONG}`);
    });
    expect(screen.queryByText("A remix the server refuses?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
  });
});

describe("RemixQuestionDrawer remix again", () => {
  it("keeps showing the saved remix when the server refuses the next one", async () => {
    const saveMutation = vi
      .fn()
      .mockResolvedValueOnce("q-new")
      .mockRejectedValueOnce(
        new ConvexError({ code: ERROR_CODES.QUESTION_TEXT_TOO_LONG, message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG }),
      )
      .mockResolvedValueOnce(null);
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue(saveMutation);
    renderDrawer(
      vi
        .fn()
        .mockResolvedValueOnce("What is your favorite late-night snack?")
        .mockResolvedValueOnce("A remix the server refuses?"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remix Again" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Remix failed: ${ERROR_MESSAGES.AI_REMIX_RESULT_TOO_LONG}`);
    });
    expect(screen.getByText("What is your favorite late-night snack?")).toBeInTheDocument();
    expect(screen.queryByText("A remix the server refuses?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(saveMutation).toHaveBeenLastCalledWith(
        expect.objectContaining({ questionId: "q-new", customText: "What is your favorite late-night snack?" }),
      );
    });
  });
});

describe("RemixQuestionDrawer save errors", () => {
  it.each([
    [
      "the server's input validation message",
      new ConvexError({ code: ERROR_CODES.QUESTION_TEXT_TOO_LONG, message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG }),
      ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG,
    ],
    ["a generic message for an unreadable error", new Error("boom"), "Failed to save remixed question."],
  ])("shows %s when saving the remix fails, and keeps the drawer open", async (_label, failure, expected) => {
    const saveMutation = vi.fn().mockResolvedValueOnce("q-new").mockRejectedValueOnce(failure);
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue(saveMutation);
    const { onOpenChange } = renderDrawer(vi.fn().mockResolvedValue("What is your favorite late-night snack?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expected);
    });
    expect(saveMutation).toHaveBeenLastCalledWith(
      expect.objectContaining({ questionId: "q-new", customText: "What is your favorite late-night snack?" }),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
