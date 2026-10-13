import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgWeeklyCurationPage from "./page";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { ERROR_CODES, ERROR_MESSAGES } from "../../../../convex/constants";

const workspaceState = vi.hoisted(() => ({ activeWorkspace: "org-1" }));

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  CreateOrganization: () => null,
  useAuth: () => ({ isSignedIn: true, isLoaded: true, orgId: "clerk-org" }),
  useOrganization: () => ({ isLoaded: true, organization: { name: "Studio" } }),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    activeWorkspace: workspaceState.activeWorkspace,
    setActiveWorkspace: vi.fn(),
    workspaceHydrated: true,
  }),
}));

vi.mock("@/components/header/TeamWorkspaceMenu", () => ({ TeamWorkspaceMenu: () => null }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("react-router-dom", () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    core: {
      users: { store: "storeUser", getCurrentUser: "getCurrentUser" },
      schedules: { listSchedulesForUser: "listSchedulesForUser", listSchedules: "listSchedules", getSchedule: "getSchedule", createSchedule: "createSchedule", assignQuestion: "assignQuestion", unassignQuestion: "unassignQuestion", publishSchedule: "publishSchedule", autoSchedule: "autoSchedule" },
      organizations: { getOrganizations: "getOrganizations" },
      orgSettings: { getOrgSettings: "getOrgSettings", upsertOrgSettings: "upsertOrgSettings", setDeliveryDayActive: "setDeliveryDayActive" },
      coachFeedback: { getCurationPreview: "getCurationPreview" },
      questions: { getPublicQuestions: "getPublicQuestions" },
      styles: { getStyles: "getStyles" }, tones: { getTones: "getTones" }, topics: { getTopics: "getTopics" },
      billing: {
        getEffectiveEntitlements: "getEffectiveEntitlements",
        syncOrganizationFromClerk: "syncOrganizationFromClerk",
      },
      billingSyncAction: { syncOrganizationViaClerkApi: "syncOrganizationViaClerkApi" },
      fillMatrix: { fillEmptyCells: "fillEmptyCells", fillSingleCell: "fillSingleCell" },
      teamPromptActions: { previewTopicQuestions: "previewTopicQuestions" },
      teamPrompts: { createAndAssign: "createAndAssignTeamPrompt" },
    },
  },
}));

const setDeliveryDayActive = vi.fn().mockResolvedValue(undefined);
const createSchedule = vi.fn().mockResolvedValue("schedule-new");
const assignQuestion = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  workspaceState.activeWorkspace = "org-1";
  (useMutation as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
    if (fn === "setDeliveryDayActive") return setDeliveryDayActive;
    if (fn === "createSchedule") return createSchedule;
    if (fn === "assignQuestion") return assignQuestion;
    return vi.fn().mockResolvedValue(undefined);
  });
  (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn().mockResolvedValue(undefined));
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
    if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
    if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
    if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
    if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
    if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
    if (fn === "getCurationPreview") return { totalResponses: 3, coachCount: 3, confidence: "directional", recommendations: [{ questionId: "q-preview", text: "Calm conversation starter", score: 1, reasons: [{ dimension: "tone", value: "calm", score: 1, responses: 3, landedWell: 1, fellFlat: 0, wrongVibe: 2, timingOff: 0, isMixed: true, coachCount: 3 }] }] };
    if (fn === "getPublicQuestions" || fn === "getStyles" || fn === "getTones" || fn === "getTopics") return [];
    return undefined;
  });
});

