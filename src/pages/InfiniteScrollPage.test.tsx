import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import InfiniteScrollPage from './InfiniteScrollPage';
import { useQuery, useConvex, useAction, useMutation } from 'convex/react';
import { WorkspaceProvider } from '@/hooks/useWorkspace.tsx';
import { ModernQuestionCard } from '@/components/modern-question-card';
import { NewsletterCard } from '@/components/newsletter-card/NewsletterCard';

// Hoisted mocks for dynamic control
const mockUseAuth = vi.fn();
const mockUseUser = vi.fn();
const mockUseStorageContext = vi.fn();

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useConvex: vi.fn(),
  useAction: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

vi.mock('@/hooks/useStorageContext', () => ({
  useStorageContext: () => mockUseStorageContext(),
}));

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('@/components/header', () => ({
  Header: () => <div>Header</div>,
}));

vi.mock('@/components/modern-question-card', () => ({
  ModernQuestionCard: vi.fn(() => <div data-testid="modern-question-card">Card</div>),
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => mockUseAuth(),
  useUser: () => mockUseUser(),
  SignInButton: ({ children }: any) => <div data-testid="sign-in-button">{children}</div>,
}));

vi.mock('@/components/SignInCTA', () => ({
  SignInCTA: vi.fn(() => <div data-testid="sign-in-cta">Sign In CTA</div>),
}));

vi.mock('@/components/newsletter-card/NewsletterCard', () => ({
  NewsletterCard: vi.fn((props) => <div data-testid="newsletter-card" data-prefilled={props.prefilledEmail}>Newsletter</div>),
}));

// Mock api object structure
vi.mock('../../convex/_generated/api', () => ({
  api: {
    core: {
      styles: { getStyles: 'getStyles', getStyle: 'getStyle' },
      tones: { getTones: 'getTones', getTone: 'getTone' },
      questions: { getNextRandomQuestions: 'getNextRandomQuestions', recordAnalytics: 'recordAnalytics' },
      ai: { generateAIQuestionForFeed: 'generateAIQuestionForFeed' },
      users: { getCurrentUser: 'getCurrentUser' },
    }
  },
}));

