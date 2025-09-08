import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignOutButton } from './SignOutButton';
import { useConvexAuth } from 'convex/react';

vi.mock('convex/react');
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: () => {} }),
}));

describe('SignOutButton', () => {
  it('renders sign out button when authenticated', () => {
    vi.mocked(useConvexAuth).mockReturnValue({ isAuthenticated: true, isLoading: false });
    render(<SignOutButton />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders nothing when not authenticated', () => {
    vi.mocked(useConvexAuth).mockReturnValue({ isAuthenticated: false, isLoading: false });
    const { container } = render(<SignOutButton />);
    expect(container).toBeEmptyDOMElement();
  });
});
