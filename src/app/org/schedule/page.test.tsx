import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgWeeklyCurationPage from "./page";
import { useAction, useMutation, useQuery } from "convex/react";

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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
          { _id: "q-bold", text: secondQuestion, style: "rapid-fire-either", tone: "bold", topic: "music", isAIGenerated: true },
        ];
      }
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    fireEvent.click(screen.getByRole("button", { name: `View full question: ${firstQuestion}` }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Question details" })).toBeInTheDocument();
    expect(within(dialog).getByText(firstQuestion)).toBeInTheDocument();
    expect(within(dialog).getByText("Rapid Fire Either")).toBeInTheDocument();
    expect(within(dialog).getByText("Cozy")).toBeInTheDocument();
    expect(within(dialog).getByText("Music")).toBeInTheDocument();
    expect(within(dialog).getByText("1 of 2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next question" }));
    expect(within(dialog).getByText(secondQuestion)).toBeInTheDocument();
    expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("AI generated")).toBeInTheDocument();

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
