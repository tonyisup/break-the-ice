import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { ModernQuestionCard } from '@/components/modern-question-card/modern-question-card';
import LikedQuestionsPage from './page';

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isSignedIn: true }),
  useClerk: () => ({ openSignIn: vi.fn() }),
}));
vi.mock('@/hooks/useTeamWorkspace', () => ({
  useTeamWorkspace: () => ({ activeWorkspace: null, teamWorkspaceId: undefined }),
}));
vi.mock('../../hooks/useStorageContext', () => ({
  useStorageContext: () => ({
    likedQuestions: [],
    likedLimit: 100,
    hiddenQuestions: [],
    addLikedQuestion: vi.fn(),
    removeLikedQuestion: vi.fn(),
    setLikedQuestions: vi.fn(),
    clearLikedQuestions: vi.fn(),
    addHiddenQuestion: vi.fn(),
    removeHiddenQuestion: vi.fn(),
    addHiddenStyle: vi.fn(),
    addHiddenTone: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ effectiveTheme: 'light' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/header', () => ({ Header: () => <div>Header</div> }));
vi.mock('@/components/filter-controls/filter-controls', () => ({ FilterControls: () => null }));
vi.mock('@/components/SignInCTA', () => ({ SignInCTA: () => null }));
vi.mock('@/components/add-personal-question-dialog/AddPersonalQuestionDialog', () => ({
  AddPersonalQuestionDialog: () => null,
}));
vi.mock('@/components/add-to-collection-menu/AddToCollectionMenu', () => ({ AddToCollectionMenu: () => null }));
vi.mock('@/components/modern-question-card/modern-question-card', () => ({ ModernQuestionCard: vi.fn(() => null) }));

const personalQuestion = { _id: 'q1', customText: 'What did you learn this week?', status: 'private' };

async function deleteFromStash(failure: unknown) {
  const deletePersonalQuestion = vi.fn().mockRejectedValue(failure);
  (useMutation as Mock).mockReturnValue(deletePersonalQuestion);
  render(<MemoryRouter><LikedQuestionsPage /></MemoryRouter>);

  const props = (ModernQuestionCard as unknown as Mock).mock.calls
    .map(([cardProps]) => cardProps)
    .find((cardProps) => cardProps.question._id === 'q1' && cardProps.onDelete);
  await act(async () => { props.onDelete(); });

  expect(deletePersonalQuestion).toHaveBeenCalledWith({ questionId: 'q1' });
}

describe('LikedQuestionsPage personal stash', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (ModernQuestionCard as unknown as Mock).mockReturnValue(null);
    // Only the personal stash query takes an organization; the rest load nothing.
    (useQuery as Mock).mockImplementation((_query: unknown, args: Record<string, unknown> | undefined) =>
      args && 'organizationId' in args ? [personalQuestion] : undefined,
    );
  });

  it('shows the reason the server gives when a delete is refused', async () => {
    await deleteFromStash(new ConvexError({ code: 'SOME_CODE', message: 'This question is in use, so it stays.' }));

    expect(toast.error).toHaveBeenCalledWith('This question is in use, so it stays.');
  });

  it('falls back to the generic message for other errors', async () => {
    await deleteFromStash(new Error('Network down'));

    expect(toast.error).toHaveBeenCalledWith('Failed to delete question.');
  });
});
