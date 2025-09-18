import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CardShuffleLoader from './card-shuffle-loader';

describe('CardShuffleLoader', () => {
  it('renders with default loading text', () => {
    render(<CardShuffleLoader />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom loading text', () => {
    render(<CardShuffleLoader loadingText="Shuffling..." />);
    expect(screen.getByText('Shuffling...')).toBeInTheDocument();
  });
});
