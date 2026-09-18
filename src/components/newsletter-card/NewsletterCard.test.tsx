import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterCard } from "./NewsletterCard";

const subscribe = vi.fn();
vi.mock("convex/react", () => ({ useAction: () => subscribe }));

beforeEach(() => { subscribe.mockReset(); });

describe("newsletter states", () => {
  it("exposes only the signup form until a subscription actually succeeds", async () => {
    subscribe.mockResolvedValue({ status: "verification_required", success: true });
    render(<NewsletterCard />);
    expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
    expect(screen.queryByText("You're subscribed")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a question" }));
    await screen.findByText("Check your email");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Email me a question" })).not.toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledWith({ email: "reader@example.com" });
  });

  it("keeps the form available with an accessible error when delivery fails", async () => {
    subscribe.mockRejectedValue(new Error("Connection failed"));
    render(<NewsletterCard prefilledEmail="reader@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Email me a question" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't subscribe"));
    expect(screen.getByLabelText("Email address")).toHaveValue("reader@example.com");
    expect(screen.getByRole("button", { name: "Email me a question" })).toBeEnabled();
    expect(screen.queryByText("You're subscribed")).not.toBeInTheDocument();
  });
});
