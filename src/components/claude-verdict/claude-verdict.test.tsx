import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClaudeFlagDetails, ClaudeVerdict } from "./claude-verdict";

const hold = {
  verdict: "hold" as const,
  reasons: ["awkward_wording" as const, "unclear_answer" as const],
  safety: ["targets_person"],
  note: "Two questions in one.",
  wouldPublish: false,
};

describe("ClaudeVerdict", () => {
  it("shows a hold with its reasons, safety flags and note", () => {
    render(<ClaudeVerdict check={hold} />);

    expect(screen.getByText("Claude: hold")).toBeInTheDocument();
    expect(screen.getByText("Awkward wording")).toBeInTheDocument();
    expect(screen.getByText("Unclear answer")).toBeInTheDocument();
    expect(screen.getByText("Targets a person")).toBeInTheDocument();
    expect(screen.getByText("Two questions in one.")).toBeInTheDocument();
    expect(screen.queryByText("Would publish")).toBeNull();
  });

  it("marks a keep that is sure enough to publish, and leaves the mark off one that isn't", () => {
    const keep = { verdict: "keep" as const, reasons: [], safety: [], note: "Clear and easy.", wouldPublish: true };
    const { rerender } = render(<ClaudeVerdict check={keep} />);
    expect(screen.getByText("Claude: keep")).toBeInTheDocument();
    expect(screen.getByText("Would publish")).toBeInTheDocument();

    rerender(<ClaudeVerdict check={{ ...keep, wouldPublish: false }} />);
    expect(screen.getByText("Claude: keep")).toBeInTheDocument();
    expect(screen.queryByText("Would publish")).toBeNull();
  });

  it("shows a safety category it has no label for by its name", () => {
    render(<ClaudeVerdict check={{ ...hold, safety: ["something_new"] }} />);
    expect(screen.getByText("something_new")).toBeInTheDocument();
  });
});

describe("ClaudeFlagDetails", () => {
  it("says the question was flagged, why, and the note", () => {
    render(<ClaudeFlagDetails flag={hold} />);

    expect(screen.getByText("Flagged by Claude")).toBeInTheDocument();
    expect(screen.getByText("Awkward wording")).toBeInTheDocument();
    expect(screen.getByText("Targets a person")).toBeInTheDocument();
    expect(screen.getByText("Two questions in one.")).toBeInTheDocument();
  });

  it("shows just its heading, with no empty note line, when the judge gave no reasons, flags or note", () => {
    const { container, rerender } = render(<ClaudeFlagDetails flag={{ reasons: [], safety: [], note: "" }} />);
    expect(screen.getByText("Flagged by Claude")).toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toBe("Flagged by Claude");

    rerender(<ClaudeVerdict check={{ verdict: "hold", reasons: [], safety: [], note: "", wouldPublish: false }} />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toBe("Claude: hold");
  });
});
