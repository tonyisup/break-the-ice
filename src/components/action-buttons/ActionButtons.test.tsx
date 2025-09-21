import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionButtons } from "./ActionButtons";

describe("ActionButtons", () => {
  const mockProps = {
    isColorDark: vi.fn(),
    gradient: ["#ffffff", "#000000"],
    isGenerating: false,
    handleShuffleStyleAndTone: vi.fn(),
    handleConfirmRandomizeStyleAndTone: vi.fn(),
    handleCancelRandomizeStyleAndTone: vi.fn(),
    getNextQuestion: vi.fn(),
    isHighlighting: false,
    setIsHighlighting: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={true} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
  });

  it('renders a single button when isStyleTonesOpen is false', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={false} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
  });

  it('calls the correct functions when buttons are clicked', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={false} />);
    fireEvent.click(screen.getByTitle("Shuffle Style and Tone"));
    expect(mockProps.handleShuffleStyleAndTone).toHaveBeenCalledTimes(1);
  });

  it('disables buttons when isGenerating prop is true', () => {
    render(<ActionButtons {...mockProps} isStyleTonesOpen={false} isGenerating={true} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeDisabled();
  });
});
