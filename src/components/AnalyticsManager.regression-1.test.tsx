import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsManager } from "./AnalyticsManager";

// Regression: launch checklist item 18 — PostHog shipped but never initialized through a consent flow.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

const storageState = vi.hoisted(() => ({ hasConsented: false }));
const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("../hooks/useStorageContext", () => ({
  useStorageContext: () => storageState,
}));

vi.mock("posthog-js", () => ({ default: posthog }));

const AnalyticsHarness = () => (
  <>
    <AnalyticsManager />
    <Link to="/pricing">Pricing</Link>
  </>
);

describe("AnalyticsManager", () => {
  it("starts only after consent, tracks navigation, and stops after revocation", async () => {
    storageState.hasConsented = false;
    const view = render(
      <MemoryRouter initialEntries={["/"]}>
        <AnalyticsHarness />
      </MemoryRouter>,
    );

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();

    storageState.hasConsented = true;
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <AnalyticsHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(posthog.init).toHaveBeenCalledOnce();
      expect(posthog.capture).toHaveBeenCalledWith("$pageview", expect.any(Object));
    });

    fireEvent.click(screen.getByRole("link", { name: "Pricing" }));
    await waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));

    storageState.hasConsented = false;
    view.rerender(
      <MemoryRouter initialEntries={["/pricing"]}>
        <AnalyticsHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
      expect(posthog.reset).toHaveBeenCalledOnce();
    });
  });
});