describe('InfiniteScrollPage', () => {
  const mockStyles = [
    { _id: 'style1', id: 'style1', color: '#111111', name: 'Style One' },
    { _id: 'style2', id: 'style2', color: '#222222', name: 'Style Two' },
  ];
  const mockTones = [
    { _id: 'tone1', id: 'tone1', color: '#AAAAAA', name: 'Tone One' },
    { _id: 'tone2', id: 'tone2', color: '#BBBBBB', name: 'Tone Two' },
  ];
  const mockQuestions = [
    { _id: 'q1', text: 'Q1', style: 'style1', tone: 'tone1' },
    { _id: 'q2', text: 'Q2', style: 'style2', tone: 'tone2' },
    { _id: 'q3', text: 'Q3', style: 'style1', tone: 'tone1' },
    { _id: 'q4', text: 'Q4', style: 'style2', tone: 'tone2' },
    { _id: 'q5', text: 'Q5', style: 'style1', tone: 'tone1' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    // Default auth state: Signed In
    mockUseAuth.mockReturnValue({ isSignedIn: true, userId: 'user123', isLoaded: true });
    mockUseUser.mockReturnValue({ isSignedIn: true, user: { id: 'user123' }, isLoaded: true });

    // Default storage context
    mockUseStorageContext.mockReturnValue({
      likedQuestions: [],
      hiddenQuestions: [],
      hiddenStyles: [],
      hiddenTones: [],
      addHiddenStyle: vi.fn(),
      addHiddenTone: vi.fn(),
      addLikedQuestion: vi.fn(),
      removeLikedQuestion: vi.fn(),
      addHiddenQuestion: vi.fn(),
      addQuestionToHistory: vi.fn(),
      defaultStyle: 'style1',
      defaultTone: 'tone1',
    });

    // Mock IntersectionObserver
    global.IntersectionObserver = class IntersectionObserver {
      constructor(callback: any) { }
      observe() { }
      unobserve() { }
      disconnect() { }
    } as any;

    (useConvex as any).mockReturnValue({
      query: vi.fn().mockResolvedValue(mockQuestions),
      action: vi.fn().mockResolvedValue(mockQuestions),
    });
    (useAction as any).mockReturnValue(vi.fn().mockResolvedValue([]));
    (useMutation as any).mockReturnValue(vi.fn());

    // Mock useQuery
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getStyles') return mockStyles;
      if (queryFn === 'getTones') return mockTones;
      if (queryFn === 'getStyle') return mockStyles[0];
      if (queryFn === 'getTone') return mockTones[0];
      // Default currentUser mock: logged in user, not subscribed
      if (queryFn === 'getCurrentUser') return { _id: 'u1', email: 'test@example.com', newsletterSubscriptionStatus: null };
      return undefined;
    });
  });

  it('renders cards with specific styles and tones', async () => {
    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(5);
    });
  });

  it('shows NewsletterCard when not signed in', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, userId: null, isLoaded: true });
    // currentUser returns null when not signed in
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getCurrentUser') return null;
      if (queryFn === 'getStyles') return mockStyles;
      if (queryFn === 'getTones') return mockTones;
      return undefined;
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      const card = screen.getByTestId('newsletter-card');
      expect(card).toBeDefined();
      // Should not have prefilled email
      expect(card.getAttribute('data-prefilled')).toBe(null);
    });
  });

  it('shows NewsletterCard when signed in but not subscribed', async () => {
    // Auth mocked in beforeEach as signed in
    // currentUser mocked in beforeEach as status: null

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      const card = screen.getByTestId('newsletter-card');
      expect(card).toBeDefined();
      // Should have prefilled email
      expect(card.getAttribute('data-prefilled')).toBe('test@example.com');
    });
  });

  it('hides NewsletterCard when signed in and subscribed', async () => {
    // Override currentUser mock
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getCurrentUser') return { _id: 'u1', email: 'test@example.com', newsletterSubscriptionStatus: 'subscribed' };
      if (queryFn === 'getStyles') return mockStyles;
      if (queryFn === 'getTones') return mockTones;
      return undefined;
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('newsletter-card')).toBeNull();
    });
  });

  it('displays blocked message when all styles are hidden', async () => {
    mockUseStorageContext.mockReturnValue({
      likedQuestions: [],
      hiddenQuestions: [],
      hiddenStyles: ['style1', 'style2'],
      hiddenTones: [],
      addHiddenStyle: vi.fn(),
      addHiddenTone: vi.fn(),
      addLikedQuestion: vi.fn(),
      removeLikedQuestion: vi.fn(),
      addHiddenQuestion: vi.fn(),
      addQuestionToHistory: vi.fn(),
      defaultStyle: 'style1',
      defaultTone: 'tone1',
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('All Styles Hidden')).toBeDefined();
    });
  });

  it('displays blocked message when all tones are hidden', async () => {
    mockUseStorageContext.mockReturnValue({
      likedQuestions: [],
      hiddenQuestions: [],
      hiddenStyles: [],
      hiddenTones: ['tone1', 'tone2'],
      addHiddenStyle: vi.fn(),
      addHiddenTone: vi.fn(),
      addLikedQuestion: vi.fn(),
      removeLikedQuestion: vi.fn(),
      addHiddenQuestion: vi.fn(),
      addQuestionToHistory: vi.fn(),
      defaultStyle: 'style1',
      defaultTone: 'tone1',
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('All Tones Hidden')).toBeDefined();
    });
  });

  it('calls getNextRandomQuestions with randomSeed', async () => {
    const actionMock = vi.fn().mockResolvedValue([]);
    (useConvex as any).mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      action: actionMock,
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledWith(
        'getNextRandomQuestions',
        expect.objectContaining({
          randomSeed: expect.any(Number),
        })
      );
    });
  });

  it('sorts the first batch of questions by text length', async () => {
    const questionsWithDifferentLengths = [
      { _id: 'q1', text: 'This is a long question text', style: 'style1', tone: 'tone1' },
      { _id: 'q2', text: 'Short', style: 'style2', tone: 'tone2' },
      { _id: 'q3', text: 'Medium length question', style: 'style1', tone: 'tone1' },
    ];

    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue(questionsWithDifferentLengths),
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId('modern-question-card');
      expect(cards).toHaveLength(3);
    });

    // Check if they are rendered in order of length: Short, Medium, Long
    // ModernQuestionCard is mocked to just show "Card", so we need to check the props passed to it
    expect(ModernQuestionCard).toHaveBeenCalledTimes(3);

    // Get the questions passed to the first 3 calls to ModernQuestionCard
    // Note: Since render happens multiple times, we need to find the latest calls or check the order in the DOM if we didn't mock it so simply.
    // However, since we want to verify the order in the 'questions' state which is used to map,
    // we can check the order of questions in the last few calls.

    const calls = (ModernQuestionCard as any).mock.calls;
    // The last 3 calls should be for our 3 questions in the sorted order
    const lastThreeCalls = calls.slice(-3);

    expect(lastThreeCalls[0][0].question.text).toBe('Short');
    expect(lastThreeCalls[1][0].question.text).toBe('Medium length question');
    expect(lastThreeCalls[2][0].question.text).toBe('This is a long question text');
  });

  it('sorts combined DB and AI questions by length in the first batch', async () => {
    const dbQuestions = [
      { _id: 'db1', text: 'Longer DB question', style: 'style1', tone: 'tone1' },
    ];
    const aiQuestions = [
      { _id: 'ai1', text: 'Short AI', style: 'style1', tone: 'tone1' },
      { _id: 'ai2', text: 'Medium AI question', style: 'style1', tone: 'tone1' },
    ];

    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue(dbQuestions),
    });
    (useAction as any).mockReturnValue(vi.fn().mockResolvedValue(aiQuestions));

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId('modern-question-card');
      expect(cards).toHaveLength(3);
    });

    const calls = (ModernQuestionCard as any).mock.calls;
    const lastThreeCalls = calls.slice(-3);

    // Sorted: 'Short AI' (8), 'Medium AI question' (18), 'Longer DB question' (18)
    // Wait, 'Longer DB question' (18) and 'Medium AI question' (18) have same length.
    // Lengths: 8, 18, 18.
    expect(lastThreeCalls[0][0].question.text).toBe('Short AI');
    // Order of equal length depends on original order or stable sort.
    // db was first, then ai.
    expect(lastThreeCalls[1][0].question.text).toBe('Longer DB question');
    expect(lastThreeCalls[2][0].question.text).toBe('Medium AI question');
  });

  it('does not sort subsequent batches by length', async () => {
    const batch1 = [
      { _id: 'q1', text: 'Short', style: 'style1', tone: 'tone1' },
      { _id: 'q2', text: 'Very long question text', style: 'style1', tone: 'tone1' },
    ];
    const batch2 = [
      { _id: 'q3', text: 'Long second batch question', style: 'style1', tone: 'tone1' },
      { _id: 'q4', text: 'S2', style: 'style1', tone: 'tone1' },
    ];

    const actionMock = vi.fn()
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2);

    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: actionMock,
    });

    const { rerender } = render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(2);
    });

    // Manually trigger loadMore (simulating scroll)
    // Since loadMore is internal, we can try to trigger it by scrolling if we had a real DOM,
    // but here we can just wait for the component to call it if we can trigger the effect.
    // Alternatively, we can just check that the first batch WAS sorted.

    const calls = (ModernQuestionCard as any).mock.calls;
    expect(calls[0][0].question.text).toBe('Short');
    expect(calls[1][0].question.text).toBe('Very long question text');

    // For the sake of this test, let's assume the second batch is loaded.
    // In the real component, it's triggered by scroll or the "Load More" button.
    const loadMoreButton = screen.getByText('Load More');
    loadMoreButton.click();

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(4);
    });

    const updatedCalls = (ModernQuestionCard as any).mock.calls;
    // We expect the last 4 calls to be for q1, q2, q3, q4 (since they all re-render)
    const lastFourCalls = updatedCalls.slice(-4);

    expect(lastFourCalls[0][0].question.text).toBe('Short');
    expect(lastFourCalls[1][0].question.text).toBe('Very long question text');
    // Batch 2 should be in original order: q3 (Long), q4 (Short)
    // It should NOT be sorted to q4, q3.
    expect(lastFourCalls[2][0].question.text).toBe('Long second batch question');
    expect(lastFourCalls[3][0].question.text).toBe('S2');
  });
});
