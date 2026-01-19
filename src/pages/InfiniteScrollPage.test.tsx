import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import InfiniteScrollPage from './InfiniteScrollPage';
import { useQuery, useConvex, useAction, useMutation } from 'convex/react';
import { WorkspaceProvider } from '@/hooks/useWorkspace.tsx';
import { ModernQuestionCard } from '@/components/modern-question-card';

// Hoisted mocks for dynamic control
const mockUseAuth = vi.fn();
const mockUseUser = vi.fn();

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
  useStorageContext: () => ({
    likedQuestions: [],
    hiddenQuestions: [],
    hiddenStyles: [],
    hiddenTones: [],
    addHiddenStyle: vi.fn(),
    addHiddenTone: vi.fn(),
    addLikedQuestion: vi.fn(),
    removeLikedQuestion: vi.fn(),
    addHiddenQuestion: vi.fn(),
    defaultStyle: 'style1',
    defaultTone: 'tone1',
  }),
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
    { id: 'style1', color: '#111111', name: 'Style One' },
    { id: 'style2', color: '#222222', name: 'Style Two' },
  ];
  const mockTones = [
    { id: 'tone1', color: '#AAAAAA', name: 'Tone One' },
    { id: 'tone2', color: '#BBBBBB', name: 'Tone Two' },
  ];
  const mockQuestions = [
    { _id: 'q1', text: 'Q1', style: 'style1', tone: 'tone1' },
    { _id: 'q2', text: 'Q2', style: 'style2', tone: 'tone2' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    // Default auth state: Signed In
    mockUseAuth.mockReturnValue({ isSignedIn: true, userId: 'user123' });
    mockUseUser.mockReturnValue({ isSignedIn: true, user: { id: 'user123' } });

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

    // Mock useQuery for styles/tones
    (useQuery as any).mockImplementation((queryFn: any) => {
        if (queryFn === 'getStyles') return mockStyles;
        if (queryFn === 'getTones') return mockTones;
        // For single style/tone query in the component (background)
        if (queryFn === 'getStyle') return mockStyles[0];
        if (queryFn === 'getTone') return mockTones[0];
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
        expect(screen.getAllByTestId('modern-question-card')).toHaveLength(2);
    });

    const CardMock = ModernQuestionCard as any;
    // Check calls
    // We expect the CardMock to be called with props matching the questions

    // Find call for Q1
    const q1Call = CardMock.mock.calls.find((call: any) => call[0].question._id === 'q1');
    expect(q1Call).toBeDefined();
    expect(q1Call[0].style).toEqual(mockStyles[0]);
    expect(q1Call[0].tone).toEqual(mockTones[0]);
    expect(q1Call[0].gradient).toEqual(['#111111', '#AAAAAA']);

    // Find call for Q2
    const q2Call = CardMock.mock.calls.find((call: any) => call[0].question._id === 'q2');
    expect(q2Call).toBeDefined();
    expect(q2Call[0].style).toEqual(mockStyles[1]);
    expect(q2Call[0].tone).toEqual(mockTones[1]);
    expect(q2Call[0].gradient).toEqual(['#222222', '#BBBBBB']);
  });

  it('shows SignInCTA when not signed in and needs questions', async () => {
    // Override mock for this test
    mockUseAuth.mockReturnValue({ isSignedIn: false, userId: null });
    mockUseUser.mockReturnValue({ isSignedIn: false, user: null });

    // Return empty questions to trigger generation
    (useConvex as any).mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
    });

    render(
      <WorkspaceProvider>
        <InfiniteScrollPage />
      </WorkspaceProvider>
    );

    await waitFor(() => {
        expect(screen.getByTestId('sign-in-cta')).toBeDefined();
    });
  });
});
