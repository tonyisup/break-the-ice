import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgWeeklyCurationPage from "./page";
import { useAction, useMutation, useQuery } from "convex/react";

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
  useWorkspace: () => ({ activeWorkspace: "org-1", setActiveWorkspace: vi.fn(), workspaceHydrated: true }),
}));

vi.mock("@/components/header/TeamWorkspaceMenu", () => ({ TeamWorkspaceMenu: () => null }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-router-dom", () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    core: {
      users: { store: "storeUser" },
      schedules: { listSchedulesForUser: "listSchedulesForUser", listSchedules: "listSchedules", getSchedule: "getSchedule", createSchedule: "createSchedule", assignQuestion: "assignQuestion", unassignQuestion: "unassignQuestion", publishSchedule: "publishSchedule", autoSchedule: "autoSchedule" },
      organizations: { getOrganizations: "getOrganizations" },
      orgSettings: { getOrgSettings: "getOrgSettings", upsertOrgSettings: "upsertOrgSettings", setDeliveryDayActive: "setDeliveryDayActive" },
      coachFeedback: { getCurationPreview: "getCurationPreview" },
      questions: { getPublicQuestions: "getPublicQuestions" },
      styles: { getStyles: "getStyles" }, tones: { getTones: "getTones" }, topics: { getTopics: "getTopics" },
      billing: { syncOrganizationFromClerk: "syncOrganizationFromClerk" },
      billingSyncAction: { syncOrganizationViaClerkApi: "syncOrganizationViaClerkApi" },
      fillMatrix: { fillEmptyCells: "fillEmptyCells", fillSingleCell: "fillSingleCell" },
    },
  },
}));

const setDeliveryDayActive = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  (useMutation as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
    fn === "setDeliveryDayActive" ? setDeliveryDayActive : vi.fn().mockResolvedValue(undefined),
  );
  (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn().mockResolvedValue(undefined));
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
    if (fn === "getOrgSettings") return { weekStartDay: "monday", timeZone: "UTC", activeDeliveryDays: ["monday"] };
    if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
    if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
    if (fn === "getCurationPreview") return { totalResponses: 3, confidence: "directional", recommendations: [{ questionId: "q-preview", text: "Calm conversation starter", score: 1, reasons: [{ dimension: "tone", value: "calm", score: 1, responses: 3, landedWell: 1, fellFlat: 0, wrongVibe: 2, timingOff: 0, isMixed: true }] }] };
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

  it("renders feedback evidence as an advisory preview without an assignment action", () => {
    render(<OrgWeeklyCurationPage />);

    expect(screen.getByRole("heading", { name: "Feedback-informed curation" })).toBeInTheDocument();
    expect(screen.getByText("Calm conversation starter")).toBeInTheDocument();
    expect(screen.getByText(/tone: calm · 3 responses/i)).toBeInTheDocument();
    expect(screen.getByText("Mixed coach feedback — review before assigning.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign calm conversation starter/i })).toBeNull();
  });

  it("disables delivery-day controls until organization settings are loaded", () => {
    (useQuery as ReturnType<typeof vi.fn>).mockImplementation((fn: string) => {
      if (fn === "getOrgSettings") return undefined;
      if (fn === "listSchedulesForUser" || fn === "listSchedules") return [];
      if (fn === "getOrganizations") return [{ _id: "org-1", _creationTime: 1 }];
      if (fn === "getCurationPreview") return { totalResponses: 3, confidence: "directional", recommendations: [{ questionId: "q-preview", text: "Calm conversation starter", score: 1, reasons: [{ dimension: "tone", value: "calm", score: 1, responses: 3, landedWell: 1, fellFlat: 0, wrongVibe: 2, timingOff: 0, isMixed: true }] }] };
    if (fn === "getPublicQuestions" || fn === "getStyles" || fn === "getTones" || fn === "getTopics") return [];
      return undefined;
    });

    render(<OrgWeeklyCurationPage />);

    expect(screen.getByRole("checkbox", { name: "Deliver on Monday" })).toBeDisabled();
  });
});
