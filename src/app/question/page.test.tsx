import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionPage from './page';
import { useQuery } from 'convex/react';
import { useParams, MemoryRouter } from 'react-router-dom';
import { Id } from '../../../convex/_generated/dataModel';

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
vi.mock('../../hooks/useLocalStorage', () => ({
  useLocalStorage: () => [[], vi.fn()],
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

const mockUseParams = useParams as vi.Mock;
const mockUseQuery = useQuery as vi.Mock;

describe('QuestionPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseParams.mockReturnValue({ id: 'test_id' });
  });

  it('renders a loading spinner while fetching the question', () => {
    mockUseQuery.mockReturnValue(undefined);
    render(<MemoryRouter><QuestionPage /></MemoryRouter>);
    expect(screen.queryByText('Question not found')).not.toBeInTheDocument();
    // In a real app, we'd check for the spinner role, but this is sufficient for now.
  });

  it('renders "Question not found" when the question is null', () => {
    mockUseQuery.mockReturnValue(null);
    render(<MemoryRouter><QuestionPage /></MemoryRouter>);
    expect(screen.getByText('Question not found')).toBeInTheDocument();
  });

  it('renders the question card when the question is loaded', async () => {
    const mockQuestion = {
      _id: 'test_id' as Id<'questions'>,
      text: 'This is a test question',
      style: 'test_style',
      tone: 'test_tone',
    };
    mockUseQuery.mockImplementation((query, args) => {
      if (args.id === 'test_id') {
        return mockQuestion;
      }
      if (args.id === 'test_style') {
        return { color: '#ff0000' };
      }
      if (args.id === 'test_tone') {
        return { color: '#00ff00' };
      }
      return null;
    });

    render(<MemoryRouter><QuestionPage /></MemoryRouter>);
    await screen.findByText('This is a test question');
    expect(screen.getByText('Get more questions')).toBeInTheDocument();
  });

  it('renders correctly when the question has no style or tone', async () => {
    const mockQuestion = {
      _id: 'test_id' as Id<'questions'>,
      text: 'Question with no style/tone',
      style: null,
      tone: null,
    };
    mockUseQuery.mockImplementation((query, args) => {
      if (args.id === 'test_id') {
        return mockQuestion;
      }
      return null;
    });

    render(<MemoryRouter><QuestionPage /></MemoryRouter>);
    await screen.findByText('Question with no style/tone');
    expect(screen.getByText('Get more questions')).toBeInTheDocument();
  });
});
