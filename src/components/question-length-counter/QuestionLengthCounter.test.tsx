import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionLengthCounter } from "./QuestionLengthCounter";
import { ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../../../convex/constants";

describe("QuestionLengthCounter", () => {
  it("shows the draft length against the limit without announcing it", () => {
    render(<QuestionLengthCounter id="length" length={42} />);

    expect(document.getElementById("length")).toHaveTextContent(`42/${MAX_QUESTION_TEXT_LENGTH} characters`);
    expect(screen.queryByText(ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG)).not.toBeInTheDocument();
  });

  it("tells screen readers when the draft reaches the limit", () => {
    render(<QuestionLengthCounter id="length" length={MAX_QUESTION_TEXT_LENGTH} />);

    expect(document.getElementById("length")).toHaveClass("text-red-600", "dark:text-red-400");
    expect(screen.getByText(ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG)).toHaveAttribute("aria-live", "polite");
  });
});
