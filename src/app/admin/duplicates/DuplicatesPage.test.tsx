import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import DuplicatesPage from "./page";

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
  (useMutation as any).mockImplementation((ref: any) =>
    getFunctionName(ref).endsWith(":deleteDuplicateQuestions")
      ? resolve
      : vi.fn(),
  );
  (useAction as any).mockReturnValue(vi.fn());
  resolve.mockResolvedValue(null);
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
