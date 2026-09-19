import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import Root from './Root';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('./pages/LandingPage', () => {
  return { default: () => <div>Landing page</div> };
});

describe('Root component', () => {
  it('sends old sample-question links to the real feed', async () => {
    render(<MemoryRouter initialEntries={['/#try-one']}><Routes>
      <Route path="/" element={<Root />} />
      <Route path="/app" element={<div>Question feed</div>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('Question feed')).toBeInTheDocument();
  });
  it('renders the landing page', () => {
    render(<MemoryRouter><Root /></MemoryRouter>);
    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });
});
