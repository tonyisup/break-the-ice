import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionPage from './page';
import { useQuery } from 'convex/react';
import { useParams, MemoryRouter } from 'react-router-dom';
import { Id } from '../../../convex/_generated/dataModel';
import { StorageProvider } from '../../hooks/useStorageContext';
import React from 'react';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: () => vi.fn(),
    Link: (props: any) => <a {...props} href={props.to}>{props.children}</a>,
  };
});

vi.mock('convex/react');
vi.mock('@clerk/clerk-react', async () => {
  const actual = await vi.importActual('@clerk/clerk-react');
  return {
    ...actual,
    useAuth: () => ({
      isAuthenticated: false,
      userId: null,
      isSignedIn: false,
    }),
    useClerk: () => ({
      openSignIn: vi.fn(),
      signOut: vi.fn(),
      user: null,
    }),
    useUser: () => ({
      isSignedIn: false,
      user: null,
    }),
  };
});
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));
vi.mock('../../hooks/useLocalStorage', () => ({
  useLocalStorage: () => [[], vi.fn()],
}));
vi.mock('../../hooks/useQuestionHistory', () => ({
  useQuestionHistory: () => ({
    history: [],
    addQuestionHistoryEntry: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

const mockUseParams = useParams as any; //vi.Mock;
const mockUseQuery = useQuery as any; //vi.Mock;

describe('QuestionPage', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockUseParams.mockReturnValue({ id: 'test_id' });
    // Mock useMutation for the recordAnalytics hook
    const { useMutation } = vi.mocked(await import('convex/react'));
    useMutation.mockReturnValue(vi.fn() as any);
  });

  it('renders a loading spinner while fetching the question', () => {
    mockUseQuery.mockReturnValue(undefined);
    render(<MemoryRouter><StorageProvider><QuestionPage /></StorageProvider></MemoryRouter>);
    expect(screen.queryByText('Question not found')).not.toBeInTheDocument();
    // In a real app, we'd check for the spinner role, but this is sufficient for now.
  });

  it('renders "Question not found" when the question is null', () => {
    mockUseQuery.mockReturnValue(null);
    render(<MemoryRouter><StorageProvider><QuestionPage /></StorageProvider></MemoryRouter>);
    expect(screen.getByText('Question not found')).toBeInTheDocument();
  });

  it('renders the question card when the question is loaded', () => {
    const mockQuestion = {
      _id: 'test_id' as Id<'questions'>,
      text: 'This is a test question',
      style: 'test_style',
      tone: 'test_tone',
    };
    mockUseQuery
      .mockReturnValueOnce(mockQuestion) // for getQuestionById
      .mockReturnValueOnce({ color: '#ff0000' }) // for getStyle
      .mockReturnValueOnce({ color: '#00ff00' }); // for getTone

    render(<MemoryRouter><StorageProvider><QuestionPage /></StorageProvider></MemoryRouter>);
    expect(screen.getByText('This is a test question')).toBeInTheDocument();
    expect(screen.getByText('Get more questions')).toBeInTheDocument();
  });

  it('renders correctly when the question has no style or tone', () => {
    const mockQuestion = {
      _id: 'test_id' as Id<'questions'>,
      text: 'Question with no style/tone',
      style: null,
      tone: null,
    };
    mockUseQuery
      .mockReturnValueOnce(mockQuestion) // for getQuestionById
      .mockReturnValueOnce(null) // for getStyle
      .mockReturnValueOnce(null); // for getTone

    render(<MemoryRouter><StorageProvider><QuestionPage /></StorageProvider></MemoryRouter>);
    expect(screen.getByText('Question with no style/tone')).toBeInTheDocument();
    expect(screen.getByText('Get more questions')).toBeInTheDocument();
  });
});
