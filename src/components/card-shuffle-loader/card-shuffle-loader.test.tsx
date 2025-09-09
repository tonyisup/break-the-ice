import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import CardShuffleLoader from './card-shuffle-loader';

describe('CardShuffleLoader', () => {
  it('renders loading text and base card', () => {
    render(<CardShuffleLoader loadingText="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // Base card symbol exists
    expect(document.querySelector('.card-base')).toBeTruthy();
  });
});

