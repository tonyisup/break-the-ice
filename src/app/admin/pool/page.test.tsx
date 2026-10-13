import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import PoolPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useAction: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    admin: {
      questions: {
        getPoolStats: "getPoolStats",
        getPoolQuestions: "getPoolQuestions",
        triggerPoolGeneration: "triggerPoolGeneration",
        triggerPoolAssignment: "triggerPoolAssignment",
        deleteQuestion: "deleteQuestion",
        updateQuestion: "updateQuestion",
        remixQuestion: "remixQuestion",
      },
    },
  },
}));

const TODAY = "2026-10-13";
const YESTERDAY = "2026-10-12";

const stats = (availableQuestions: number, awaitingReviewQuestions: number, distributedQuestions = 0) => ({
  totalQuestions: availableQuestions + awaitingReviewQuestions + distributedQuestions,
  availableQuestions,
  awaitingReviewQuestions,
  distributedQuestions,
  byStyleTone: [],
});
const question = (id: string, text: string, poolStatus: "available" | "distributed", awaitingReview: boolean) => ({
  _id: id,
  _creationTime: 1,
  text,
  poolStatus,
  awaitingReview,
});

describe("admin pool: questions wait for review before they are handed out", () => {
  const triggerGeneration = vi.fn();
  const triggerAssignment = vi.fn();
  /** What each date's pool looks like. A date not named here has an empty pool. */
  let pools: Record<string, { stats: ReturnType<typeof stats>; questions: Array<ReturnType<typeof question>> }>;

  beforeEach(() => {
    vi.clearAllMocks();
    // The page reads today's date, and only the Date is faked so waitFor still runs.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    // The target-count slider measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    pools = {};
    vi.mocked(useQuery).mockImplementation(((name: string, args: { poolDate: string }) => {
      const pool = pools[args.poolDate] ?? { stats: stats(0, 0), questions: [] };
      return name === "getPoolStats" ? pool.stats : pool.questions;
    }) as never);
    vi.mocked(useAction).mockImplementation(((name: string) =>
      name === "triggerPoolGeneration" ? triggerGeneration : name === "triggerPoolAssignment" ? triggerAssignment : vi.fn()) as never);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const assignButton = () => screen.getByRole("button", { name: "Assign to Users" });
  const generateButton = () => screen.getByRole("button", { name: "Generate Pool" });
  const goBackOneDay = () => fireEvent.click(document.querySelector(".lucide-chevron-left")!.closest("button")!);
  const badgeOf = (text: string) => {
    const row = screen.getByText(text).closest("div.flex.items-start") as HTMLElement;
    return within(row).getByText(/^(In review|Available|Distributed)$/).textContent;
  };

  it("counts the questions in review beside the ones ready to assign, and marks each row", () => {
    pools[TODAY] = {
      stats: stats(1, 2, 1),
      questions: [
        question("q1", "What song is stuck in your head?", "available", true),
        question("q2", "Which smell takes you back to childhood?", "available", false),
        question("q3", "What chore do you secretly enjoy?", "distributed", false),
      ],
    };

    render(<PoolPage />);

    expect(screen.getByText("Ready for assignment · 2 waiting for review")).toBeInTheDocument();
    expect(badgeOf("What song is stuck in your head?")).toBe("In review");
    expect(badgeOf("Which smell takes you back to childhood?")).toBe("Available");
    expect(badgeOf("What chore do you secretly enjoy?")).toBe("Distributed");
    expect(assignButton()).toBeEnabled();
  });

  it("says nothing about review when no question is waiting, and can't assign a pool with nothing approved", () => {
    pools[TODAY] = { stats: stats(0, 0, 3), questions: [] };
    const { unmount } = render(<PoolPage />);
    expect(screen.getByText("Ready for assignment")).toBeInTheDocument();
    expect(assignButton()).toBeDisabled();
    unmount();

    pools[TODAY] = { stats: stats(0, 3), questions: [] };
    render(<PoolPage />);
    expect(screen.getByText("Ready for assignment · 3 waiting for review")).toBeInTheDocument();
    expect(assignButton()).toBeDisabled();
  });

  it("tells the admin a new pool waits for review", async () => {
    triggerGeneration.mockResolvedValue({ questionsGenerated: 3, combinationsProcessed: 1, errors: [] });
    render(<PoolPage />);

    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Generated 3 questions across 1 style/tone combinations. They wait for review before they can be assigned.",
      ),
    );
  });

  it("assigns the pool for the date on screen, so one approved a day late can still be handed out", async () => {
    pools[YESTERDAY] = { stats: stats(1, 2), questions: [question("q1", "What song is stuck in your head?", "available", false)] };
    triggerAssignment.mockResolvedValue({ usersProcessed: 4, totalAssigned: 1, errors: [] });
    render(<PoolPage />);
    // Today's pool is empty, so there is nothing to assign yet.
    expect(assignButton()).toBeDisabled();

    goBackOneDay();

    expect(screen.getByText("Ready for assignment · 2 waiting for review")).toBeInTheDocument();
    // A new pool is only written for today. An earlier day's approved questions can be assigned.
    expect(generateButton()).toBeDisabled();
    expect(assignButton()).toBeEnabled();
    fireEvent.click(assignButton());

    await waitFor(() => expect(triggerAssignment).toHaveBeenCalledWith({ poolDate: YESTERDAY }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Assigned 1 questions to 4 users"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
