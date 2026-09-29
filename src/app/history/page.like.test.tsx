import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { QuestionList } from '@/components/question-list/QuestionList';
import HistoryPage from './page';

const mockUseStorageContext = vi.fn();
const recordAnalytics = vi.fn();

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isSignedIn: false }),
}));
vi.mock('@/hooks/useStorageContext', () => ({
  useStorageContext: () => mockUseStorageContext(),
}));
vi.mock('../../hooks/useQuestionHistory', () => ({
  useQuestionHistory: () => ({
    history: [{ question: { _id: 'q1', text: 'Seen before' }, viewedAt: 1000 }],
    removeQuestionHistoryEntry: vi.fn(),
    clearHistoryEntries: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ effectiveTheme: 'light' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/header', () => ({ Header: () => <div>Header</div> }));
vi.mock('@/components/filter-controls/filter-controls', () => ({ FilterControls: () => null }));
vi.mock('@/components/SignInCTA', () => ({ SignInCTA: () => null }));
vi.mock('@/components/question-list/QuestionList', () => ({ QuestionList: vi.fn(() => null) }));

describe('HistoryPage like analytics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recordAnalytics.mockResolvedValue(null);
    (useMutation as Mock).mockReturnValue(recordAnalytics);
    (useQuery as Mock).mockReturnValue(undefined);
    (QuestionList as unknown as Mock).mockReturnValue(null);
  });

  it("sends the visitor's local session id with a like from history", async () => {
    const addLikedQuestion = vi.fn();
    mockUseStorageContext.mockReturnValue({
      sessionId: 'local-session',
      likedQuestions: [],
      hiddenQuestions: [],
      addLikedQuestion,
      removeLikedQuestion: vi.fn(),
      addHiddenQuestion: vi.fn(),
      removeHiddenQuestion: vi.fn(),
      addHiddenStyle: vi.fn(),
      addHiddenTone: vi.fn(),
      setQuestionHistory: vi.fn(),
    });
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);

    const props = (QuestionList as unknown as Mock).mock.calls.at(-1)?.[0];
    await act(async () => { props.onToggleLike('q1'); });

    expect(addLikedQuestion).toHaveBeenCalledWith('q1');
    expect(recordAnalytics).toHaveBeenCalledWith({
      questionId: 'q1',
      event: 'liked',
      viewDuration: 0,
      sessionId: 'local-session',
    });
  });
});