describe("OrgWeeklyCurationPage delivery-day controls", () => {
  it("persists an explicit active state when an administrator changes a delivery day", async () => {
    render(<OrgWeeklyCurationPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Deliver on Tuesday" }));

    await waitFor(() => {
      expect(setDeliveryDayActive).toHaveBeenCalledWith({ organizationId: "org-1", day: "tuesday", active: true });
    });
  });

  it("turns directional feedback into a concise scheduling action", async () => {
    render(<OrgWeeklyCurationPage />);

    const previewHeading = screen.getByRole("heading", { name: "What your feedback suggests" });
    expect(previewHeading).toBeInTheDocument();
    expect(screen.getByText("Try one suggestion this week")).toBeInTheDocument();
    expect(screen.getByText("3 responses")).toBeInTheDocument();
    expect(screen.getByText("3 coaches")).toBeInTheDocument();
    expect(screen.getByText("Calm conversation starter")).toBeInTheDocument();
    expect(screen.getByText("Tone · Calm")).toBeInTheDocument();
    expect(screen.getByText("Mixed signal: 1 landed well, 2 caution signals.")).toBeInTheDocument();
    expect(screen.queryByText(/tone: calm · 3 responses/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to week" }));
    fireEvent.click(await screen.findByRole("button", { name: "Monday" }));

    await waitFor(() => {
      expect(createSchedule).toHaveBeenCalledWith({
        organizationId: "org-1",
        weekStart: expect.any(String),
        weekStartDay: "monday",
      });
      expect(assignQuestion).toHaveBeenCalledWith({
        scheduleId: "schedule-new",
        dayOfWeek: "monday",
        questionId: "q-preview",
      });
    });
  });

  it("explains how to strengthen insufficient evidence and hides extra suggestions", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
      if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
      if (fn === "getCurationPreview") {
        return {
          totalResponses: 2,
          coachCount: 1,
          confidence: "insufficient",
          recommendations: ["One", "Two", "Three", "Four"].map((text, index) => ({
            questionId: `q-${index}`,
            text: `${text} suggestion`,
            score: 1,
            reasons: [{ dimension: "style", value: "rapid-fire-either", score: 1, responses: 1, landedWell: 1, fellFlat: 0, wrongVibe: 0, timingOff: 0, isMixed: false, coachCount: 1 }],
          })),
        };
      }
      if (fn === "getPublicQuestions" || fn === "getStyles" || fn === "getTones" || fn === "getTopics") return [];
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    expect(screen.getByText("Collect more feedback before optimizing")).toBeInTheDocument();
    expect(screen.getByText("Reach at least 3 responses from 2 coaches before treating these patterns as directional.")).toBeInTheDocument();
    expect(screen.getByText("One suggestion")).toBeInTheDocument();
    expect(screen.queryByText("Four suggestion")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(screen.getByText("Four suggestion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("disables delivery-day controls until organization settings are loaded", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
      if (fn === "getOrgSettings") return undefined;
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
      if (fn === "getCurationPreview") return { totalResponses: 3, coachCount: 3, confidence: "directional", recommendations: [{ questionId: "q-preview", text: "Calm conversation starter", score: 1, reasons: [{ dimension: "tone", value: "calm", score: 1, responses: 3, landedWell: 1, fellFlat: 0, wrongVibe: 2, timingOff: 0, isMixed: true, coachCount: 3 }] }] };
    if (fn === "getPublicQuestions" || fn === "getStyles" || fn === "getTones" || fn === "getTopics") return [];
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    expect(screen.getByRole("checkbox", { name: "Deliver on Monday" })).toBeDisabled();
  });

  it("opens full matrix questions in a navigable sheet and assigns from the detail view", async () => {
    const firstQuestion = "What are the top three songs you would want on a road trip playlist that say this is exactly who we are?";
    const secondQuestion = "If you could only keep three songs for the rest of your life on a desert island, which ones would make the cut?";

    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
      if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
      if (fn === "getCurationPreview") return { totalResponses: 0, coachCount: 0, confidence: "insufficient", recommendations: [] };
      if (fn === "getStyles") {
        return [{ id: "rapid-fire-either", slug: "rapid-fire-either", name: "Rapid fire", icon: "zap", color: "#888888" }];
      }
      if (fn === "getTones") {
        return [
          { id: "cozy", slug: "cozy", name: "Cozy", icon: "heart", color: "#888888" },
          { id: "bold", slug: "bold", name: "Bold", icon: "flame", color: "#888888" },
        ];
      }
      if (fn === "getTopics") return [];
      if (fn === "getPublicQuestions") {
        return [
          { _id: "q-cozy", text: firstQuestion, style: "rapid-fire-either", tone: "cozy", topic: "music", isAIGenerated: false },
          {
            _id: "q-bold",
            text: secondQuestion,
            style: "rapid-fire-either",
            tone: "bold",
            topic: "music",
            isAIGenerated: true,
            claudeFlag: { reasons: ["awkward_wording"], safety: [], note: "Stiff phrasing." },
          },
        ];
      }
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    // Only the question the quality check would hold is marked on the grid.
    expect(screen.getAllByText("Flagged")).toHaveLength(1);
    // The mark is in the button's name too, for someone who can't see the chip.
    expect(screen.getByRole("button", { name: `View full question: ${secondQuestion}, flagged by AI review` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("button", { name: `View full question: ${firstQuestion}` }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Question details" })).toBeInTheDocument();
    expect(within(dialog).getByText(firstQuestion)).toBeInTheDocument();
    expect(within(dialog).queryByText("Flagged by AI review")).toBeNull();
    expect(within(dialog).getByText("Rapid Fire Either")).toBeInTheDocument();
    expect(within(dialog).getByText("Cozy")).toBeInTheDocument();
    expect(within(dialog).getByText("Music")).toBeInTheDocument();
    expect(within(dialog).getByText("1 of 2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next question" }));
    expect(within(dialog).getByText(secondQuestion)).toBeInTheDocument();
    expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("AI generated")).toBeInTheDocument();
    // Its details say why it was flagged, for the manager to judge.
    expect(within(dialog).getByText("Flagged by AI review")).toBeInTheDocument();
    expect(within(dialog).getByText("Awkward wording")).toBeInTheDocument();
    expect(within(dialog).getByText("Stiff phrasing.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Assign to Monday" }));

    await waitFor(() => {
      expect(assignQuestion).toHaveBeenCalledWith({
        scheduleId: "schedule-new",
        dayOfWeek: "monday",
        questionId: "q-bold",
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not expose scheduler assignment controls to ordinary Team members", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
      if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "member" };
      if (fn === "getCurationPreview") return { totalResponses: 0, coachCount: 0, confidence: "insufficient", recommendations: [] };
      if (fn === "getPublicQuestions" || fn === "getStyles" || fn === "getTones" || fn === "getTopics") return [];
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
  });

  it("shows an upgrade gate without loading protected workspace data on Free", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: false };
      if (fn === "listSchedulesForUser") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "free", organizationRole: "manager" };
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    expect(screen.getByRole("heading", {
      name: "Weekly curation is a Team feature",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Team" })).toHaveAttribute(
      "href",
      "/pricing?source=schedule_gate",
    );
    expect(useQuery).toHaveBeenCalledWith("listSchedules", "skip");
    expect(useQuery).toHaveBeenCalledWith("getOrgSettings", "skip");
    expect(useQuery).toHaveBeenCalledWith("getStyles", "skip");
    expect(useQuery).toHaveBeenCalledWith("getTones", "skip");
    expect(useQuery).toHaveBeenCalledWith("getTopics", "skip");
  });

  it("closes a custom-prompt draft when the workspace changes", async () => {
    const { rerender } = render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Write" }));

    const questionInput = screen.getByPlaceholderText(
      "What is one assumption about our launch plan that we should challenge?",
    );
    fireEvent.change(questionInput, { target: { value: "Org one draft" } });
    expect(questionInput).toHaveValue("Org one draft");

    workspaceState.activeWorkspace = "org-2";
    rerender(<OrgWeeklyCurationPage />);

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(
          "What is one assumption about our launch plan that we should challenge?",
        ),
      ).not.toBeInTheDocument();
    });
  });
});

/** A grid of one style and two tones: the cozy cell lists a question, the bold cell is empty. */
function matrixWithOneEmptyCell() {
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
    if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
    if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
    if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
    if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
    if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
    if (fn === "getCurationPreview") return { totalResponses: 0, coachCount: 0, confidence: "insufficient", recommendations: [] };
    if (fn === "getStyles") return [{ id: "rapid-fire-either", slug: "rapid-fire-either", name: "Rapid fire", icon: "zap", color: "#888888" }];
    if (fn === "getTones") {
      return [
        { id: "cozy", slug: "cozy", name: "Cozy", icon: "heart", color: "#888888" },
        { id: "bold", slug: "bold", name: "Bold", icon: "flame", color: "#888888" },
      ];
    }
    if (fn === "getTopics") return [];
    if (fn === "getPublicQuestions") {
      return [{ _id: "q-cozy", text: "A cozy question?", style: "rapid-fire-either", tone: "cozy", topic: "music" }];
    }
    return undefined;
  });
}

describe("OrgWeeklyCurationPage matrix fill errors", () => {
  const PAUSED = ERROR_MESSAGES.AI_BUDGET_PAUSED;
  const RATE_LIMITED = ERROR_MESSAGES.AI_RATE_LIMITED;

  function failingActions(failures: Partial<Record<"fillEmptyCells" | "fillSingleCell", unknown>>) {
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      fn in failures
        ? vi.fn().mockRejectedValue(failures[fn as keyof typeof failures])
        : vi.fn().mockResolvedValue(undefined),
    );
  }

  it("shows the readable budget message, not the raw error payload, when filling empty cells is paused", async () => {
    matrixWithOneEmptyCell();
    failingActions({ fillEmptyCells: new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: PAUSED }) });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Fill Empty Cells" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(PAUSED));
    expect(screen.getByRole("button", { name: "Fill Empty Cells" })).toBeEnabled();
  });

  it("shows the rate-limit message when generating a single cell is refused, and frees the cell button", async () => {
    matrixWithOneEmptyCell();
    failingActions({ fillSingleCell: new ConvexError({ code: ERROR_CODES.AI_RATE_LIMITED, message: RATE_LIMITED, retryAt: 1 }) });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(RATE_LIMITED));
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  it("falls back to a generic message when a fill fails without a readable one", async () => {
    matrixWithOneEmptyCell();
    failingActions({ fillEmptyCells: new Error(""), fillSingleCell: new Error("Cell is locked") });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Fill Empty Cells" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to fill empty cells"));

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cell is locked"));
  });
});

