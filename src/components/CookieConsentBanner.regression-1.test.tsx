import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsentBanner from "./CookieConsentBanner";

// Regression: launch checklist item 17 — the consent banner was never mounted on public routes.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

const setHasConsented = vi.fn();
const revokeConsent = vi.fn();

vi.mock("../hooks/useStorageContext", () => ({
  useStorageContext: () => ({ setHasConsented, revokeConsent }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const clearConsentCookie = () => {
  document.cookie = "cookieConsent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConsentCookie();
  });

  it("shows on a clean visit and records acceptance", () => {
    render(<MemoryRouter><CookieConsentBanner /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /cookie settings/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /accept analytics/i }));

    expect(setHasConsented).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("heading", { name: /cookie settings/i })).not.toBeInTheDocument();
  });

  it("records a necessary-only choice", () => {
    render(<MemoryRouter><CookieConsentBanner /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /necessary only/i }));

    expect(revokeConsent).toHaveBeenCalledOnce();
  });

  it("stays hidden after a previous choice", () => {
    document.cookie = "cookieConsent=false; path=/";
    render(<MemoryRouter><CookieConsentBanner /></MemoryRouter>);

    expect(screen.queryByRole("heading", { name: /cookie settings/i })).not.toBeInTheDocument();
  });
});
