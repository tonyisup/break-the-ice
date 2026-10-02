import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { RemixQuestionDrawer } from "./remix-question-drawer";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TAG_LENGTH, MAX_QUESTION_TAGS } from "../../../convex/constants";
import { api } from "../../../convex/_generated/api";

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

// vaul needs layout APIs jsdom lacks; an open drawer is just its content here. A closed drawer
// stays mounted but hidden, and its content's animation end is where the drawer resets.
vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Drawer = ({ open, children }: { open: boolean; children?: ReactNode }) => <div hidden={!open}>{children}</div>;
  const DrawerContent = ({ children, onAnimationEnd }: { children?: ReactNode; onAnimationEnd?: () => void }) => (
    <div data-testid="drawer-content" onAnimationEnd={onAnimationEnd}>
      {children}
    </div>
  );
  return {
    Drawer,
    DrawerContent,
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
  const drawer = (isOpen: boolean) => (
    <RemixQuestionDrawer
      question={question}
      styleId={"s1" as never}
      toneId={"t1" as never}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  );
  const { rerender, unmount } = render(drawer(true));
  return { onOpenChange, close: () => rerender(drawer(false)), unmount };
}

// A promise the test settles by hand, to finish a request after the person has cancelled it.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Lets every pending promise and timer settle, so a check that nothing happened isn't made too early.
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

type MutationRef = Parameters<typeof getFunctionName>[0];

