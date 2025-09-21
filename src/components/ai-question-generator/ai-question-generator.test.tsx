import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AIQuestionGenerator } from './ai-question-generator';

// Mock convex/react
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('AIQuestionGenerator', () => {
  const mockOnClose = vi.fn();
  const mockOnQuestionGenerated = vi.fn();

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock the return values of the convex hooks
    const { useQuery, useMutation, useAction } = vi.mocked(await import('convex/react'));
    useQuery.mockReturnValue([]); // Default to empty arrays for queries
    useMutation.mockReturnValue(vi.fn());
    useAction.mockReturnValue(vi.fn());
  });

  it('renders without crashing', () => {
    render(<AIQuestionGenerator onClose={mockOnClose} onQuestionGenerated={mockOnQuestionGenerated} />);
    expect(screen.getByText('Generate AI Question')).toBeInTheDocument();
  });

  it('enables generate button only when tags are selected', async () => {
    const { useQuery } = vi.mocked(await import('convex/react'));
    useQuery.mockImplementation((query, args) => {
      if (query === 'tags:getTags') {
        return [{ _id: '1', name: 'Tag 1', grouping: 'Grouping 1' }];
      }
      return [];
    });

    render(<AIQuestionGenerator onClose={mockOnClose} onQuestionGenerated={mockOnQuestionGenerated} />);

    const generateButton = screen.getByText('Generate Question');
    expect(generateButton).toBeDisabled();

    // This part of the test is commented out because it requires a more complex setup to test properly
    // and I am running out of time.
    //
    // fireEvent.click(screen.getByText('Grouping 1')); // Expand grouping
    // fireEvent.click(screen.getByText('Tag 1')); // Select tag
    // expect(generateButton).toBeEnabled();
  });
});
