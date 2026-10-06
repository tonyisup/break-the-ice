import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClaudeConcernBadge, ClaudeFlagDetails, ClaudeVerdict } from "./claude-verdict";

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

  it("shows a safety category it has no label for by its name, and names every safety flag as one in words", () => {
    render(<ClaudeVerdict check={{ ...hold, safety: ["something_new", "trauma"] }} />);
    expect(screen.getByText("something_new")).toBeInTheDocument();
    expect(screen.getAllByText(/^Safety:/)).toHaveLength(2);
  });

  it("says the verdict is about the saved question while an edit to what it read is pending", () => {
    const { rerender } = render(<ClaudeVerdict check={hold} />);
    expect(screen.queryByText(/Saving this edit clears it/)).toBeNull();

    rerender(<ClaudeVerdict check={hold} outdated />);
    expect(screen.getByText("About the saved question. Saving this edit clears it.")).toBeInTheDocument();
  });

  it("shows a keep with a safety flag as a concern, not as a plain keep", () => {
    const keep = { verdict: "keep" as const, reasons: [], safety: [], note: "Clear and easy.", wouldPublish: false };
    const { container, rerender } = render(<ClaudeVerdict check={keep} />);
    expect(container.firstElementChild?.className).not.toContain("amber");

    rerender(<ClaudeVerdict check={{ ...keep, safety: ["trauma"] }} />);
    expect(container.firstElementChild?.className).toContain("bg-amber-500/10");
    expect(screen.getByText("Claude: keep")).toBeInTheDocument();
    expect(screen.getByText("Trauma")).toBeInTheDocument();
  });
});

describe("ClaudeConcernBadge", () => {
  it("is one line for a hold or a safety flag, and nothing for a plain keep", () => {
    const keep = { verdict: "keep" as const, safety: [] as string[], note: "Clear and easy." };
    const { container, rerender } = render(<ClaudeConcernBadge check={keep} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ClaudeConcernBadge check={{ ...keep, safety: ["trauma"] }} />);
    expect(screen.getByText("Claude: safety flag")).toBeInTheDocument();

    rerender(<ClaudeConcernBadge check={{ verdict: "hold", safety: [], note: "Stiff phrasing." }} />);
    expect(screen.getByText("Claude: hold")).toHaveAttribute("title", "Stiff phrasing.");

    // A safety flag is named on a hold too, in the safety colour, so it stands apart in a list.
    rerender(<ClaudeConcernBadge check={{ verdict: "hold", safety: ["trauma"], note: "" }} />);
    expect(screen.getByText("Claude: hold, safety flag").className).toContain("text-red-700");
  });
});

describe("ClaudeFlagDetails", () => {
  it("says the question was flagged by an automated check, why, and that the choice is the reader's", () => {
    render(<ClaudeFlagDetails flag={hold} />);

    expect(screen.getByText("Flagged by AI review")).toBeInTheDocument();
    expect(screen.getByText("Awkward wording")).toBeInTheDocument();
    expect(screen.getByText("Targets a person")).toBeInTheDocument();
    expect(screen.getByText("Two questions in one.")).toBeInTheDocument();
    expect(screen.getByText("An automated check raised this. You decide whether to use it.")).toBeInTheDocument();
  });

  it("leaves no empty note line when the judge gave no note", () => {
    const { container, rerender } = render(<ClaudeFlagDetails flag={{ reasons: ["awkward_wording"], safety: [], note: "" }} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).toBe("Flagged by AI reviewAwkward wordingAn automated check raised this. You decide whether to use it.");

    rerender(<ClaudeVerdict check={{ verdict: "hold", reasons: ["awkward_wording"], safety: [], note: "", wouldPublish: false }} />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toBe("Claude: holdAwkward wording");
  });
});
