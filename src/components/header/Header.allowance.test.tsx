import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Header } from "./Header";

let currentUser: unknown;
let isSignedIn = true;

vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(query) === "core/users:getCurrentUser" ? currentUser : [],
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useStorageContext", () => ({
  useStorageContext: () => ({ likedQuestions: [], likedLimit: Infinity, hiddenQuestions: [], hiddenLimit: Infinity }),
}));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));

const renderHeader = () => render(<MemoryRouter><Header /></MemoryRouter>);

beforeEach(() => {
  isSignedIn = true;
  currentUser = { aiLimit: 100, aiUsage: { count: 15 } };
});

it("shows a signed-in person how many AI generations they have left, linking to AI usage", () => {
  renderHeader();
  const allowance = screen.getByRole("link", { name: "85 of 100 AI generations left this cycle. Open AI usage in Settings" });
  expect(allowance).toHaveAttribute("href", "/settings?expand=subscription");
  expect(allowance).toHaveTextContent("85 AI generations left");
});

it("counts down to zero and never below it", () => {
  currentUser = { aiLimit: 100, aiUsage: { count: 104 } };
  renderHeader();
  expect(screen.getByRole("link", { name: /^0 of 100 AI generations left/ })).toBeInTheDocument();
});

it("shows no count to guests, or before the allowance is known", () => {
  isSignedIn = false;
  renderHeader();
  expect(screen.queryByRole("link", { name: /AI generations left/ })).not.toBeInTheDocument();

  isSignedIn = true;
  currentUser = undefined;
  renderHeader();
  expect(screen.queryByRole("link", { name: /AI generations left/ })).not.toBeInTheDocument();
});
