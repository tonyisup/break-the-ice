import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter, Navigate } from 'react-router-dom';
import Root from './Root';

// Mock dependencies
vi.mock('react-router-dom', async (importOriginal) => {
    const original = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...original,
        Navigate: vi.fn(({ to }) => <div>Navigating to {to}</div>),
    };
});

describe('Root component', () => {
  it('should navigate to /app', () => {
    // Act
    render(
      <MemoryRouter>
        <Root />
      </MemoryRouter>
    );

    // Assert
    expect(screen.getByText('Navigating to /app')).toBeInTheDocument();

    // Check the props of the Navigate component
    const navigateProps = vi.mocked(Navigate).mock.calls[0][0];
    expect(navigateProps.to).toBe('/app');
    expect(navigateProps.replace).toBe(true);
  });
});
