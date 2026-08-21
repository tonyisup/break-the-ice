import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NotFoundPage from "./page";
import ThankYouPage from "../thank-you/page";

// Regression: launch checklist items 1 and 14 — missing and confirmation routes rendered a blank shell.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ effectiveTheme: "light" }),
}));

describe("launch status pages", () => {
  it("gives visitors useful recovery actions on a missing page", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /slipped under the surface/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /open the app/i })).toHaveAttribute("href", "/app");
  });

  it("confirms a successful message and exposes the support address", () => {
    render(
      <MemoryRouter>
        <ThankYouPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /thanks for reaching out/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "breakingthaticeberg@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:breakingthaticeberg@gmail.com",
    );
  });
});
