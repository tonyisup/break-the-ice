import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserDetailsPage from './page';
import { useQuery, useMutation } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ userId: 'user123' }),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

// Mock API structure
vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    admin: {
      users: {
        getUser: 'getUser',
        getUserStyles: 'getUserStyles',
        getUserTones: 'getUserTones',
        getUserQuestions: 'getUserQuestions',
        updateUser: 'updateUser',
      },
    },
  },
}));

describe('UserDetailsPage', () => {
  const mockUser = {
    _id: 'user123',
    _creationTime: Date.now(),
    name: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
    subscriptionTier: 'free',
    newsletterSubscriptionStatus: 'subscribed',
    aiUsage: { count: 5, cycleStart: Date.now() },
  };

  const mockStyles = [
    { _id: 'us1', styleId: 's1', status: 'preferred', updatedAt: Date.now(), style: { name: 'Funny', icon: '😂' } }
  ];

  const mockTones = [
    { _id: 'ut1', toneId: 't1', status: 'hidden', updatedAt: Date.now(), tone: { name: 'Serious', icon: '😐' } }
  ];

  const mockQuestions = [
    {
      _id: 'uq1',
      questionId: 'q1',
      status: 'liked',
      updatedAt: Date.now(),
      seenCount: 2,
      question: { text: 'How are you?' }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getUser') return mockUser;
      if (queryFn === 'getUserStyles') return mockStyles;
      if (queryFn === 'getUserTones') return mockTones;
      if (queryFn === 'getUserQuestions') return mockQuestions;
      return undefined;
    });
    (useMutation as any).mockReturnValue(vi.fn());
  });

  it('renders user details correctly', () => {
    render(<UserDetailsPage />);
    expect(screen.getByText('Test User')).toBeDefined();
    expect(screen.getByText('test@example.com')).toBeDefined();
    expect(screen.getByText('user123')).toBeDefined();
  });

  it('renders tabs and content', async () => {
    render(<UserDetailsPage />);

    // Overview tab is default
    expect(screen.getByText('User Information')).toBeDefined();
  });

  it('updates user settings', async () => {
    const updateUserMock = vi.fn().mockResolvedValue(null);
    (useMutation as any).mockImplementation((mutationFn: any) => {
      if (mutationFn === 'updateUser') return updateUserMock;
      return vi.fn();
    });

    render(<UserDetailsPage />);

    // Change AI usage
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '10' } });

    // Click Save
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({
        userId: 'user123',
        aiUsageCount: 10,
        newsletterSubscriptionStatus: 'subscribed'
      });
    });
  });
});
