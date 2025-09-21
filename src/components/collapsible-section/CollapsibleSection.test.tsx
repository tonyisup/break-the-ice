import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CollapsibleSection } from "./CollapsibleSection";
import React from "react";

describe("CollapsibleSection", () => {
  const mockOnOpenChange = vi.fn();
  const title = "Test Title";
  const childText = "Child Content";

  beforeEach(() => {
    mockOnOpenChange.mockClear();
  });

  it("renders the title", () => {
    render(
      <CollapsibleSection
        title={title}
        isOpen={true}
        onOpenChange={mockOnOpenChange}
      >
        <div>{childText}</div>
      </CollapsibleSection>
    );
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("shows children when isOpen is true", () => {
    render(
      <CollapsibleSection
        title={title}
        isOpen={true}
        onOpenChange={mockOnOpenChange}
      >
        <div>{childText}</div>
      </CollapsibleSection>
    );
    expect(screen.getByText(childText)).toBeInTheDocument();
  });

  it("hides children when isOpen is false", () => {
    render(
      <CollapsibleSection
        title={title}
        isOpen={false}
        onOpenChange={mockOnOpenChange}
      >
        <div>{childText}</div>
      </CollapsibleSection>
    );
    expect(screen.queryByText(childText)).not.toBeInTheDocument();
  });

  it("calls onOpenChange when the header is clicked", () => {
    render(
      <CollapsibleSection
        title={title}
        isOpen={false}
        onOpenChange={mockOnOpenChange}
      >
        <div>{childText}</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByText(title));
    expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
    expect(mockOnOpenChange).toHaveBeenCalledWith(true);
  });
});
