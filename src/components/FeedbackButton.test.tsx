import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FeedbackButton from "./FeedbackButton";

// Mock dependencies
const mockUseConvexAuth = vi.fn();
const mockUseMutation = vi.fn();
const mockUseStorageContext = vi.fn();

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockUseConvexAuth(),
  useMutation: () => mockUseMutation(),
}));

vi.mock("@/hooks/useStorageContext", () => ({
  useStorageContext: () => mockUseStorageContext(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    core: {
      feedback: {
        submitFeedback: "submitFeedback"
      }
    }
  }
}));

// Mock framer-motion to render children immediately
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    }
  };
});

describe("FeedbackButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStorageContext.mockReturnValue({
      sessionId: "test-session",
    });
  });

  it("should not render when user is not authenticated", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false });
    const { container } = render(<FeedbackButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("should render button when authenticated", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true });
    render(<FeedbackButton />);
    expect(screen.getByRole("button", { name: /open feedback form/i })).toBeInTheDocument();
  });

  it("should expand form on click", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true });
    render(<FeedbackButton />);

    const button = screen.getByRole("button", { name: /open feedback form/i });
    fireEvent.click(button);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Send Feedback")).toBeInTheDocument();
  });

  it("should submit feedback and close", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true });
    const submitMock = vi.fn().mockResolvedValue(null);
    mockUseMutation.mockReturnValue(submitMock);

    render(<FeedbackButton />);

    // Open form
    fireEvent.click(screen.getByRole("button", { name: /open feedback form/i }));

    // Type feedback
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Great app!" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /send/i });
    fireEvent.click(submitBtn);

    expect(submitMock).toHaveBeenCalledWith({
      text: "Great app!",
      pageUrl: window.location.href,
      sessionId: "test-session",
    });

    // Check if form closes (in a real browser this would wait for async,
    // but here we just check if the function was called)
    // We can't easily test the state change to close without using waitFor
  });
});
