import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import DuplicatesPage from "./page";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));
const taxonomy = { _id: "style1", icon: "Heart", color: "blue", name: "Warm" };
const groups = [1, 2].map((group) => ({
  _id: `group${group}`,
  reason: "Similar invitations",
  confidence: 0.98,
  questionIds: [`q${group}a`, `q${group}b`],
  questions: ["a", "b"].map((letter) => ({
    _id: `q${group}${letter}`,
    _creationTime: 1,
    text: `Question ${group}${letter}`,
    style: taxonomy,
    tone: taxonomy,
    reviewRevision: 2,
    totalLikes: 0,
    totalShows: 0,
  })),
}));
const resolve = vi.fn();
const reject = vi.fn();
const edit = vi.fn();

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.resetAllMocks();
  (useQuery as any).mockImplementation((ref: any) => {
    const name = getFunctionName(ref);
    if (name.endsWith(":getPendingDuplicateDetections")) return groups;
    if (name.endsWith(":getReviewHistory")) return [];
    return null;
  });
  (useMutation as any).mockImplementation((ref: any) => {
    const name = getFunctionName(ref);
    if (name.endsWith(":deleteDuplicateQuestions")) return resolve;
    if (name.endsWith(":updateDuplicateDetectionStatus")) return reject;
    if (name.endsWith(":updateQuestion")) return edit;
    return vi.fn();
  });
  (useAction as any).mockReturnValue(vi.fn());
  resolve.mockResolvedValue(null);
  reject.mockResolvedValue(null);
  edit.mockResolvedValue(null);
});

it("keeps selection inside its own group and sends only that group's members", async () => {
  render(<DuplicatesPage />);
  const reasons = screen.getAllByLabelText("Review reason");
  for (const reason of reasons)
    fireEvent.change(reason, {
      target: { value: "Same invitation; keep the clearer wording." },
    });
  fireEvent.click(screen.getByRole("radio", { name: "Keep Question 1a" }));
  const buttons = screen.getAllByRole("button", { name: "Resolve duplicates" });
  expect(buttons[0]).toBeEnabled();
  expect(buttons[1]).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Keep Question 2b" }));
  expect(buttons[0]).toBeDisabled();
  expect(buttons[1]).toBeEnabled();
  fireEvent.click(buttons[1]);
  await waitFor(() =>
    expect(resolve).toHaveBeenCalledWith({
      detectionId: "group2",
      keepQuestionId: "q2b",
      questionIdsToDelete: ["q2a"],
      reason: "Same invitation; keep the clearer wording.",
      expectedRevisions: [
        { questionId: "q2a", revision: 2 },
        { questionId: "q2b", revision: 2 },
      ],
    }),
  );
  expect(
    screen.queryByRole("button", { name: "Delete All" }),
  ).not.toBeInTheDocument();
});

it("requires a reason even after selecting the retained question", () => {
  render(<DuplicatesPage />);
  fireEvent.click(screen.getByRole("radio", { name: "Keep Question 1a" }));
  expect(
    screen.getAllByRole("button", { name: "Resolve duplicates" })[0],
  ).toBeDisabled();
});

it.each([
  ["resolve", "Resolve duplicates", resolve],
  ["reject", "Reject detection", reject],
] as const)(
  "recovers controls and reports a failed %s mutation",
  async (operation, buttonName, mutation) => {
    let fail!: (error: Error) => void;
    mutation.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        fail = rejectPromise;
      }),
    );
    render(<DuplicatesPage />);
    const reason = screen.getAllByLabelText("Review reason")[0];
    fireEvent.change(reason, {
      target: { value: "These invite the same answer." },
    });
    const radio = screen.getByRole("radio", { name: "Keep Question 1a" });
    fireEvent.click(radio);
    const button = screen.getAllByRole("button", { name: buttonName })[0];
    fireEvent.click(button);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(radio).toBeDisabled();
    expect(reason).toBeDisabled();
    await act(async () => {
      fail(new Error(`${operation} unavailable`));
    });
    expect(toast.error).toHaveBeenCalledWith(`${operation} unavailable`);
    expect(button).toBeEnabled();
    expect(radio).toBeEnabled();
    expect(reason).toBeEnabled();
    expect(
      screen.getAllByRole("button", { name: "Resolve duplicates" })[0],
    ).toBeEnabled();
    expect(
      screen.getAllByRole("button", { name: "Reject detection" })[0],
    ).toBeEnabled();
  },
);

it("keeps a failed edit open and restores Save and Discard controls", async () => {
  let fail!: (error: Error) => void;
  edit.mockReturnValue(
    new Promise((_resolve, rejectPromise) => {
      fail = rejectPromise;
    }),
  );
  render(<DuplicatesPage />);
  fireEvent.change(screen.getAllByLabelText("Review reason")[0], {
    target: { value: "Clarify the question." },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Edit question" })[0]);
  const draft = screen.getByLabelText("Edit duplicate question");
  fireEvent.change(draft, { target: { value: "A clearer question?" } });
  const save = screen.getByRole("button", { name: "Save edit" });
  const discard = screen.getByRole("button", { name: "Discard edit" });
  fireEvent.click(save);
  expect(edit).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "A clearer question?",
      expectedRevision: 2,
      reviewReason: "Clarify the question.",
    }),
  );
  expect(save).toBeDisabled();
  expect(discard).toBeDisabled();
  expect(draft).toBeDisabled();
  await act(async () => {
    fail(new Error("Edit unavailable"));
  });
  expect(toast.error).toHaveBeenCalledWith("Edit unavailable");
  expect(screen.getByLabelText("Edit duplicate question")).toHaveValue(
    "A clearer question?",
  );
  expect(save).toBeEnabled();
  expect(discard).toBeEnabled();
  expect(draft).toBeEnabled();
});
