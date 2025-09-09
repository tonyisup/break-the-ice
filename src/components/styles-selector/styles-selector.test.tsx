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
vi.mock('convex/react', () => ({ useQuery: vi.fn() }));

describe('StyleSelector', () => {
  it('calls onSelectStyle with first style by default and on click', () => {
    vi.mocked(useQuery).mockReturnValue([
      { id: 's1', name: 'Casual', icon: 'HelpCircle', color: '#f00' },
      { id: 's2', name: 'Formal', icon: 'Box', color: '#0f0' },
    ] as any);

    const onSelectStyle = vi.fn();
    render(
      <StyleSelector
        selectedStyle=""
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

