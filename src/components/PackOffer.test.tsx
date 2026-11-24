import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { PackOffer } from "./PackOffer";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const captureAnalytics = vi.fn();
vi.mock("@/lib/analytics", () => ({
  captureAnalytics: (...args: unknown[]) => captureAnalytics(...args),
}));

const OFFER = "pack-50-usd-5";
const record = vi.fn();
const getButton = { name: "Get 50 more for $5" };
const noticeButton = { name: "Tell me when they're ready" };

beforeEach(() => {
  captureAnalytics.mockClear();
  record.mockReset().mockResolvedValue(null);
  vi.mocked(useMutation).mockReturnValue(record as unknown as ReturnType<typeof useMutation>);
  vi.mocked(useQuery).mockReturnValue({ shown: false, clicked: false, notify: false });
});

afterEach(() => vi.restoreAllMocks());

it("records that the offer was shown, then the request, and says nothing is on sale", () => {
  render(<PackOffer surface="feed" />);
  expect(record).toHaveBeenCalledWith({ offer: OFFER, surface: "feed", step: "shown" });
  expect(captureAnalytics).toHaveBeenCalledWith("ai_limit_shown", { surface: "feed" });

  fireEvent.click(screen.getByRole("button", getButton));
  expect(record).toHaveBeenLastCalledWith({ offer: OFFER, surface: "feed", step: "asked" });
  expect(captureAnalytics).toHaveBeenCalledWith("pack_offer_clicked", { surface: "feed", offer: OFFER });
  expect(screen.getByText(/aren't on sale yet, and\s+nothing was charged/)).toBeInTheDocument();
  expect(screen.queryByRole("button", getButton)).toBeNull();
});

it("confirms the notice only once it is saved", async () => {
  vi.mocked(useQuery).mockReturnValue({ shown: true, clicked: true, notify: false });
  let finish: (value: null) => void = () => {};
  record.mockReturnValue(new Promise<null>((resolve) => { finish = resolve; }));
  render(<PackOffer surface="feed" />);

  fireEvent.click(screen.getByRole("button", noticeButton));
  expect(record).toHaveBeenLastCalledWith({ offer: OFFER, surface: "feed", step: "notify" });
  expect(screen.getByRole("button", noticeButton)).toBeDisabled();
  expect(screen.queryByText(/We'll let you know/)).toBeNull();

  finish(null);
  expect(await screen.findByText(/We'll let you know when packs are on sale/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
  expect(captureAnalytics).toHaveBeenCalledWith("pack_notify_requested", { surface: "feed", offer: OFFER });
});

it("says so and lets the person try again when the notice doesn't save", async () => {
  vi.mocked(useQuery).mockReturnValue({ shown: true, clicked: true, notify: false });
  record.mockRejectedValueOnce(new Error("offline"));
  render(<PackOffer surface="feed" />);

  fireEvent.click(screen.getByRole("button", noticeButton));
  expect(await screen.findByText("That didn't save. Try again.")).toBeInTheDocument();
  expect(screen.queryByText(/We'll let you know/)).toBeNull();
  expect(captureAnalytics).not.toHaveBeenCalledWith("pack_notify_requested", expect.anything());

  fireEvent.click(screen.getByRole("button", noticeButton));
  expect(await screen.findByText(/We'll let you know when packs are on sale/)).toBeInTheDocument();
});

it("still answers the first press when its save fails", async () => {
  record.mockRejectedValue(new Error("offline"));
  render(<PackOffer surface="feed" />);
  fireEvent.click(screen.getByRole("button", getButton));
  expect(await screen.findByText(/aren't on sale yet/)).toBeInTheDocument();
});

it("shows nothing while the saved answer is loading, so the button never flashes", () => {
  vi.mocked(useQuery).mockReturnValue(undefined);
  const { container } = render(<PackOffer surface="feed" />);
  expect(container).toBeEmptyDOMElement();
  expect(record).not.toHaveBeenCalled();
  expect(captureAnalytics).not.toHaveBeenCalled();
});

it("opens where the person left it, without counting them as shown again", () => {
  vi.mocked(useQuery).mockReturnValue({ shown: true, clicked: true, notify: false });
  const { unmount } = render(<PackOffer surface="remix" />);
  expect(screen.getByRole("button", noticeButton)).toBeInTheDocument();
  expect(record).not.toHaveBeenCalled();
  expect(captureAnalytics).not.toHaveBeenCalled();
  unmount();

  vi.mocked(useQuery).mockReturnValue({ shown: true, clicked: true, notify: true });
  render(<PackOffer surface="remix" />);
  expect(screen.getByText(/We'll let you know when packs are on sale/)).toBeInTheDocument();
});

it("announces its reply itself in the Remix panel, and leaves that to the card on the feed", () => {
  const { unmount } = render(<PackOffer surface="remix" />);
  expect(screen.getByRole("status")).toContainElement(screen.getByRole("button", getButton));
  unmount();
  render(<PackOffer surface="feed" />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows nothing, not the page's error screen, when the backend doesn't have its query yet", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useQuery).mockImplementation(() => {
    throw new Error("Could not find public function for 'core/packInterest:getMine'");
  });
  const { container } = render(
    <div>
      <p>The feed</p>
      <PackOffer surface="feed" />
    </div>,
  );
  expect(screen.getByText("The feed")).toBeInTheDocument();
  expect(container.querySelector("button")).toBeNull();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});
