import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UsersPage from './page';
import { useQuery, useMutation } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
}));

// Mock API structure
vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    admin: {
      users: {
        getUsers: 'getUsers',
        makeAdmin: 'makeAdmin',
        updateUser: 'updateUser',
      },
    },
  },
}));

describe('UsersPage', () => {
  const mockUsers = [
    {
      _id: 'user1',
      name: 'User One',
      email: 'user1@example.com',
      isAdmin: false,
      aiUsage: { count: 5 },
      subscriptionTier: 'free',
      newsletterSubscriptionStatus: 'unsubscribed'
    },
    {
        _id: 'user2',
        name: 'User Two',
        email: 'user2@example.com',
        isAdmin: true,
        aiUsage: { count: 10 },
        subscriptionTier: 'casual',
        newsletterSubscriptionStatus: 'subscribed'
      }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as any).mockReturnValue(mockUsers);
    (useMutation as any).mockReturnValue(vi.fn());
  });

  it('renders users list', () => {
    render(<UsersPage />);
    expect(screen.getByText('User One')).toBeInTheDocument();
    expect(screen.getByText('User Two')).toBeInTheDocument();
  });

  it('renders links to user details on names', () => {
    render(<UsersPage />);

    // Check name link
    const link1 = screen.getByText('User One').closest('a');
    expect(link1).toHaveAttribute('href', '/admin/users/user1');

    const link2 = screen.getByText('User Two').closest('a');
    expect(link2).toHaveAttribute('href', '/admin/users/user2');
  });

});
