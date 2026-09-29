import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { getFunctionName } from 'convex/server';
import QuestionPage from './page';

const mockUseStorageContext = vi.fn();
const recordAnalytics = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'q1' }),
    useNavigate: () => vi.fn(),
  };
});
vi.mock('convex/react', async () => {
  const actual = await vi.importActual('convex/react');
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useConvexAuth: vi.fn(() => ({ isAuthenticated: false })),
  };
});
vi.mock('../../hooks/useStorageContext', () => ({
  useStorageContext: () => mockUseStorageContext(),
}));
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));
vi.mock('../../hooks/useQuestionHistory', () => ({
  useQuestionHistory: () => ({ addQuestionHistoryEntry: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/components/header', () => ({ Header: () => <div>Header</div> }));

function storage(sessionId: string) {
  return {
    sessionId,
    likedQuestions: [],
    hiddenQuestions: [],
    likedLimit: Infinity,
    hiddenLimit: Infinity,
    storageLimitBehavior: 'replace',
    addLikedQuestion: vi.fn(),
    removeLikedQuestion: vi.fn(),
    addHiddenQuestion: vi.fn(),
    removeHiddenQuestion: vi.fn(),
    addHiddenStyle: vi.fn(),
    addHiddenTone: vi.fn(),
  };
}

describe('QuestionPage like analytics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recordAnalytics.mockResolvedValue(null);
    (useMutation as Mock).mockReturnValue(recordAnalytics);
    (useQuery as Mock).mockImplementation((ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === 'skip') return undefined;
      return getFunctionName(ref) === 'core/questions:getQuestionById'
        ? { _id: 'q1', text: 'A shared question' }
        : undefined;
    });
  });

  it("sends the visitor's local session id so an anonymous like counts once", async () => {
    const context = storage('local-session');
    mockUseStorageContext.mockReturnValue(context);
    render(<MemoryRouter><QuestionPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));

    await waitFor(() => expect(recordAnalytics).toHaveBeenCalledWith({
      questionId: 'q1',
      event: 'liked',
      viewDuration: 0,
      sessionId: 'local-session',
    }));
    expect(context.addLikedQuestion).toHaveBeenCalledWith('q1');
  });

  it('omits an empty session id', async () => {
    mockUseStorageContext.mockReturnValue(storage(''));
    render(<MemoryRouter><QuestionPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));

    await waitFor(() => expect(recordAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'liked', sessionId: undefined }),
    ));
  });
});
