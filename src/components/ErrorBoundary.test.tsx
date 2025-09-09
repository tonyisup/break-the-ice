import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom() {
  throw new Error('Boom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders fallback UI on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});

