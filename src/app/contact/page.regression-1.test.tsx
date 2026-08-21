import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContactPage, { CONTACT_SUBMISSION_TIMEOUT_MS } from "./page";

// Regression: launch checklist items 13, 14, and 19 — offline contact submissions hung and the email was undefined.
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-local-2026-08-21.md

const submitFeedback = vi.fn();
const navigate = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => submitFeedback,
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: { core: { feedback: { submitFeedback: "submitFeedback" } } },
}));

vi.mock("@/hooks/useStorageContext", () => ({
  useStorageContext: () => ({ sessionId: "test-session" }),
}));

vi.mock("@/components/PlaceholderPage", () => ({
  PlaceholderPage: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
};

const enterMessage = (message = "Hello from the contact page") => {
  fireEvent.change(screen.getByRole("textbox", { name: /your message/i }), {
    target: { value: message },
  });
};

describe("ContactPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the configured public support email", () => {
    render(<MemoryRouter><ContactPage /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "breakingthaticeberg@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:breakingthaticeberg@gmail.com",
    );
  });

  it("fails immediately while offline and preserves the message", async () => {
    setOnline(false);
    render(<MemoryRouter><ContactPage /></MemoryRouter>);
    enterMessage();

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/you’re offline/i);
    expect(submitFeedback).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /your message/i })).toHaveValue(
      "Hello from the contact page",
    );
  });

  it("stops the loading state when a connected request takes too long", async () => {
    vi.useFakeTimers();
    submitFeedback.mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter><ContactPage /></MemoryRouter>);
    enterMessage();

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONTACT_SUBMISSION_TIMEOUT_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than expected/i);
    expect(screen.getByRole("button", { name: /send message/i })).toBeEnabled();
  });

  it("reuses the submission ID on retry and navigates after confirmation", async () => {
    submitFeedback
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce(null);
    render(<MemoryRouter><ContactPage /></MemoryRouter>);
    enterMessage();

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t send/i);

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/thank-you", { replace: true });
    });

    expect(submitFeedback).toHaveBeenCalledTimes(2);
    expect(submitFeedback.mock.calls[0]?.[0].submissionId).toBe(
      submitFeedback.mock.calls[1]?.[0].submissionId,
    );
    expect(submitFeedback.mock.calls[0]?.[0]).toMatchObject({
      text: "Hello from the contact page",
      sessionId: "test-session",
    });
  });
});
