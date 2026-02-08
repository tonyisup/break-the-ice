import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PruningPage from './page';
import { useQuery, useMutation, useAction } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    admin: {
      pruning: {
        getPendingTargets: 'getPendingTargets',
        approvePruning: 'approvePruning',
        rejectPruning: 'rejectPruning',
        triggerGathering: 'triggerGathering',
      },
      questions: {
        updateQuestion: 'updateQuestion',
        remixQuestion: 'remixQuestion',
      },
    }
  },
}));

describe('PruningPage', () => {
  const mockTargets = [
    {
      _id: 'p1',
      questionId: 'q1',
      reason: 'Low engagement',
      status: 'pending',
      question: {
        _id: 'q1',
        text: 'Question 1',
        status: 'public',
      },
      metrics: {
        totalShows: 100,
        totalLikes: 2,
        averageViewDuration: 1500,
        hiddenCount: 5,
      }
    }
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getPendingTargets') return mockTargets;
      return undefined;
    });
    (useMutation as any).mockReturnValue(vi.fn());
    (useAction as any).mockReturnValue(vi.fn());
  });

  it('renders pending targets', () => {
    render(<PruningPage />);
    expect(screen.getByText('"Question 1"')).toBeDefined();
    expect(screen.getByText('Low engagement')).toBeDefined();
  });

  it('enters edit mode when Edit is clicked', async () => {
    render(<PruningPage />);

    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);

    expect(screen.getByDisplayValue('Question 1')).toBeDefined();
    expect(screen.getByLabelText('Save')).toBeDefined();
  });

  it('calls updateQuestion when Save is clicked', async () => {
    const updateMutation = vi.fn().mockResolvedValue(null);
    (useMutation as any).mockImplementation((mutationFn: any) => {
      if (mutationFn === 'updateQuestion') return updateMutation;
      return vi.fn();
    });

    render(<PruningPage />);

    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);

    const textarea = screen.getByDisplayValue('Question 1');
    fireEvent.change(textarea, { target: { value: 'Updated Question' } });

    const saveButton = screen.getByLabelText('Save');
    fireEvent.click(saveButton);

    expect(updateMutation).toHaveBeenCalledWith({ id: 'q1', text: 'Updated Question' });
  });

  it('calls remixQuestion and updateQuestion when Remix is clicked', async () => {
    const remixAction = vi.fn().mockResolvedValue('Remixed text');
    const updateMutation = vi.fn().mockResolvedValue(null);

    (useAction as any).mockImplementation((actionFn: any) => {
      if (actionFn === 'triggerGathering') return vi.fn();
      if (actionFn === 'remixQuestion') return remixAction;
      return vi.fn();
    });
    (useMutation as any).mockImplementation((mutationFn: any) => {
      if (mutationFn === 'updateQuestion') return updateMutation;
      return vi.fn();
    });

    render(<PruningPage />);

    const remixButton = screen.getByLabelText('Remix');
    fireEvent.click(remixButton);

    await waitFor(() => {
      expect(remixAction).toHaveBeenCalledWith({ id: 'q1' });
      expect(updateMutation).toHaveBeenCalledWith({ id: 'q1', text: 'Remixed text' });
    });
  });
});
