import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionButtons } from "./ActionButtons";

describe("ActionButtons", () => {
  const mockProps = {
    isColorDark: vi.fn(),
    gradient: ["#ffffff", "#000000"],
    isGenerating: false,
    currentQuestion: null,
    randomizedStyle: null,
    randomizedTone: null,
    handleShuffleStyleAndTone: vi.fn(),
    handleConfirmRandomizeStyleAndTone: vi.fn(),
    handleCancelRandomizeStyleAndTone: vi.fn(),
    getNextQuestion: vi.fn(),
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={true} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
    expect(screen.getByTitle("Next Question")).toBeInTheDocument();
  });

  it('renders a single button when isStyleTonesOpen is false', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={false} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
    expect(screen.queryByTitle("Next Question")).not.toBeInTheDocument();
  });

  it('calls the correct functions when buttons are clicked', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={true} />);
    fireEvent.click(screen.getByTitle("Shuffle Style and Tone"));
    expect(mockProps.handleShuffleStyleAndTone).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Next Question"));
    expect(mockProps.getNextQuestion).toHaveBeenCalledTimes(1);
  });

  it('disables buttons when disabled prop is true', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={true} disabled={true} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeDisabled();
    expect(screen.getByTitle("Next Question")).toBeDisabled();
  });
});
