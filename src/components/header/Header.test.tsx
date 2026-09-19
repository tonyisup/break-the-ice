import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: false }),
}));
vi.mock("@/hooks/useTeamWorkspace", () => ({ useTeamWorkspace: () => ({}) }));
vi.mock("@/hooks/useStorageContext", () => ({
  useStorageContext: () => ({
    likedQuestions: [],
    hiddenQuestions: [],
    likedLimit: 10,
    hiddenLimit: 10,
  }),
}));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));
vi.mock("./TeamWorkspaceMenu", () => ({ TeamWorkspaceMenu: () => null }));

it.each([
  ["/app", "Home"],
  ["/liked", "Liked"],
  ["/history", "History"],
])("keeps destinations stable on %s", (path, active) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    "/app",
  );
  expect(screen.getByRole("link", { name: "Liked" })).toHaveAttribute(
    "href",
    "/liked",
  );
  expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
    "href",
    "/history",
  );
  expect(screen.getByRole("link", { name: active })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
