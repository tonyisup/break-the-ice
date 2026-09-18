import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ isSignedIn: false }) }));
vi.mock("@/hooks/useTeamWorkspace", () => ({ useTeamWorkspace: () => ({}) }));
vi.mock("@/hooks/useStorageContext", () => ({ useStorageContext: () => ({ likedQuestions: [], hiddenQuestions: [], likedLimit: 100, hiddenLimit: 100 }) }));
vi.mock("./UserMenu", () => ({ UserMenu: () => <button>Account menu</button> }));
vi.mock("./TeamWorkspaceMenu", () => ({ TeamWorkspaceMenu: () => null }));

describe("main navigation", () => {
  it.each([["/liked", "Liked"], ["/history", "History"]])("keeps destinations stable on %s", (path, currentLabel) => {
    render(<MemoryRouter initialEntries={[path]}><Header /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Liked" })).toHaveAttribute("href", "/liked");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: currentLabel })).toHaveAttribute("aria-current", "page");
  });
});
