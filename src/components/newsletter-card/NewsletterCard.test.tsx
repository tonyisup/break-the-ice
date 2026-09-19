import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { NewsletterCard } from './NewsletterCard';

const subscribe = vi.hoisted(() => vi.fn());
vi.mock('convex/react', () => ({ useAction: () => subscribe }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
beforeEach(() => subscribe.mockReset());

it('shows only the form before submission and labels the email field', () => {
  render(<NewsletterCard variant="blend" />);
  expect(screen.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  expect(screen.queryByText('You’re subscribed')).not.toBeInTheDocument();
  expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
});

it.each([
  ['verification_required', 'Check your email'],
  ['subscribed', 'You’re subscribed'],
])('replaces the form with the %s result', async (status, heading) => {
  let resolve!: (value: unknown) => void;
  subscribe.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<NewsletterCard variant="blend" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'reader@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
  expect(screen.getByRole('button', { name: 'Subscribing...' })).toBeDisabled();
  await act(async () => resolve({ status, success: true }));
  expect(screen.getByRole('heading', { name: heading })).toHaveFocus();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('keeps the email and exposes an inline error when the request fails', async () => {
  subscribe.mockResolvedValue({ success: false, status: 'error', message: 'Try again later.' });
  render(<NewsletterCard variant="standout" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'reader@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again later.'));
  expect(screen.getByRole('textbox')).toHaveValue('reader@example.com');
  expect(screen.getByRole('button', { name: 'Subscribe Now' })).toBeEnabled();
});
