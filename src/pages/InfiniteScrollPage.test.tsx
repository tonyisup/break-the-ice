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
    styles: { getStyles: 'getStyles', getStyle: 'getStyle' },
    tones: { getTones: 'getTones', getTone: 'getTone' },
    questions: { getNextRandomQuestions: 'getNextRandomQuestions', recordAnalytics: 'recordAnalytics' },
    ai: { generateAIQuestions: 'generateAIQuestions' },
    users: { getCurrentUser: 'getCurrentUser' },
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
      constructor(callback: any) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;

    (useConvex as any).mockReturnValue({
      query: vi.fn().mockResolvedValue(mockQuestions),
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
    const queryMock = vi.fn().mockResolvedValue([]);
    (useConvex as any).mockReturnValue({
      query: queryMock,
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(queryMock).toHaveBeenCalledWith(
        'getNextRandomQuestions',
        expect.objectContaining({
          randomSeed: expect.any(Number),
        })
      );
    });
  });
});
