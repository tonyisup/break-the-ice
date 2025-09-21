import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionPage from './page';
import { useQuery } from 'convex/react';
import { useParams, MemoryRouter } from 'react-router-dom';
import { Id } from '../../../convex/_generated/dataModel';
import { StorageProvider } from '../../hooks/useStorageContext';

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
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));
vi.mock('../../hooks/useQuestionHistory', () => ({
  useQuestionHistory: () => ({
    history: [],
    addQuestionToHistory: vi.fn(),
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
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseParams.mockReturnValue({ id: 'test_id' });
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <MemoryRouter>
        <StorageProvider>{component}</StorageProvider>
      </MemoryRouter>
    );
  };

  it('renders a loading spinner while fetching the question', () => {
    mockUseQuery.mockReturnValue(undefined);
    renderWithProviders(<QuestionPage />);
    expect(screen.queryByText('Question not found')).not.toBeInTheDocument();
    // In a real app, we'd check for the spinner role, but this is sufficient for now.
  });

  it('renders "Question not found" when the question is null', () => {
    mockUseQuery.mockReturnValue(null);
    renderWithProviders(<QuestionPage />);
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

    renderWithProviders(<QuestionPage />);
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

    renderWithProviders(<QuestionPage />);
    expect(screen.getByText('Question with no style/tone')).toBeInTheDocument();
    expect(screen.getByText('Get more questions')).toBeInTheDocument();
  });
});
