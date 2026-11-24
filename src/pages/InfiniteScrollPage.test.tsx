import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, waitFor, screen } from '@testing-library/react';
import InfiniteScrollPage from './InfiniteScrollPage';
import { useQuery, useConvex, useAction, useMutation } from 'convex/react';
import { ModernQuestionCard } from '@/components/modern-question-card';
import { NewsletterCard } from '@/components/newsletter-card/NewsletterCard';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { ERROR_CODES, ERROR_MESSAGES, MAX_FEED_GENERATION_COUNT } from '../../convex/constants';

// Hoisted mocks for dynamic control
const mockUseAuth = vi.fn();
const mockUseUser = vi.fn();
const mockUseStorageContext = vi.fn();
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

let mockReducedMotion = false;
vi.mock('framer-motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => mockReducedMotion,
}));

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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});
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

vi.mock('@/components/PackOffer', () => ({
  PackOffer: vi.fn((props) => <div data-testid="pack-offer" data-surface={props.surface}>Pack offer</div>),
}));

vi.mock('@/components/newsletter-card/NewsletterCard', () => ({
  NewsletterCard: vi.fn((props) => <div data-testid="newsletter-card" data-prefilled={props.prefilledEmail}>Newsletter</div>),
}));

const mockCaptureAnalytics = vi.fn();
vi.mock('@/lib/analytics', () => ({
  captureAnalytics: (...args: unknown[]) => mockCaptureAnalytics(...args),
}));

