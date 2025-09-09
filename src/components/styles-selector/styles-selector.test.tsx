import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { StyleSelector } from './styles-selector';

vi.mock('../../../convex/_generated/api', () => ({
  api: {
    styles: { getStyles: {} },
  },
}));

import { useQuery } from 'convex/react';
import { vi, describe, it, expect } from 'vitest';
vi.mock('convex/react', () => ({ useQuery: vi.fn() }));

describe('StyleSelector', () => {
  it('calls onSelectStyle with no random order first style by default and on click', () => {
    vi.mocked(useQuery).mockReturnValue([
      { id: 's1', name: 'Casual', icon: 'HelpCircle', color: '#f00' },
      { id: 's2', name: 'Formal', icon: 'Box', color: '#0f0' },
    ] as any);

    const onSelectStyle = vi.fn();
    render(
      <StyleSelector
        selectedStyle=""
        randomOrder={false}
        onSelectStyle={onSelectStyle}
      />
    );

    // First item auto-selected
    expect(onSelectStyle).toHaveBeenCalledWith('s1');

    // Click second style
    fireEvent.click(screen.getByText('Formal'));
    expect(onSelectStyle).toHaveBeenCalledWith('s2');
  });
});

describe('StyleSelector', () => {
  it('calls onSelectStyle with random order', () => {
    vi.mocked(useQuery).mockReturnValue([
      { id: 's1', name: 'Casual', icon: 'HelpCircle', color: '#f00' },
      { id: 's2', name: 'Formal', icon: 'Box', color: '#0f0' },
    ] as any);

    const onSelectStyle = vi.fn();
    render(
      <StyleSelector
        selectedStyle=""
        randomOrder={true}
        onSelectStyle={onSelectStyle}
      />
    );
    //Random order means we can't predict the order of the styles

    // First item auto-selected
    expect(onSelectStyle).toHaveBeenCalled();

    // Click second style
    fireEvent.click(screen.getByText('Casual'));
    expect(onSelectStyle).toHaveBeenCalledWith('s1');

    // Click formal style
    fireEvent.click(screen.getByText('Formal'));
    expect(onSelectStyle).toHaveBeenCalledWith('s2');
  });
});

