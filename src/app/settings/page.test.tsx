import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "./page";
import { useQuery } from "convex/react";

const mockUseAuth = vi.fn();
const mockUseStorageContext = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@clerk/clerk-react/experimental", () => ({
  SubscriptionDetailsButton: ({ children }: any) => <>{children}</>,
}));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ effectiveTheme: "light" }),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ activeWorkspace: null }),
}));

vi.mock("../../hooks/useStorageContext", () => ({
  useStorageContext: () => mockUseStorageContext(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/header", () => ({
  Header: () => <div>Header</div>,
}));

vi.mock("@/components/collapsible-section/CollapsibleSection", () => ({
  CollapsibleSection: ({ title, children }: any) => (
    <section>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock("@/components/ui/dynamic-icon", () => ({
  default: () => <span aria-hidden="true">icon</span>,
}));

vi.mock("@/components/item-detail-drawer/item-detail-drawer", () => ({
  ItemDetailDrawer: () => null,
}));

vi.mock("@/app/settings/organization/page", () => ({
  default: () => <div>Organization Settings</div>,
}));

vi.mock("@/app/settings/organization/WorkspaceSwitcher", () => ({
  default: () => <div>Workspace Switcher</div>,
}));

vi.mock("@/app/settings/collections/page", () => ({
  default: () => <div>Collections Settings</div>,
}));

vi.mock("@/components/SignInCTA", () => ({
  SignInCTA: () => <div>Sign In CTA</div>,
}));

vi.mock("lucide-react", () => ({
  Link: () => <span aria-hidden="true">link</span>,
  ExternalLink: () => <span aria-hidden="true">external</span>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    core: {
      styles: { getStyles: "getStyles" },
      tones: { getTones: "getTones" },
      users: { getCurrentUser: "getCurrentUser" },
      billing: { getEffectiveEntitlements: "getEffectiveEntitlements" },
      questions: { getQuestionsByIds: "getQuestionsByIds" },
    },
  },
}));

describe("SettingsPage", () => {
  const mockStyles = [
    { _id: "style-1", id: "style-1", name: "Reflective", icon: "sparkles", color: "#111111" },
  ];
  const mockTones = [
    { _id: "tone-1", id: "tone-1", name: "Warm", icon: "sun", color: "#222222" },
  ];
  const mockHiddenQuestionObjects: never[] = [];

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
    mockUseStorageContext.mockReturnValue({
      hiddenStyles: [],
      setHiddenStyles: vi.fn(),
      addHiddenStyle: vi.fn(),
      removeHiddenStyle: vi.fn(),
      hiddenTones: [],
      setHiddenTones: vi.fn(),
      addHiddenTone: vi.fn(),
      removeHiddenTone: vi.fn(),
      hiddenQuestions: [],
      setHiddenQuestions: vi.fn(),
      removeHiddenQuestion: vi.fn(),
      clearHiddenQuestions: vi.fn(),
      storageLimitBehavior: "block",
      setStorageLimitBehavior: vi.fn(),
    });

    (useQuery as any).mockImplementation((queryFn: string) => {
      if (queryFn === "getStyles") return mockStyles;
      if (queryFn === "getTones") return mockTones;
      if (queryFn === "getQuestionsByIds") return mockHiddenQuestionObjects;
      if (queryFn === "getCurrentUser") return null;
      if (queryFn === "getEffectiveEntitlements") return null;
      return undefined;
    });
  });

  it("shows style and tone controls for users outside a team workspace", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Manage Styles")).toBeDefined();
    expect(screen.getByText("Manage Tones")).toBeDefined();
    expect(screen.getByText("Reflective")).toBeDefined();
    expect(screen.getByText("Warm")).toBeDefined();
  });
});