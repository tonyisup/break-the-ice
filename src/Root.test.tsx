import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter, Navigate } from 'react-router-dom';
import Root from './Root';
import { useLocalStorage } from './hooks/useLocalStorage';

// Mock dependencies
vi.mock('./hooks/useLocalStorage');
vi.mock('./pages/LandingPage', () => ({
  default: () => <div>Landing Page</div>,
}));
vi.mock('react-router-dom', async (importOriginal) => {
    const original = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...original,
        Navigate: vi.fn(({ to }) => <div>Navigating to {to}</div>),
    };
});

describe('Root component', () => {
  // Currently disabled until product showcase video is added
  // it('should render LandingPage when bypassLandingPage is false', () => {
  //   // Arrange
  //   vi.mocked(useLocalStorage).mockReturnValue([false, vi.fn()]);

  //   // Act
  //   render(
  //     <MemoryRouter>
  //       <Root />
  //     </MemoryRouter>
  //   );

  //   // Assert
  //   expect(screen.getByText('Landing Page')).toBeInTheDocument();
  //   expect(vi.mocked(Navigate)).not.toHaveBeenCalled();
  // });

  it('should navigate to /app when bypassLandingPage is true', () => {
    // Arrange
    vi.mocked(useLocalStorage).mockReturnValue([true, vi.fn()]);

    // Act
    render(
      <MemoryRouter>
        <Root />
      </MemoryRouter>
    );

    // Assert
    expect(screen.queryByText('Landing Page')).not.toBeInTheDocument();
    // Check the props of the Navigate component
    const navigateProps = vi.mocked(Navigate).mock.calls[0][0];
    expect(navigateProps.to).toBe('/app');
    expect(navigateProps.replace).toBe(true);
    expect(screen.getByText('Navigating to /app')).toBeInTheDocument();
  });
});
