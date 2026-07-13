import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import Root from './Root';

vi.mock('./pages/LandingPage', () => {
  return { default: () => <div>Landing page</div> };
});

describe('Root component', () => {
  it('renders the landing page', () => {
    render(<Root />);
    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });
});
