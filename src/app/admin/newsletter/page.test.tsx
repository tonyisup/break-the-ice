import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import NewsletterPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    admin: {
      newsletter: {
        getSubscribers: "getSubscribers",
        getStats: "getStats",
        getPendingSubscriptions: "getPendingSubscriptions",
        getDeliveryHistory: "getDeliveryHistory",
        setSubscriptionStatus: "setSubscriptionStatus",
        setSendHour: "setSendHour",
        removePendingSubscription: "removePendingSubscription",
        triggerDailyNewsletter: "triggerDailyNewsletter",
      },
    },
  },
}));

const mutations = {
  setSubscriptionStatus: vi.fn(),
  setSendHour: vi.fn(),
  removePendingSubscription: vi.fn(),
};

const queryResults: Record<string, unknown> = {
  getSubscribers: [
    { _id: "u1", _creationTime: 1, name: "Reader", email: "reader@example.com", newsletterSubscriptionStatus: "subscribed" },
    { _id: "u2", _creationTime: 2, name: "Left", email: "left@example.com", newsletterSubscriptionStatus: "unsubscribed" },
  ],
  getStats: {
    subscribedCount: 1,
    unsubscribedCount: 1,
    pendingVerificationCount: 1,
    deliveryDate: "2026-11-24",
    deliveryCounts: { pending: 0, processing: 0, sent: 0, failed: 0 },
  },
  getPendingSubscriptions: [{ _id: "p1", _creationTime: Date.now(), email: "new@example.com" }],
  getDeliveryHistory: [
    { _id: "d1", deliveryDate: "2026-11-23", status: "failed", attemptCount: 1, error: "Resend refused it" },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <NewsletterPage />
    </MemoryRouter>,
  );
}

describe("NewsletterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as any).mockImplementation((ref: string) => queryResults[ref]);
    (useMutation as any).mockImplementation((ref: keyof typeof mutations) => mutations[ref]);
    (useAction as any).mockReturnValue(vi.fn());
  });

  it("changes a subscriber's send time", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Send time for reader@example.com"), { target: { value: "15" } });

    await waitFor(() => expect(mutations.setSendHour).toHaveBeenCalledWith({ userId: "u1", hour: 15 }));
  });

  it("only re-subscribes someone who opted out after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const toggle = screen.getByLabelText("Newsletter subscription for left@example.com");

    fireEvent.click(toggle);
    expect(mutations.setSubscriptionStatus).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mutations.setSubscriptionStatus).toHaveBeenCalledWith({
        userId: "u2",
        status: "subscribed",
        confirmResubscribe: true,
      }),
    );
    confirm.mockRestore();
  });

  it("shows why a delivery failed", async () => {
    renderPage();

    fireEvent.click(screen.getByLabelText("Delivery history for reader@example.com"));

    expect(await screen.findByText("Resend refused it")).toBeInTheDocument();
  });

  // Value: protects=cancelling the manual send emails nobody; fails_when=the confirm guard is removed;
  // why_new=no test clicked send; seam=none; no_claim=the backend send (mocked action).
  it("only sends the newsletter after confirmation", async () => {
    const trigger = vi.fn().mockResolvedValue({
      success: true,
      skipped: false,
      message: "Scheduled 1 newsletter delivery batch(es).",
      scheduledBatchCount: 1,
      pendingCount: 1,
    });
    (useAction as any).mockReturnValue(trigger);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const send = screen.getByRole("button", { name: "Send Daily Newsletter" });

    fireEvent.click(send);
    expect(trigger).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(send);
    expect(await screen.findByText("Scheduled 1 newsletter delivery batch(es).")).toBeInTheDocument();
    expect(trigger).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("removes a pending sign-up", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(screen.getByLabelText("Remove pending sign-up for new@example.com"));

    await waitFor(() => expect(mutations.removePendingSubscription).toHaveBeenCalledWith({ pendingId: "p1" }));
    confirm.mockRestore();
  });
});