describe("OrgWeeklyCurationPage matrix fill results", () => {
  // A new question is reviewed before the grid lists it, so each message says where it went.
  function fillResults(results: Partial<Record<"fillEmptyCells" | "fillSingleCell", unknown>>) {
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      vi.fn().mockResolvedValue(fn in results ? results[fn as keyof typeof results] : undefined),
    );
  }

  it.each([
    [1, "Wrote 1 question for this cell. It will show here after the Break the Ice team reviews it."],
    [2, "Wrote 2 questions for this cell. They will show here after the Break the Ice team reviews them."],
  ])("says a single-cell fill that wrote %i shows on the grid after the Break the Ice team reviews it", async (count, message) => {
    matrixWithOneEmptyCell();
    fillResults({ fillSingleCell: { count, questionIds: Array.from({ length: count }, (_, i) => `q-new-${i}`), waitingForReview: true } });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says the cell already has a question waiting for review when a single-cell fill wrote nothing for that reason", async () => {
    matrixWithOneEmptyCell();
    fillResults({ fillSingleCell: { count: 0, questionIds: [], waitingForReview: true } });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("This cell already has a question waiting for review."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  it("says no new question was written, and doesn't call it a success, when a single-cell fill wrote nothing and none is waiting", async () => {
    matrixWithOneEmptyCell();
    fillResults({ fillSingleCell: { count: 0, questionIds: [], waitingForReview: false } });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "No new question was written for this cell. It may already have one, or the AI repeated an existing question.",
      ),
    );
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  const batch = (totalCells: number, filledCells: number, totalQuestionsGenerated: number, skippedInvalidTaxonomy = 0, skippedWaitingForReview = 0) => ({
    totalCells,
    filledCells,
    totalQuestionsGenerated,
    skippedExisting: totalCells - filledCells - skippedInvalidTaxonomy,
    skippedWaitingForReview,
    skippedInvalidTaxonomy,
  });

  it.each([
    ["wrote questions", batch(2, 2, 2), "Wrote 2 questions for 2/2 cells. They will show here after the Break the Ice team reviews them."],
    ["wrote questions and skipped a deleted style or tone", batch(3, 2, 2, 1), "Wrote 2 questions for 2/3 cells · 1 skipped (deleted taxonomy). They will show here after the Break the Ice team reviews them."],
    ["wrote one question", batch(2, 1, 1), "Wrote 1 question for 1/2 cells. It will show here after the Break the Ice team reviews it."],
    ["wrote questions and found a cell already waiting for review", batch(3, 2, 2, 0, 1), "Wrote 2 questions for 2/3 cells · 1 already waiting for review. They will show here after the Break the Ice team reviews them."],
    ["wrote questions, found a cell waiting and another's style deleted", batch(4, 2, 2, 1, 1), "Wrote 2 questions for 2/4 cells · 1 already waiting for review · 1 skipped (deleted taxonomy). They will show here after the Break the Ice team reviews them."],
  ])("after a batch fill that %s, gives the counts and says they show after the Break the Ice team's review", async (_what, result, message) => {
    matrixWithOneEmptyCell();
    fillResults({ fillEmptyCells: result });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Fill Empty Cells" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fill Empty Cells" })).toBeEnabled();
  });

  it.each([
    ["because every cell is waiting for review", batch(2, 0, 0, 0, 2), "Wrote 0 questions for 0/2 cells · 2 already waiting for review"],
    ["with one cell waiting and another's style deleted", batch(2, 0, 0, 1, 1), "Wrote 0 questions for 0/2 cells · 1 already waiting for review · 1 skipped (deleted taxonomy)"],
    ["with no cell skipped for review or a deleted style", batch(2, 0, 0), "Wrote 0 questions for 0/2 cells"],
    ["and skipped a deleted style or tone", batch(2, 0, 0, 2), "Wrote 0 questions for 0/2 cells · 2 skipped (deleted taxonomy)"],
  ])("after a batch fill that wrote nothing %s, gives the counts as plain information, not a success, and says nothing about review", async (_what, result, message) => {
    matrixWithOneEmptyCell();
    fillResults({ fillEmptyCells: result });

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Fill Empty Cells" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(message));
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fill Empty Cells" })).toBeEnabled();
  });
});

