import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamWorkspaceMenu } from "./TeamWorkspaceMenu";

let activeWorkspace: string | null = null;

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ activeWorkspace }),
}));

describe("TeamWorkspaceMenu", () => {
  beforeEach(() => {
    activeWorkspace = null;
  });

  it("stays hidden in the personal workspace", () => {
    render(
      <MemoryRouter>
        <TeamWorkspaceMenu />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: /team workspace navigation/i })).toBeNull();
  });

  it("links team workspaces to scheduling and coach views", () => {
    activeWorkspace = "organization-1";
    render(
      <MemoryRouter initialEntries={["/org/schedule"]}>
        <TeamWorkspaceMenu />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: /team workspace navigation/i });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    expect(screen.getByRole("menuitem", { name: /weekly schedule/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("menuitem", { name: /coach view/i })).toHaveAttribute(
      "href",
      "/org/today",
    );
  });
});
