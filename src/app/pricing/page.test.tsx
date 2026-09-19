import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import PricingPage, { PublicPlanSummary } from "./page";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  plans: vi.fn(),
  query: vi.fn(),
  revalidate: vi.fn(),
  auth: {
    signedIn: false,
    orgId: null as string | null,
    memberships: [] as unknown[],
  },
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ orgId: mocks.auth.orgId }),
  useUser: () => ({
    isLoaded: true,
    user: { organizationMemberships: mocks.auth.memberships },
  }),
  SignedIn: ({ children }: { children: ReactNode }) =>
    mocks.auth.signedIn ? children : null,
  SignedOut: ({ children }: { children: ReactNode }) =>
    mocks.auth.signedIn ? null : children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  OrganizationSwitcher: () => <div>Workspace selector</div>,
  CreateOrganization: () => <div>Create workspace form</div>,
  PricingTable: ({
    for: payer,
    newSubscriptionRedirectUrl,
  }: {
    for: string;
    newSubscriptionRedirectUrl: string;
  }) => (
    <div
      data-testid="checkout"
      data-payer={payer}
      data-redirect={newSubscriptionRedirectUrl}
    >
      Checkout plans
    </div>
  ),
}));
vi.mock("@/hooks/useTheme", () => ({ useTheme: () => ({}) }));
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
    section: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => <section className={className}>{children}</section>,
  },
}));
vi.mock("@clerk/clerk-react/experimental", () => ({
  usePlans: () => mocks.plans(),
}));
const client = { query: mocks.query };
vi.mock("convex/react", () => ({ useConvex: () => client }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { signedIn: false, orgId: null, memberships: [] };
  mocks.query.mockResolvedValue({ free: 17, team: 240, cycleDays: 30 });
  mocks.plans.mockReturnValue({
    data: [
      {
        id: "team",
        name: "Team",
        publiclyVisible: true,
        isDefault: false,
        isRecurring: true,
        fee: { currencySymbol: "$", amountFormatted: "12.50", currency: "USD" },
        annualFee: {
          currencySymbol: "$",
          amountFormatted: "125.00",
          currency: "USD",
        },
      },
    ],
    revalidate: mocks.revalidate,
  });
});
it("shows authoritative prices and allowances without requiring a user or organization", async () => {
  render(<PublicPlanSummary />);
  expect(screen.getByText("$12.50")).toBeVisible();
  expect(
    screen.getByText(/\$125.00 USD per workspace, billed annually/),
  ).toBeVisible();
  expect(
    await screen.findByText(/240 AI requests per member/),
  ).toHaveTextContent("Free includes 17 per person");
});
it("reports unavailable data without inventing a price or allowance", async () => {
  mocks.plans.mockReturnValue({
    isError: true,
    data: [],
    revalidate: mocks.revalidate,
  });
  mocks.query.mockRejectedValue(new Error("Unavailable"));
  render(<PublicPlanSummary />);
  expect(screen.getByText("Current prices are unavailable.")).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByText("Couldn’t load the included AI allowance."),
    ).toBeVisible(),
  );
});

it.each([
  [false, null, [], "Sign in to continue"],
  [true, null, [{}], "Workspace selector"],
  [true, null, [], "Create workspace form"],
  [true, "org_team", [], "Checkout plans"],
] as const)(
  "preserves checkout state for signedIn=%s org=%s memberships=%j",
  async (signedIn, orgId, memberships, expected) => {
    mocks.auth = { signedIn, orgId, memberships: [...memberships] };
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(expected)).toBeVisible();
    if (orgId) {
      expect(screen.getByTestId("checkout")).toHaveAttribute(
        "data-payer",
        "organization",
      );
      expect(screen.getByTestId("checkout")).toHaveAttribute(
        "data-redirect",
        "/billing/success",
      );
    }
  },
);
