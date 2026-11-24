import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationTrace } from "./GenerationTrace";

const line = (title: string) => screen.getByText(title).closest("[data-slot=trace-line]");

describe("GenerationTrace", () => {
  it("starts on the first step before the server's first update", () => {
    render(<GenerationTrace stage={undefined} />);
    expect(line("Reading your preferences")).toHaveAttribute("data-status", "running");
    expect(line("Writing your questions")).toHaveAttribute("data-status", "pending");
  });

  it("marks earlier steps finished and the current one running", () => {
    render(<GenerationTrace stage="thinking" />);
    expect(line("Connected to the writer")).not.toHaveAttribute("data-status");
    expect(line("Thinking through ideas")).toHaveAttribute("data-status", "running");
    expect(screen.getByRole("status")).toHaveTextContent("Thinking through ideas…");
  });

  it("holds the last step on a failure, with no error flash before the feed explains it", () => {
    const { rerender } = render(<GenerationTrace stage="writing" />);
    rerender(<GenerationTrace stage="failed" />);
    expect(line("Writing your questions")).toHaveAttribute("data-status", "running");
    expect(document.querySelector("[data-status=error]")).toBeNull();
  });

  it("shows every step finished when done", () => {
    render(<GenerationTrace stage="done" />);
    expect(line("Checked for repeats")).not.toHaveAttribute("data-status");
    expect(screen.getByRole("status")).toHaveTextContent("New questions are ready.");
  });
});
