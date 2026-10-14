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

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
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
/** A pool row. Unless told otherwise, one that isn't waiting or handed out is approved. */
const question = (
  id: string,
  text: string,
  poolStatus: "available" | "distributed",
  awaitingReview: boolean,
  readyToAssign = poolStatus === "available" && !awaitingReview,
) => ({
  _id: id,
  _creationTime: 1,
  text,
  poolStatus,
  awaitingReview,
  readyToAssign,
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
  const rowOf = (text: string) => screen.getByText(text).closest("div.flex.items-start") as HTMLElement;
  const badgeElementOf = (text: string) =>
    within(rowOf(text)).getByText(/^(Waiting for review|Available|Not approved|Distributed)$/);
  const badgeOf = (text: string) => badgeElementOf(text).textContent;
  /** The line under the Available count. Its text includes the linked count of questions waiting. */
  const availableCaption = () => screen.getByText(/^Ready for assignment/);

  it("counts the questions waiting for review beside the ones ready to assign, and marks each row", () => {
    pools[TODAY] = {
      stats: stats(1, 2, 1),
      questions: [
        question("q1", "What song is stuck in your head?", "available", true),
        question("q2", "Which smell takes you back to childhood?", "available", false),
        question("q3", "What chore do you secretly enjoy?", "distributed", false),
      ],
    };

    render(<PoolPage />);

    expect(availableCaption().textContent).toBe("Ready for assignment · 2 waiting for review");
    // The count opens the Questions page, where the review queue is.
    expect(within(availableCaption()).getByRole("link", { name: "2 waiting for review" })).toHaveAttribute("href", "/admin/questions");
    expect(badgeOf("What song is stuck in your head?")).toBe("Waiting for review");
    expect(badgeOf("Which smell takes you back to childhood?")).toBe("Available");
    expect(badgeOf("What chore do you secretly enjoy?")).toBe("Distributed");
    // The page uses one term for a question in the review queue.
    expect(screen.queryByText(/in review/i)).toBeNull();
    expect(assignButton()).toBeEnabled();
  });

  it("shows a question waiting for review differently from an available one, with a link to review it", () => {
    pools[TODAY] = {
      stats: stats(1, 1),
      questions: [
        question("q1", "What song is stuck in your head?", "available", true),
        question("q2", "Which smell takes you back to childhood?", "available", false),
      ],
    };

    render(<PoolPage />);

    const waiting = badgeElementOf("What song is stuck in your head?");
    const available = badgeElementOf("Which smell takes you back to childhood?");
    expect(waiting.className).toMatch(/amber/);
    expect(available.className).not.toMatch(/amber/);
    expect(waiting.className).not.toBe(available.className);

    expect(within(rowOf("What song is stuck in your head?")).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/admin/questions/q1",
    );
    // Only a question in the queue has something to review.
    expect(within(rowOf("Which smell takes you back to childhood?")).queryByRole("link", { name: "Review" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Review" })).toHaveLength(1);
  });

  it("marks a question rejected or retired in review as not approved, not as available", () => {
    pools[TODAY] = {
      stats: stats(1, 0),
      questions: [
        question("q1", "What song is stuck in your head?", "available", false, false),
        question("q2", "Which smell takes you back to childhood?", "available", false),
      ],
    };

    render(<PoolPage />);

    expect(badgeOf("What song is stuck in your head?")).toBe("Not approved");
    expect(badgeOf("Which smell takes you back to childhood?")).toBe("Available");
    expect(badgeElementOf("What song is stuck in your head?").className).not.toBe(
      badgeElementOf("Which smell takes you back to childhood?").className,
    );
    // It isn't in the review queue any more, so there is nothing to review.
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("keeps a handed-out question marked distributed whatever its review fields say", () => {
    pools[TODAY] = {
      stats: stats(0, 0, 1),
      questions: [question("q1", "What chore do you secretly enjoy?", "distributed", false, false)],
    };

    render(<PoolPage />);

    expect(badgeOf("What chore do you secretly enjoy?")).toBe("Distributed");
  });

  it("calls the tab for questions not yet handed out Not distributed, so Available means one thing", () => {
    pools[TODAY] = { stats: stats(1, 1), questions: [question("q1", "What song is stuck in your head?", "available", true)] };
    render(<PoolPage />);

    expect(screen.queryByRole("button", { name: "Available" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not distributed" }));

    // It still asks for the same questions as before: every one not yet handed out.
    expect(useQuery).toHaveBeenCalledWith("getPoolQuestions", { poolDate: TODAY, status: "available", limit: 100 });
  });

  it("says nothing about review when no question is waiting, and can't assign a pool with nothing approved", () => {
    pools[TODAY] = { stats: stats(0, 0, 3), questions: [] };
    const { unmount } = render(<PoolPage />);
    expect(screen.getByText("Ready for assignment")).toBeInTheDocument();
    expect(availableCaption().textContent).toBe("Ready for assignment");
    expect(screen.queryByRole("link", { name: /waiting for review/ })).toBeNull();
    expect(assignButton()).toBeDisabled();
    unmount();

    pools[TODAY] = { stats: stats(0, 3), questions: [] };
    render(<PoolPage />);
    expect(availableCaption().textContent).toBe("Ready for assignment · 3 waiting for review");
    expect(screen.getByRole("link", { name: "3 waiting for review" })).toHaveAttribute("href", "/admin/questions");
    expect(assignButton()).toBeDisabled();
  });

  it("tells the admin where to approve a new pool before assigning it", async () => {
    triggerGeneration.mockResolvedValue({ questionsGenerated: 3, combinationsProcessed: 1, errors: [] });
    render(<PoolPage />);

    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Generated 3 questions across 1 style/tone combinations. Approve them under Pending Review on the Questions page before assigning.",
      ),
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("doesn't send the admin to approve anything when a pool run wrote no questions", async () => {
    triggerGeneration.mockResolvedValue({ questionsGenerated: 0, combinationsProcessed: 2, errors: [] });
    render(<PoolPage />);

    fireEvent.click(generateButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Generated 0 questions across 2 style/tone combinations."),
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("assigns the pool for the date on screen, so one approved a day late can still be handed out", async () => {
    pools[YESTERDAY] = { stats: stats(1, 2), questions: [question("q1", "What song is stuck in your head?", "available", false)] };
    triggerAssignment.mockResolvedValue({ usersProcessed: 4, totalAssigned: 1, errors: [] });
    render(<PoolPage />);
    // Today's pool is empty, so there is nothing to assign yet.
    expect(assignButton()).toBeDisabled();

    goBackOneDay();

    expect(availableCaption().textContent).toBe("Ready for assignment · 2 waiting for review");
    // A new pool is only written for today. An earlier day's approved questions can be assigned.
    expect(generateButton()).toBeDisabled();
    expect(assignButton()).toBeEnabled();
    fireEvent.click(assignButton());

    await waitFor(() => expect(triggerAssignment).toHaveBeenCalledWith({ poolDate: YESTERDAY }));
    // The message names the pool, since it isn't always today's.
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Assigned 1 questions from the 2026-10-12 pool to 4 users"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
