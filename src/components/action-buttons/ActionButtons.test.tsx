import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionButtons } from "./ActionButtons";
import { QuestionStateProvider } from "@/hooks/useQuestionState";
import { Doc } from "../../../convex/_generated/dataModel";

vi.mock('@/hooks/useQuestionState', () => ({
    useQuestionState: () => ({
        isShuffling: false,
        isStyleTonesOpen: true,
        handleShuffleStyleAndTone: vi.fn(),
        handleConfirmRandomizeStyleAndTone: vi.fn(),
        handleCancelRandomizeStyleAndTone: vi.fn(),
        getNextQuestion: vi.fn(),
    }),
    QuestionStateProvider: ({ children } : { children: React.ReactNode }) => <div>{children}</div>
}));

describe("ActionButtons", () => {
  const mockProps = {
    isColorDark: vi.fn(),
    gradient: ["#ffffff", "#000000"],
    isGenerating: false,
    currentQuestion: { _id: "123" } as Doc<"questions">,
    handleShuffleStyleAndTone: vi.fn(),
    handleConfirmRandomizeStyleAndTone: vi.fn(),
    handleCancelRandomizeStyleAndTone: vi.fn(),
    getNextQuestion: vi.fn(),
    isStyleTonesOpen: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ActionButtons {...mockProps} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
    expect(screen.getByTitle("New Question / Confirm Shuffle")).toBeInTheDocument();
  });

  it('renders Cancel, Shuffle, and New buttons when isShuffling is true', () => {
      vi.mock('@/hooks/useQuestionState', () => ({
          useQuestionState: () => ({
              isShuffling: true,
          }),
          QuestionStateProvider: ({ children } : { children: React.ReactNode }) => <div>{children}</div>
      }));
    render(<ActionButtons {...mockProps} />);
    expect(screen.getByTitle("Cancel Shuffle")).toBeInTheDocument();
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeInTheDocument();
    expect(screen.getByTitle("New Question / Confirm Shuffle")).toBeInTheDocument();
  });

  it('calls the correct functions when buttons are clicked', () => {
    render(<ActionButtons {...mockProps} />);
    fireEvent.click(screen.getByTitle("Shuffle Style and Tone"));
    expect(mockProps.handleShuffleStyleAndTone).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("New Question / Confirm Shuffle"));
    expect(mockProps.handleConfirmRandomizeStyleAndTone).toHaveBeenCalledTimes(1);
  });

  it('disables buttons when isGenerating is true', () => {
    render(<ActionButtons {...mockProps} isGenerating={true} disabled={true} />);
    expect(screen.getByTitle("Shuffle Style and Tone")).toBeDisabled();
    expect(screen.getByTitle("New Question / Confirm Shuffle")).toBeDisabled();
  });
});