// Separate mocks per mutation, for tests that need to tell a create from an update or delete.
// A mutation the drawer calls without a mock here fails the test instead of passing silently.
// An override replaces the returned handle too, so assertions always see what the drawer calls.
function mockMutations(overrides: { remove?: (args: unknown) => unknown } = {}) {
  const mutations = {
    add: vi.fn(),
    update: vi.fn().mockResolvedValue(null),
    remove: (overrides.remove ?? vi.fn().mockResolvedValue(null)) as ReturnType<typeof vi.fn>,
  };
  const byName: Record<string, unknown> = {
    [getFunctionName(api.core.questions.addPersonalQuestion)]: mutations.add,
    [getFunctionName(api.core.questions.updatePersonalQuestion)]: mutations.update,
    [getFunctionName(api.core.questions.deletePersonalQuestion)]: mutations.remove,
  };
  (useMutation as ReturnType<typeof vi.fn>).mockImplementation((ref: MutationRef) => {
    const name = getFunctionName(ref);
    return (
      byName[name] ??
      (() => {
        throw new Error(`Unmocked mutation ${name}`);
      })
    );
  });
  return mutations;
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

describe("RemixQuestionDrawer cancel remix", () => {
  it("saves nothing when the person cancels a remix and closes the drawer", async () => {
    const mutations = mockMutations();
    const remix = deferred<string>();
    const { close } = renderDrawer(vi.fn().mockReturnValue(remix.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    close();
    remix.resolve("A remix the person cancelled?");
    await flush();

    expect(mutations.add).not.toHaveBeenCalled();
    expect(mutations.update).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not let a cancelled remix save or finish the next remix's spinner", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    const cancelled = deferred<string>();
    const current = deferred<string>();
    renderDrawer(vi.fn().mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(current.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    cancelled.resolve("A remix the person cancelled?");
    await flush();
    expect(screen.getByRole("button", { name: "Remixing…" })).toBeDisabled();
    expect(screen.queryByText("A remix the person cancelled?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(mutations.add).not.toHaveBeenCalled();

    current.resolve("What is your favorite late-night snack?");
    expect(await screen.findByText("What is your favorite late-night snack?")).toBeInTheDocument();
    expect(mutations.add).toHaveBeenCalledTimes(1);
    expect(mutations.add).toHaveBeenCalledWith(
      expect.objectContaining({ customText: "What is your favorite late-night snack?" }),
    );
    expect(mutations.update).not.toHaveBeenCalled();
  });

  it("deletes the question when the cancel lands while it is being created", async () => {
    const mutations = mockMutations();
    const created = deferred<string>();
    mutations.add.mockReturnValue(created.promise);
    renderDrawer(vi.fn().mockResolvedValue("A remix the person cancelled?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    created.resolve("q-cancelled");

    await waitFor(() => {
      expect(mutations.remove).toHaveBeenCalledWith({ questionId: "q-cancelled" });
    });
    expect(screen.queryByText("A remix the person cancelled?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
  });

  it("goes back to the saved remix when the person cancels Remix Again", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    const cancelled = deferred<string>();
    renderDrawer(
      vi
        .fn()
        .mockResolvedValueOnce("What is your favorite late-night snack?")
        .mockReturnValueOnce(cancelled.promise),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remix Again" }));
    expect(screen.queryByRole("button", { name: "Cancel Remix" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep Previous Remix" }));
    cancelled.resolve("A remix the person cancelled?");
    await cancelled.promise;

    expect(await screen.findByText("What is your favorite late-night snack?")).toBeInTheDocument();
    expect(screen.queryByText("A remix the person cancelled?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    expect(mutations.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mutations.update).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: "q-new", customText: "What is your favorite late-night snack?" }),
      );
    });
  });
});

describe("RemixQuestionDrawer cancel remix edge cases", () => {
  it("shows no error when a cancelled remix fails afterwards", async () => {
    const mutations = mockMutations();
    const remix = deferred<string>();
    renderDrawer(vi.fn().mockReturnValue(remix.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    remix.reject(new Error("AI timed out."));
    await flush();

    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remix" })).toHaveFocus();
    expect(toast.error).not.toHaveBeenCalled();
    expect(mutations.add).not.toHaveBeenCalled();
  });

  it("does not let a cancelled remix's failure stop the next remix's spinner", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    const cancelled = deferred<string>();
    const current = deferred<string>();
    renderDrawer(vi.fn().mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(current.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    cancelled.reject(new Error("AI timed out."));
    await flush();

    expect(screen.getByRole("button", { name: "Remixing…" })).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remix" })).not.toBeInTheDocument();

    current.resolve("What is your favorite late-night snack?");
    expect(await screen.findByText("What is your favorite late-night snack?")).toBeInTheDocument();
    expect(mutations.add).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved remix when the cancel lands while Remix Again is updating it", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    const updating = deferred<null>();
    mutations.update.mockReturnValueOnce(updating.promise).mockResolvedValue(null);
    renderDrawer(
      vi
        .fn()
        .mockResolvedValueOnce("What is your favorite late-night snack?")
        .mockResolvedValueOnce("A remix the person cancelled?"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remix Again" }));
    await waitFor(() => {
      expect(mutations.update).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: "q-new", customText: "A remix the person cancelled?" }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep Previous Remix" }));
    updating.resolve(null);
    await updating.promise;

    expect(await screen.findByText("What is your favorite late-night snack?")).toBeInTheDocument();
    expect(screen.queryByText("A remix the person cancelled?")).not.toBeInTheDocument();
    expect(mutations.add).toHaveBeenCalledTimes(1);
    expect(mutations.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mutations.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ questionId: "q-new", customText: "What is your favorite late-night snack?" }),
      );
    });
  });

  it("deletes nothing when a cancelled create returns no question", async () => {
    const mutations = mockMutations();
    const created = deferred<string | null>();
    mutations.add.mockReturnValue(created.promise);
    renderDrawer(vi.fn().mockResolvedValue("A remix the person cancelled?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    created.resolve(null);
    await flush();

    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
    expect(mutations.remove).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stays quiet when deleting a cancelled remix's question fails", async () => {
    // A vi.fn attaches its own handler to every promise it returns, which would hide a missing
    // catch, so the delete here is a plain function whose failed promise records its handlers.
    const deleteCalls: unknown[] = [];
    let rejectionHandled = false;
    const failingDelete = (args: unknown) => {
      deleteCalls.push(args);
      const failed = Promise.reject(new Error("Network down."));
      const then = failed.then.bind(failed);
      failed.then = ((onFulfilled, onRejected) => {
        if (typeof onRejected === "function") rejectionHandled = true;
        return then(onFulfilled, onRejected);
      }) as typeof failed.then;
      return failed;
    };
    const mutations = mockMutations({ remove: failingDelete });
    const created = deferred<string>();
    mutations.add.mockReturnValue(created.promise);
    renderDrawer(vi.fn().mockResolvedValue("A remix the person cancelled?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    created.resolve("q-cancelled");

    await waitFor(() => {
      expect(deleteCalls).toEqual([{ questionId: "q-cancelled" }]);
    });
    expect(rejectionHandled).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
  });

  it("saves nothing from a remix still running when the drawer unmounts", async () => {
    const mutations = mockMutations();
    const remix = deferred<string>();
    const { unmount } = renderDrawer(vi.fn().mockReturnValue(remix.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    unmount();
    remix.resolve("A remix from an unmounted drawer?");
    await flush();

    expect(mutations.add).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("deletes the question when the drawer unmounts while it is being created", async () => {
    const mutations = mockMutations();
    const created = deferred<string>();
    mutations.add.mockReturnValue(created.promise);
    const { unmount } = renderDrawer(vi.fn().mockResolvedValue("A remix from an unmounted drawer?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalled();
    });
    unmount();
    created.resolve("q-unmounted");
    await flush();

    expect(mutations.remove).toHaveBeenCalledWith({ questionId: "q-unmounted" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows no error when a cancelled remix's create fails afterwards", async () => {
    const mutations = mockMutations();
    const created = deferred<string>();
    mutations.add.mockReturnValue(created.promise);
    renderDrawer(vi.fn().mockResolvedValue("A remix the person cancelled?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));
    created.reject(new Error("Network down."));
    await flush();

    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(mutations.remove).not.toHaveBeenCalled();
  });

  it("saves nothing from a remix still running when the drawer finishes closing", async () => {
    const mutations = mockMutations();
    const remix = deferred<string>();
    const { close } = renderDrawer(vi.fn().mockReturnValue(remix.promise));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    close();
    fireEvent.animationEnd(screen.getByTestId("drawer-content"));
    remix.resolve("A remix from a closed drawer?");
    await flush();

    expect(mutations.add).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("moves focus to Cancel when the cancelled remix used the last AI credit", async () => {
    mockMutations();
    const remix = deferred<string>();
    renderDrawer(vi.fn().mockReturnValue(remix.promise));
    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    // The cancelled run counted toward the limit, so the live user query now reports it reached.
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((ref: MutationRef) =>
      getFunctionName(ref) === getFunctionName(api.core.users.getCurrentUser) ? { isAiLimitReached: true } : undefined,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel Remix" }));

    expect(screen.getByRole("button", { name: "Remix" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});

describe("RemixQuestionDrawer tags", () => {
  const tagNames = Array.from({ length: MAX_QUESTION_TAGS + 1 }, (_, i) => `t${String(i).padStart(2, "0")}`);

  it("stops at the tag limit the server checks, and caps the tag input's length", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((ref: MutationRef) =>
      getFunctionName(ref) === getFunctionName(api.core.tags.getTags)
        ? tagNames.map((name) => ({ _id: name, name, grouping: "test" }))
        : undefined,
    );
    renderDrawer(vi.fn().mockResolvedValue("What is your favorite late-night snack?"));
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("maxLength", String(MAX_QUESTION_TAG_LENGTH));

    for (const name of tagNames) {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY);
    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalledWith(
        expect.objectContaining({ tags: tagNames.slice(0, MAX_QUESTION_TAGS) }),
      );
    });
  });

  it("lets the person re-pick a tag they already have at the limit without an error", async () => {
    const mutations = mockMutations();
    mutations.add.mockResolvedValue("q-new");
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((ref: MutationRef) =>
      getFunctionName(ref) === getFunctionName(api.core.tags.getTags)
        ? tagNames.map((name) => ({ _id: name, name, grouping: "test" }))
        : undefined,
    );
    renderDrawer(vi.fn().mockResolvedValue("What is your favorite late-night snack?"));
    const input = screen.getByRole("textbox");

    for (const name of tagNames.slice(0, MAX_QUESTION_TAGS)) {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.change(input, { target: { value: tagNames[0].toUpperCase() } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(toast.error).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Remix" }));
    await waitFor(() => {
      expect(mutations.add).toHaveBeenCalledWith(
        expect.objectContaining({ tags: tagNames.slice(0, MAX_QUESTION_TAGS) }),
      );
    });
  });

  it("shows the server's readable message when it refuses the remix's tags", async () => {
    const mutations = mockMutations();
    mutations.add.mockRejectedValue(
      new ConvexError({ code: ERROR_CODES.QUESTION_TAGS_TOO_MANY, message: ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY }),
    );
    renderDrawer(vi.fn().mockResolvedValue("What is your favorite late-night snack?"));

    fireEvent.click(screen.getByRole("button", { name: "Remix" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`Remix failed: ${ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY}`);
    });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remix" })).toBeEnabled();
  });
});