describe("OrgWeeklyCurationPage topic control", () => {
  it("offers one topic or no topic, and says a grid with no topic is written for the style and tone alone", () => {
    matrixWithOneEmptyCell();
    render(<OrgWeeklyCurationPage />);

    // No topic is the starting choice, and nothing promises a random one.
    expect(screen.getByRole("button", { name: "No topic" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Random" })).toBeNull();
    expect(screen.getByText("Questions are written for the style and tone alone.")).toBeInTheDocument();
    expect(screen.queryByText(/random topic/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "One topic" }));
    expect(screen.queryByText("Questions are written for the style and tone alone.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "No topic" }));
    expect(screen.getByText("Questions are written for the style and tone alone.")).toBeInTheDocument();
  });

  it("sends no topic with a fill when no topic is chosen", async () => {
    matrixWithOneEmptyCell();
    const fillSingleCell = vi.fn().mockResolvedValue({ count: 1, questionIds: ["q-new"], waitingForReview: true });
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      fn === "fillSingleCell" ? fillSingleCell : vi.fn().mockResolvedValue(undefined),
    );

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(fillSingleCell).toHaveBeenCalledTimes(1));
    expect(fillSingleCell).toHaveBeenCalledWith({
      organizationId: "org-1",
      styleSlug: "rapid-fire-either",
      toneSlug: "bold",
      topicSlug: undefined,
      count: 1,
    });
  });

  // Value: protects=on a grid with topics along a side, the page shows a note in place of the topic choice and asks for each cell under that cell's own topic, by both fill routes;
  // fails_when=the choice of one topic or none stays on screen beside a topic axis, a cell's fill leaves its topic out or sends another, or the batch fill stops saying which side holds the topics;
  // why_new=every fill test here is on the style-by-tone grid, where no cell has a topic of its own, and no test put topics on a side;
  // seam=none; no_claim=what the server writes for the topic it is sent (the fill actions are mocked, and convex/generation_quality.test.ts covers them).
  it("with topics along a side, shows a note in place of the topic choice, and asks for each cell under its own topic", async () => {
    // The grid above, with two topics to put along a side: the cozy question is about music, and nothing is about food.
    matrixWithOneEmptyCell();
    const withoutTopics = (useQuery as ReturnType<typeof vi.fn>).getMockImplementation() as (fn: string, ...rest: unknown[]) => unknown;
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string, ...rest: unknown[]) =>
      fn === "getTopics"
        ? [
            { id: "music", slug: "music", name: "Music", icon: "zap", color: "#888888" },
            { id: "food", slug: "food", name: "Food", icon: "heart", color: "#888888" },
          ]
        : withoutTopics(fn, ...rest),
    );
    const fillSingleCell = vi.fn().mockResolvedValue({ count: 1, questionIds: ["q-new"], waitingForReview: true });
    const fillEmptyCells = vi.fn().mockResolvedValue({
      totalCells: 2,
      filledCells: 1,
      totalQuestionsGenerated: 1,
      skippedExisting: 1,
      skippedWaitingForReview: 0,
      skippedInvalidTaxonomy: 0,
    });
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      fn === "fillSingleCell" ? fillSingleCell : fn === "fillEmptyCells" ? fillEmptyCells : vi.fn().mockResolvedValue(undefined),
    );
    const NOTE = "Topics run along one side of the grid, so each cell is written under its own topic.";
    const axisButton = (axis: string, name: string) => within(screen.getByText(axis).parentElement!).getByRole("button", { name });

    render(<OrgWeeklyCurationPage />);
    expect(screen.queryByText(NOTE)).toBeNull();

    // Topics as the columns: one style down the side, music and food across.
    fireEvent.click(axisButton("Secondary axis (cols)", "Topic"));

    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "One topic" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No topic" })).toBeNull();
    expect(screen.queryByText("Questions are written for the style and tone alone.")).toBeNull();

    // The music cell lists the question, so the one empty cell is food's. No tone is on the grid, so the first one is used.
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(fillSingleCell).toHaveBeenCalledTimes(1));
    expect(fillSingleCell).toHaveBeenLastCalledWith({
      organizationId: "org-1",
      styleSlug: "rapid-fire-either",
      toneSlug: "cozy",
      topicSlug: "food",
      count: 1,
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Fill Empty Cells" })).toBeEnabled());

    // The batch fill names the side the topics are on, and each cell carries its topic as its column.
    fireEvent.click(screen.getByRole("button", { name: "Fill Empty Cells" }));
    await waitFor(() => expect(fillEmptyCells).toHaveBeenCalledTimes(1));
    expect(fillEmptyCells).toHaveBeenCalledWith({
      organizationId: "org-1",
      axisY: "style",
      axisX: "topic",
      topicSlug: undefined,
      cells: [
        { ySlug: "rapid-fire-either", xSlug: "music", styleSlug: "rapid-fire-either", toneSlug: "cozy" },
        { ySlug: "rapid-fire-either", xSlug: "food", styleSlug: "rapid-fire-either", toneSlug: "cozy" },
      ],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Fill Empty Cells" })).toBeEnabled());

    // With tones back as the columns, the choice returns.
    fireEvent.click(axisButton("Secondary axis (cols)", "Tone"));
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByRole("button", { name: "No topic" })).toBeInTheDocument();

    // Topics as the rows, tones across: the last cell is food and bold, and no style is on the grid.
    fireEvent.click(axisButton("Primary axis (rows)", "Topic"));
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No topic" })).toBeNull();

    const emptyCells = screen.getAllByRole("button", { name: "Generate" });
    expect(emptyCells).toHaveLength(3);
    fireEvent.click(emptyCells[emptyCells.length - 1]);
    await waitFor(() => expect(fillSingleCell).toHaveBeenCalledTimes(2));
    expect(fillSingleCell).toHaveBeenLastCalledWith({
      organizationId: "org-1",
      styleSlug: "rapid-fire-either",
      toneSlug: "bold",
      topicSlug: "food",
      count: 1,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("OrgWeeklyCurationPage Team prompt input validation", () => {
  const TOO_LONG = new ConvexError({
    code: ERROR_CODES.QUESTION_TEXT_TOO_LONG,
    message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG,
  });

  function refuseTeamPrompts(failure: unknown) {
    const createAndAssign = vi.fn().mockRejectedValue(failure);
    (useMutation as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "createAndAssignTeamPrompt") return createAndAssign;
      if (fn === "createSchedule") return createSchedule;
      return vi.fn().mockResolvedValue(undefined);
    });
    return createAndAssign;
  }

  function mockTopicComposerQueries() {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getEffectiveEntitlements") return { canUseTeamFeatures: true };
      if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurrentUser") return { planTier: "team", organizationRole: "manager" };
      if (fn === "getCurationPreview") return { totalResponses: 0, coachCount: 0, confidence: "insufficient", recommendations: [] };
      if (fn === "getStyles") return [{ _id: "style-1", id: "reflective", slug: "reflective", name: "Reflective", icon: "zap", color: "#888888" }];
      if (fn === "getTones") return [{ _id: "tone-1", id: "warm", slug: "warm", name: "Warm", icon: "heart", color: "#888888" }];
      if (fn === "getPublicQuestions" || fn === "getTopics") return [];
      return undefined;
    });
  }

  it("shows the readable input validation message when written wording is refused, and keeps the draft", async () => {
    const createAndAssign = refuseTeamPrompts(TOO_LONG);
    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Write" }));

    const questionInput = screen.getByLabelText("Exact question");
    fireEvent.change(questionInput, { target: { value: "What should we challenge?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG));
    expect(createAndAssign).toHaveBeenCalledWith({
      scheduleId: "schedule-new",
      dayOfWeek: "monday",
      questionText: "What should we challenge?",
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Exact question")).toHaveValue("What should we challenge?");
    expect(screen.getByRole("button", { name: "Save and assign" })).toBeEnabled();
  });

  it.each([
    ["the readable input validation message", TOO_LONG, ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG],
    [
      "the readable topic field message",
      new ConvexError({ code: ERROR_CODES.TEAM_TOPIC_TOO_LONG, message: ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_TOO_LONG }),
      ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_TOO_LONG,
    ],
    ["a generic message for an unreadable error", new Error(""), "Failed to assign topic question"],
  ])("shows %s when chosen topic wording is refused, and keeps it", async (_label, failure, expected) => {
    refuseTeamPrompts(failure);
    const options = ["What feels ready?", "What concern needs airtime?", "Where would help land?"];
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      fn === "previewTopicQuestions"
        ? vi.fn().mockResolvedValue({ questions: options, runId: "run-1" })
        : vi.fn().mockResolvedValue(undefined),
    );
    mockTopicComposerQueries();

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Topic" }));
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: "Launch readiness" } });
    fireEvent.change(screen.getByLabelText("What should this conversation surface?"), {
      target: { value: "Surface unspoken concerns." },
    });
    const generateButton = screen.getByRole("button", { name: "Generate three options" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);
    fireEvent.click(await screen.findByRole("button", { name: "What concern needs airtime?" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this question" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expected));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Final wording")).toHaveValue("What concern needs airtime?");
  });

  it("shows the readable message when the schedule was published in another tab, not the redacted server error", async () => {
    refuseTeamPrompts(new ConvexError({
      code: ERROR_CODES.SCHEDULE_NOT_DRAFT,
      message: ERROR_MESSAGES.SCHEDULE_NOT_DRAFT,
    }));
    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Write" }));
    fireEvent.change(screen.getByLabelText("Exact question"), { target: { value: "What should we challenge?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.SCHEDULE_NOT_DRAFT));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows why Auto-fill placed nothing when only flagged questions are left, not the redacted server error", async () => {
    const autoSchedule = vi.fn().mockRejectedValue(new ConvexError({
      code: ERROR_CODES.SCHEDULE_ONLY_FLAGGED_LEFT,
      message: ERROR_MESSAGES.SCHEDULE_ONLY_FLAGGED_LEFT,
    }));
    (useMutation as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "autoSchedule") return autoSchedule;
      if (fn === "createSchedule") return createSchedule;
      return vi.fn().mockResolvedValue(undefined);
    });
    render(<OrgWeeklyCurationPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /Auto-fill/ })[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.SCHEDULE_ONLY_FLAGGED_LEFT));
    expect(toast.success).not.toHaveBeenCalledWith("Week auto-filled!");
  });

  it("shows the readable message when a topic preview's style is refused", async () => {
    (useAction as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
      fn === "previewTopicQuestions"
        ? vi.fn().mockRejectedValue(new ConvexError({
          code: ERROR_CODES.STYLE_UNAVAILABLE,
          message: ERROR_MESSAGES.STYLE_UNAVAILABLE,
        }))
        : vi.fn().mockResolvedValue(undefined),
    );
    mockTopicComposerQueries();

    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Topic" }));
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: "Launch readiness" } });
    fireEvent.change(screen.getByLabelText("What should this conversation surface?"), {
      target: { value: "Surface unspoken concerns." },
    });
    const generateButton = screen.getByRole("button", { name: "Generate three options" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ERROR_MESSAGES.STYLE_UNAVAILABLE));
  });

  it("falls back to a generic message when written wording fails without a readable one", async () => {
    refuseTeamPrompts(new Error(""));
    render(<OrgWeeklyCurationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("tab", { name: "Write" }));
    fireEvent.change(screen.getByLabelText("Exact question"), { target: { value: "What should we challenge?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and assign" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to assign custom question"));
  });
});