// Mock api object structure
vi.mock('../../convex/_generated/api', () => ({
  api: {
    core: {
      styles: { getStyles: 'getStyles', getStyle: 'getStyle' },
      tones: { getTones: 'getTones', getTone: 'getTone' },
      questions: { getNextRandomQuestions: 'getNextRandomQuestions', recordAnalytics: 'recordAnalytics' },
      ai: { generateAIQuestionForFeed: 'generateAIQuestionForFeed' },
      generationProgress: { getGenerationProgress: 'getGenerationProgress' },
      users: { getCurrentUser: 'getCurrentUser' },
      topics: { getActiveTakeoverTopics: 'getActiveTakeoverTopics' },
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
    mockReducedMotion = false;
    window.localStorage.clear();
    mockSearchParams = new URLSearchParams();

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

  it('does not install the decorative color observer for reduced motion', async () => {
    mockReducedMotion = true;
    const observer = vi.fn(function () { return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }; });
    global.IntersectionObserver = observer as unknown as typeof IntersectionObserver;
    render(<InfiniteScrollPage />);
    await waitFor(() => expect(ModernQuestionCard).toHaveBeenCalled());
    expect(observer.mock.calls.some(call => (call as unknown[])[1] && ((call as unknown[])[1] as IntersectionObserverInit).rootMargin === '67% 0px')).toBe(false);
  });

  it('loads questions when mounted in StrictMode after auth is already ready', async () => {
    render(
      <StrictMode>
        <InfiniteScrollPage />
      </StrictMode>
    );

    expect(await screen.findAllByTestId('modern-question-card')).toHaveLength(5);
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('starts a new request when anchors change during loading and ignores the old response', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, userId: null, isLoaded: true });
    let resolveOld!: (questions: typeof mockQuestions) => void;
    let resolveNew!: (questions: typeof mockQuestions) => void;
    const oldRequest = new Promise<typeof mockQuestions>(resolve => { resolveOld = resolve; });
    const newRequest = new Promise<typeof mockQuestions>(resolve => { resolveNew = resolve; });
    const action = vi.fn().mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest);
    vi.mocked(useConvex).mockReturnValue({ action } as unknown as ReturnType<typeof useConvex>);
    const view = render(<InfiniteScrollPage />);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    mockSearchParams = new URLSearchParams('style=style2');
    view.rerender(<InfiniteScrollPage />);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action).toHaveBeenLastCalledWith('getNextRandomQuestions', expect.objectContaining({
      anchoredStyleId: 'style2',
    }));

    await act(async () => { resolveOld(mockQuestions); });
    expect(screen.queryAllByTestId('modern-question-card')).toHaveLength(0);
    expect(document.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => { resolveNew([mockQuestions[1]]); });
    expect(screen.getAllByTestId('modern-question-card')).toHaveLength(1);
    expect(ModernQuestionCard).toHaveBeenLastCalledWith(expect.objectContaining({
      question: mockQuestions[1],
    }), undefined);
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('renders cards with specific styles and tones', async () => {
    render(
      <InfiniteScrollPage />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(5);
    });
  });

  it('sends the local session id with a signed-out like so it counts once per session', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false, userId: null, isLoaded: true });
    mockUseStorageContext.mockReturnValue({
      ...mockUseStorageContext(),
      sessionId: 'local-session-1',
    });
    const recordAnalytics = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((ref: unknown) =>
      ref === 'recordAnalytics' ? recordAnalytics : vi.fn()) as unknown as typeof useMutation);

    render(<InfiniteScrollPage />);
    await waitFor(() => expect(ModernQuestionCard).toHaveBeenCalled());

    const cardProps = vi.mocked(ModernQuestionCard).mock.calls[0][0] as { onToggleFavorite: () => void };
    await act(async () => { cardProps.onToggleFavorite(); });

    await waitFor(() => expect(recordAnalytics).toHaveBeenCalledWith(expect.objectContaining({
      event: 'liked',
      sessionId: 'local-session-1',
    })));
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
      <InfiniteScrollPage />
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
      <InfiniteScrollPage />
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
      <InfiniteScrollPage />
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
      <InfiniteScrollPage />
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
      <InfiniteScrollPage />
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
      <InfiniteScrollPage />
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

  it('resolves slug anchors to IDs and normalizes legacy ID URLs', async () => {
    const readableStyle = {
      _id: 'style-document-id',
      id: 'story-driven',
      slug: 'story-driven',
      color: '#111111',
      name: 'Story Driven',
    };
    mockSearchParams = new URLSearchParams('style=style-document-id');
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getStyles') return [readableStyle];
      if (queryFn === 'getTones') return mockTones;
      if (queryFn === 'getStyle') return readableStyle;
      if (queryFn === 'getTone') return mockTones[0];
      if (queryFn === 'getCurrentUser') return { _id: 'u1', email: 'test@example.com', newsletterSubscriptionStatus: null };
      return undefined;
    });
    const actionMock = vi.fn().mockResolvedValue({
      questions: [{ _id: 'anchored-question', text: 'Anchored?', styleId: 'style-document-id', toneId: 'tone1' }],
      anchoredMatchCount: 1,
      targetAnchoredCount: 6,
    });
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledWith(
        'getNextRandomQuestions',
        expect.objectContaining({ anchoredStyleId: 'style-document-id' }),
      );
    });
    const normalizationCall = mockSetSearchParams.mock.calls.find((call) => call[1]?.replace === true);
    expect(normalizationCall?.[0].get('style')).toBe('story-driven');
  });

  it('writes canonical slugs when selecting an anchor', async () => {
    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => {
      expect(ModernQuestionCard).toHaveBeenCalled();
    });
    const latestCardProps = (ModernQuestionCard as any).mock.calls.at(-1)[0];
    latestCardProps.onAnchorItem({
      id: 'style-document-id',
      slug: 'story-driven',
      name: 'Story Driven',
      type: 'Style',
      description: '',
      icon: 'book',
      color: '#111111',
    });

    const lastCall = mockSetSearchParams.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    if (!lastCall) throw new Error("Expected anchor navigation");
    const writtenParams = lastCall[0];
    expect(writtenParams.get('style')).toBe('story-driven');
  });

  it('shows the matching library question at once and adds the generated ones after it', async () => {
    mockSearchParams = new URLSearchParams('style=style1');
    // A filtered feed gets only matches from the library; the rest of the page is generated.
    const dbQuestions = [
      { _id: 'db-anchor', text: 'Existing anchor', styleId: 'style1', toneId: 'tone1' },
    ];
    const actionMock = vi.fn().mockResolvedValue({
      questions: dbQuestions,
      anchoredMatchCount: 1,
      targetAnchoredCount: 10,
    });
    const generatedQuestions = Array.from({ length: 5 }, (_, index) => ({
      _id: `generated-${index}`,
      text: `Generated anchor ${index}`,
      styleId: 'style1',
      toneId: 'tone1',
    }));
    let finishGeneration: (questions: typeof generatedQuestions) => void = () => {};
    const generateAction = vi.fn().mockReturnValue(new Promise((resolve) => { finishGeneration = resolve; }));
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });
    (useAction as any).mockReturnValue(generateAction);

    render(
      <InfiniteScrollPage />,
    );

    // The library's match is readable while the new questions are still being written.
    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(1);
    });
    expect(generateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 5,
        anchoredStyleId: 'style1',
      }),
    );

    await act(async () => { finishGeneration(generatedQuestions); });
    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(6);
    });
    const lastSixCalls = (ModernQuestionCard as any).mock.calls.slice(-6);
    expect(lastSixCalls[0][0].question._id).toBe('db-anchor');
    expect(lastSixCalls.slice(1).every((call: any[]) => call[0].question._id.startsWith('generated-'))).toBe(true);
  });

  it('keeps the anchored database questions and posts a notice when the daily AI budget is paused', async () => {
    mockSearchParams = new URLSearchParams('style=style1');
    const dbQuestions = [
      { _id: 'db-anchor', text: 'Existing anchor', styleId: 'style1', toneId: 'tone1' },
      { _id: 'general-0', text: 'General 0', styleId: 'style2', toneId: 'tone2' },
    ];
    const actionMock = vi.fn().mockResolvedValue({
      questions: dbQuestions,
      anchoredMatchCount: 1,
      targetAnchoredCount: 6,
    });
    const paused = new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });
    (useAction as any).mockReturnValue(vi.fn().mockRejectedValue(paused));
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_BUDGET_PAUSED));
    expect(await screen.findAllByTestId('modern-question-card')).toHaveLength(2);
    expect(screen.queryByText('Load More')).toBeNull();
    expect(screen.queryByText('Generation Limit Reached')).toBeNull();
  });

  it('does not generate when the anchored database quota is already met', async () => {
    mockSearchParams = new URLSearchParams('tone=tone1');
    const dbQuestions = [
      ...Array.from({ length: 6 }, (_, index) => ({
        _id: `anchor-${index}`,
        text: `Anchored ${index}`,
        styleId: 'style1',
        toneId: 'tone1',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        _id: `general-${index}`,
        text: `General ${index}`,
        styleId: 'style2',
        toneId: 'tone2',
      })),
    ];
    const actionMock = vi.fn().mockResolvedValue({
      questions: dbQuestions,
      anchoredMatchCount: 6,
      targetAnchoredCount: 6,
    });
    const generateAction = vi.fn().mockResolvedValue([]);
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });
    (useAction as any).mockReturnValue(generateAction);

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10);
    });
    expect(generateAction).not.toHaveBeenCalled();
  });

  it('uses surplus generated anchors to fill an incomplete batch', async () => {
    mockSearchParams = new URLSearchParams('style=style1');
    const dbQuestions = Array.from({ length: 5 }, (_, index) => ({
      _id: `db-anchor-${index}`,
      text: `Existing anchor ${index}`,
      styleId: 'style1',
      toneId: 'tone1',
    }));
    const actionMock = vi.fn().mockResolvedValue({
      questions: dbQuestions,
      anchoredMatchCount: 5,
      targetAnchoredCount: 6,
    });
    const generatedQuestions = Array.from({ length: 5 }, (_, index) => ({
      _id: `generated-${index}`,
      text: `Generated anchor ${index}`,
      styleId: 'style1',
      toneId: 'tone1',
    }));
    const generateAction = vi.fn().mockResolvedValue(generatedQuestions);
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });
    (useAction as any).mockReturnValue(generateAction);

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10);
    });
    expect(generateAction).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });

  it('asks for no more generated questions than the feed limit when an anchored page is short by more', async () => {
    mockSearchParams = new URLSearchParams('style=style1');
    // The database has nothing: six anchored questions short, and ten short of a full first page.
    const actionMock = vi.fn().mockResolvedValue({
      questions: [],
      anchoredMatchCount: 0,
      targetAnchoredCount: 6,
    });
    const generatedQuestions = Array.from({ length: MAX_FEED_GENERATION_COUNT }, (_, index) => ({
      _id: `generated-${index}`,
      text: `Generated anchor ${index}`,
      styleId: 'style1',
      toneId: 'tone1',
    }));
    const generateAction = vi.fn().mockResolvedValue(generatedQuestions);
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: actionMock });
    (useAction as any).mockReturnValue(generateAction);

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('modern-question-card')).toHaveLength(MAX_FEED_GENERATION_COUNT);
    });
    // Written from the limit the server holds a feed request to, so a page that stops reading
    // it fails here when the limit changes.
    expect(generateAction.mock.calls.map(([asked]) => asked.count)).toEqual([MAX_FEED_GENERATION_COUNT]);
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
      <InfiniteScrollPage />
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

  it('puts library questions first on the first page and generated ones below them, shortest first', async () => {
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
      <InfiniteScrollPage />
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId('modern-question-card');
      expect(cards).toHaveLength(3);
    });

    const calls = (ModernQuestionCard as any).mock.calls;
    const lastThreeCalls = calls.slice(-3);

    // The library question was on screen first and stays at the top; the generated ones
    // follow it, shortest first, and never move a card someone may already be reading.
    expect(lastThreeCalls[0][0].question.text).toBe('Longer DB question');
    expect(lastThreeCalls[1][0].question.text).toBe('Short AI');
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
      <InfiniteScrollPage />
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

  it('shows the limit notice when AI limit is reached during initial load', async () => {
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue([]), // DB returns nothing
    });

    const limitError = new Error('AI generation limit reached');
    const generateAction = vi.fn().mockRejectedValue(limitError);
    (useAction as any).mockReturnValue(generateAction);

    render(
      <InfiniteScrollPage />
    );

    // Should automatically try to load first batch, fail, and show the limit notice
    await waitFor(() => {
      expect(screen.getByText('Generation Limit Reached')).toBeDefined();
      expect(screen.queryByText('Load More')).toBeNull();
    });
    // The limit card carries the pack offer.
    // Extended by the ship coverage audit (Claude Fable 5.2), pass 1.
    // Value: protects=a request made from the feed's limit card is counted as "feed"; fails_when=the feed passes "remix" or no surface, so the summary's per-surface counts are wrong; why_new=the mock dropped the surface prop; seam=none; no_claim=the real PackOffer (mocked here; PackOffer.test.tsx covers it)
    expect(screen.getByTestId('pack-offer').getAttribute('data-surface')).toBe('feed');
  });

  it('stops the feed with a notice, not the limit notice, when the daily AI budget is paused', async () => {
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue([]), // DB returns nothing
    });
    const paused = new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
    (useAction as any).mockReturnValue(vi.fn().mockRejectedValue(paused));
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />
    );

    await waitFor(() => expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_BUDGET_PAUSED));
    expect(screen.queryByText('Generation Limit Reached')).toBeNull();
    // Extended by the ship coverage audit (Claude Fable 5.2), pass 1.
    // Value: protects=the paused notice shows without the pack offer, since a pack would not lift the daily pause; fails_when=the offer moves into AiLimitNotice itself or is rendered for the paused state; why_new=only the limit card's offer was asserted; seam=none; no_claim=the real PackOffer (mocked here)
    expect(screen.getByText('New questions are paused')).toBeDefined();
    expect(screen.queryByTestId('pack-offer')).toBeNull();
    expect(screen.queryByText('Load More')).toBeNull();
  });

  it('shows the rate-limit message from the server when a person is making too many AI requests', async () => {
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue([]),
    });
    const limited = new ConvexError({ code: ERROR_CODES.AI_RATE_LIMITED, message: ERROR_MESSAGES.AI_RATE_LIMITED });
    (useAction as any).mockReturnValue(vi.fn().mockRejectedValue(limited));
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />
    );

    await waitFor(() => expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_RATE_LIMITED));
    expect(screen.queryByText('Generation Limit Reached')).toBeNull();
  });

  it('proactively shows the limit notice if isAiLimitReached is true and DB is empty', async () => {
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue([]), // DB returns nothing
    });

    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getCurrentUser') return {
        _id: 'u1',
        email: 'test@example.com',
        isAiLimitReached: true,
        aiLimit: 10,
        aiUsage: { count: 10, cycleStart: Date.UTC(2026, 9, 1, 12) }
      };
      if (queryFn === 'getStyles') return mockStyles;
      if (queryFn === 'getTones') return mockTones;
      return undefined;
    });

    render(
      <InfiniteScrollPage />
    );

    // Should immediately show the limit notice if it tries to load and finds no DB questions
    await waitFor(() => {
      expect(screen.getByText('Generation Limit Reached')).toBeDefined();
      expect(screen.queryByText('Load More')).toBeNull();
    });
    // It is a status that names the server's allowance and the day the 30-day cycle resets, not an offer.
    const resetsOn = new Date(Date.UTC(2026, 9, 31, 12)).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    expect(screen.getByRole('status').textContent).toContain(`You've used all 10 AI generations for this cycle. More become available on ${resetsOn}.`);
    expect(screen.queryByRole('button', { name: /team plan/i })).toBeNull();
  });

  it('shows the database questions it already had when the budget pauses on the first page', async () => {
    const dbQuestions = [
      { _id: 'db-long', text: 'A much longer database question', style: 'style1', tone: 'tone1' },
      { _id: 'db-short', text: 'Short one', style: 'style2', tone: 'tone2' },
      { _id: 'db-mid', text: 'Middle question', style: 'style1', tone: 'tone1' },
    ];
    (useConvex as any).mockReturnValue({ query: vi.fn(), action: vi.fn().mockResolvedValue(dbQuestions) });
    const paused = new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
    (useAction as any).mockReturnValue(vi.fn().mockRejectedValue(paused));
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />,
    );

    expect(await screen.findAllByTestId('modern-question-card')).toHaveLength(3);
    expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_BUDGET_PAUSED);
    expect(error).not.toHaveBeenCalled();
    const lastThree = (ModernQuestionCard as any).mock.calls.slice(-3).map((call: any[]) => call[0].question._id);
    expect(lastThree).toEqual(['db-short', 'db-mid', 'db-long']);
    expect(screen.queryByText('Load More')).toBeNull();
    expect(screen.queryByText('Generation Limit Reached')).toBeNull();
  });

  it('keeps the database questions from a later page and stops loading when the budget pauses', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      _id: `first-${index}`,
      text: `First page ${index}`,
      style: 'style1',
      tone: 'tone1',
    }));
    const secondPage = [
      { _id: 'second-0', text: 'Second page 0', style: 'style1', tone: 'tone1' },
      { _id: 'second-1', text: 'Second page 1', style: 'style1', tone: 'tone1' },
    ];
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage),
    });
    const paused = new ConvexError({ code: ERROR_CODES.AI_BUDGET_PAUSED, message: ERROR_MESSAGES.AI_BUDGET_PAUSED });
    const generate = vi.fn().mockRejectedValue(paused);
    (useAction as any).mockReturnValue(generate);
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />,
    );

    expect(await screen.findAllByTestId('modern-question-card')).toHaveLength(10);
    expect(generate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Load More'));

    await waitFor(() => expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_BUDGET_PAUSED));
    expect(screen.getAllByTestId('modern-question-card')).toHaveLength(12);
    expect(screen.queryByText('Load More')).toBeNull();
  });

  it('keeps scrolling an anchored feed whose page is already full when only the anchor top-up is rate-limited', async () => {
    mockSearchParams = new URLSearchParams('style=style1');
    const dbQuestions = Array.from({ length: 10 }, (_, index) => ({
      _id: `db-${index}`,
      text: `Database ${index}`,
      styleId: index < 3 ? 'style1' : 'style2',
      toneId: 'tone1',
    }));
    (useConvex as any).mockReturnValue({
      query: vi.fn(),
      action: vi.fn().mockResolvedValue({ questions: dbQuestions, anchoredMatchCount: 3, targetAnchoredCount: 6 }),
    });
    const limited = new ConvexError({ code: ERROR_CODES.AI_RATE_LIMITED, message: ERROR_MESSAGES.AI_RATE_LIMITED });
    const generate = vi.fn().mockRejectedValue(limited);
    (useAction as any).mockReturnValue(generate);
    const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <InfiniteScrollPage />,
    );

    await waitFor(() => expect(info).toHaveBeenCalledWith(ERROR_MESSAGES.AI_RATE_LIMITED));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
    expect(await screen.findAllByTestId('modern-question-card')).toHaveLength(10);
    expect(screen.getByText('Load More')).toBeInTheDocument();
    expect(screen.queryByText('Generation Limit Reached')).toBeNull();

    // Later pages don't ask again for the rest of the session.
    fireEvent.click(screen.getByText('Load More'));
    const dbAction = (useConvex as any)().action;
    await waitFor(() => expect(dbAction).toHaveBeenCalledTimes(2));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });
  describe('load latency', () => {
    const tenQuestions = Array.from({ length: 10 }, (_, index) => ({
      _id: `db-${index}`,
      text: `Database ${index}`,
      style: 'style1',
      tone: 'tone1',
    }));
    const generatedBatch = Array.from({ length: 5 }, (_, index) => ({
      _id: `ai-${index}`,
      text: `Generated ${index}`,
      style: 'style1',
      tone: 'tone1',
    }));

    // Stands in for the observer that tracks the card at the centre of the screen.
    const observeViews = () => {
      const callbacks: Array<{ callback: IntersectionObserverCallback; rootMargin?: string }> = [];
      global.IntersectionObserver = class {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          callbacks.push({ callback, rootMargin: options?.rootMargin });
        }
        observe() { }
        unobserve() { }
        disconnect() { }
      } as any;
      return (questionId: string) => {
        const target = document.querySelector(`[data-question-id="${questionId}"]`);
        if (!target) throw new Error(`No card for ${questionId}`);
        act(() => {
          callbacks
            .filter((entry) => entry.rootMargin === '-50% 0px -50% 0px')
            .forEach((entry) => entry.callback([{ isIntersecting: true, target } as any], {} as any));
        });
      };
    };

    it('asks for a full batch when the library runs short, and records how long the load took', async () => {
      (useConvex as any).mockReturnValue({ query: vi.fn(), action: vi.fn().mockResolvedValue(mockQuestions.slice(0, 2)) });
      const generate = vi.fn().mockResolvedValue(generatedBatch);
      (useAction as any).mockReturnValue(generate);

      render(<InfiniteScrollPage />);

      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(7));
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith(expect.objectContaining({ count: MAX_FEED_GENERATION_COUNT }));
      await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({
        trigger: 'initial',
        first_pull: true,
        anchored: false,
        library_count: 2,
        generation_requested: MAX_FEED_GENERATION_COUNT,
        generated_count: 5,
        failed: false,
      })));
      const properties = mockCaptureAnalytics.mock.calls[0][1];
      expect(properties.total_ms).toEqual(expect.any(Number));
      expect(properties.generation_ms).toEqual(expect.any(Number));
      expect(properties.stall_ms).toEqual(expect.any(Number));
    });

    it('shows a later anchored page\'s library questions before its generated ones arrive', async () => {
      mockSearchParams = new URLSearchParams('style=style1');
      const action = vi.fn()
        .mockResolvedValueOnce({ questions: tenQuestions, anchoredMatchCount: 6, targetAnchoredCount: 6 })
        .mockResolvedValueOnce({
          questions: [
            { _id: 'later-1', text: 'Later one', style: 'style2', tone: 'tone1' },
            { _id: 'later-2', text: 'Later two', style: 'style2', tone: 'tone1' },
          ],
          anchoredMatchCount: 0,
          targetAnchoredCount: 3,
        });
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      let finishGeneration: (questions: unknown[]) => void = () => {};
      const generate = vi.fn(() => new Promise((resolve) => { finishGeneration = resolve; }));
      (useAction as any).mockReturnValue(generate);

      render(<InfiniteScrollPage />);
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));
      expect(generate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Load More'));

      // The generation is still running, and the library's two are already on screen.
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(12));

      await act(async () => { finishGeneration(generatedBatch.slice(0, 3)); });
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(15));
    });

    it('loads the next page ahead of time once few cards are left below the one being read', async () => {
      const showCard = observeViews();
      const action = vi.fn()
        .mockResolvedValueOnce(tenQuestions)
        .mockResolvedValue(mockQuestions);
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });

      render(<InfiniteScrollPage />);
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));

      // Seven cards still below: too early.
      showCard('db-2');
      expect(action).toHaveBeenCalledTimes(1);

      // Five below: the next page is fetched without any scrolling to the end.
      showCard('db-4');
      await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(15));
      expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({ trigger: 'prefetch' }));
    });

    it('does not send a prefetch again when it added nothing', async () => {
      const showCard = observeViews();
      const action = vi.fn()
        .mockResolvedValueOnce(tenQuestions)
        .mockResolvedValue([]);
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      const generate = vi.fn().mockResolvedValue([]);
      (useAction as any).mockReturnValue(generate);

      render(<InfiniteScrollPage />);
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));

      showCard('db-6');
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({ trigger: 'prefetch' })));

      showCard('db-7');
      showCard('db-8');
      await act(async () => { await Promise.resolve(); });
      expect(action).toHaveBeenCalledTimes(2);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('keeps a person\'s last AI request for when they reach the end and ask for it', async () => {
      const showCard = observeViews();
      (useQuery as any).mockImplementation((queryFn: any) => {
        if (queryFn === 'getStyles') return mockStyles;
        if (queryFn === 'getTones') return mockTones;
        if (queryFn === 'getCurrentUser') {
          return { _id: 'u1', email: 'test@example.com', aiLimit: 10, aiUsage: { count: 9 }, isAiLimitReached: false };
        }
        return undefined;
      });
      const action = vi.fn()
        .mockResolvedValueOnce(tenQuestions)
        .mockResolvedValue([]);
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      const generate = vi.fn().mockResolvedValue(generatedBatch);
      (useAction as any).mockReturnValue(generate);

      render(<InfiniteScrollPage />);
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));

      showCard('db-6');
      await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({ trigger: 'prefetch' })));
      expect(generate).not.toHaveBeenCalled();
      expect(screen.getByText('Load More')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Load More'));
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(15));
    });
    // Lays the page out so the reader is `fromEnd` px above the end of a 5,000 px feed.
    const scrollTo = (fromEnd: number) => {
      Object.defineProperty(document.documentElement, 'offsetHeight', { configurable: true, value: 5000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
      document.documentElement.scrollTop = 5000 - 800 - fromEnd;
      fireEvent.scroll(window);
    };
    const restoreLayout = () => {
      delete (document.documentElement as any).offsetHeight;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
      document.documentElement.scrollTop = 0;
    };
    const lastRequestUser = () => {
      (useQuery as any).mockImplementation((queryFn: any) => {
        if (queryFn === 'getStyles') return mockStyles;
        if (queryFn === 'getTones') return mockTones;
        if (queryFn === 'getCurrentUser') {
          return { _id: 'u1', email: 'test@example.com', aiLimit: 10, aiUsage: { count: 9 }, isAiLimitReached: false };
        }
        return undefined;
      });
    };

    it('holds the last AI request when scrolling loads ahead of the end, and spends it at the end', async () => {
      lastRequestUser();
      const action = vi.fn().mockResolvedValueOnce(tenQuestions).mockResolvedValue([]);
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      const generate = vi.fn().mockResolvedValue(generatedBatch);
      (useAction as any).mockReturnValue(generate);

      try {
        render(<InfiniteScrollPage />);
        await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));

        // 600 px from the end: close enough to load ahead, not the end itself.
        scrollTo(600);
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({ trigger: 'scroll', ahead: true })));
        expect(generate).not.toHaveBeenCalled();

        // More scrolling short of the end doesn't keep asking the library either.
        scrollTo(500);
        scrollTo(400);
        await act(async () => { await Promise.resolve(); });
        expect(action).toHaveBeenCalledTimes(2);

        scrollTo(100);
        await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
        expect(generate.mock.calls[0][0]).not.toHaveProperty('ahead');
        await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(15));
      } finally {
        restoreLayout();
      }
    });

    it('marks a load asked ahead, and stops quietly when the server holds the last request', async () => {
      const showCard = observeViews();
      const action = vi.fn().mockResolvedValueOnce(tenQuestions).mockResolvedValue([]);
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      const held = new ConvexError({ code: ERROR_CODES.AI_LAST_REQUEST_HELD, message: ERROR_MESSAGES.AI_LAST_REQUEST_HELD });
      const generate = vi.fn().mockRejectedValueOnce(held).mockResolvedValue(generatedBatch);
      (useAction as any).mockReturnValue(generate);
      const info = vi.spyOn(toast, 'info').mockImplementation(() => 0);
      const error = vi.spyOn(toast, 'error').mockImplementation(() => 0);

      render(<InfiniteScrollPage />);
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));

      // The page's own copy of the count didn't say this was the last request; the server did.
      showCard('db-6');
      await waitFor(() => expect(generate).toHaveBeenCalledWith(expect.objectContaining({ ahead: true })));
      await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({ trigger: 'prefetch', failed: false })));
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(screen.queryByText('Generation Limit Reached')).toBeNull();

      fireEvent.click(screen.getByText('Load More'));
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
      expect(generate.mock.calls[1][0]).not.toHaveProperty('ahead');
      await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(15));
    });

    it('counts as stalled only the time spent at the end of the feed with nothing new to read', async () => {
      mockSearchParams = new URLSearchParams('style=style1');
      let now = 0;
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
      let finishLibrary: (batch: unknown) => void = () => {};
      const action = vi.fn()
        .mockResolvedValueOnce({ questions: tenQuestions, anchoredMatchCount: 6, targetAnchoredCount: 6 })
        .mockImplementationOnce(() => new Promise((resolve) => { finishLibrary = resolve; }));
      (useConvex as any).mockReturnValue({ query: vi.fn(), action });
      let finishGeneration: (questions: unknown[]) => void = () => {};
      const generate = vi.fn(() => new Promise((resolve) => { finishGeneration = resolve; }));
      (useAction as any).mockReturnValue(generate);

      try {
        render(<InfiniteScrollPage />);
        await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(10));
        mockCaptureAnalytics.mockClear();

        // At the end of the feed when the load starts.
        now = 1000;
        fireEvent.click(screen.getByText('Load More'));
        await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

        // Half a second later the library's two cards arrive: there is something to read.
        now = 1500;
        await act(async () => {
          finishLibrary({
            questions: [
              { _id: 'later-1', text: 'Later one', style: 'style2', tone: 'tone1' },
              { _id: 'later-2', text: 'Later two', style: 'style2', tone: 'tone1' },
            ],
            anchoredMatchCount: 0,
            targetAnchoredCount: 3,
          });
        });
        await waitFor(() => expect(screen.getAllByTestId('modern-question-card')).toHaveLength(12));

        // The reader reaches the new end at 3 s and waits there until the generation lands at 9 s.
        now = 3000;
        fireEvent.scroll(window);
        now = 9000;
        await act(async () => { finishGeneration(generatedBatch.slice(0, 3)); });

        await waitFor(() => expect(mockCaptureAnalytics).toHaveBeenCalledWith('feed_load', expect.objectContaining({
          trigger: 'button',
          total_ms: 8000,
          stall_ms: 500 + 6000,
        })));
      } finally {
        clock.mockRestore();
      }
    });
  });
});
