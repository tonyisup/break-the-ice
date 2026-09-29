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
  render(
    <RemixQuestionDrawer
      question={question}
      styleId={"s1" as never}
      toneId={"t1" as never}
      isOpen
      onOpenChange={vi.fn()}
    />,
  );
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
