import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { ToneSelector } from './tone-selector';

vi.mock('../../../convex/_generated/api', () => ({
  api: {
    tones: { getTones: {} },
  },
}));

import { useQuery } from 'convex/react';
vi.mock('convex/react', () => ({ useQuery: vi.fn() }));

describe('ToneSelector', () => {
  it('calls onSelectTone with first tone by default and on click', () => {
    vi.mocked(useQuery).mockReturnValue([
      { id: 't1', name: 'Happy', icon: 'Smile', color: '#f00' },
      { id: 't2', name: 'Thoughtful', icon: 'Brain', color: '#0f0' },
    ] as any);

    const onSelectTone = vi.fn();
    render(
      <ToneSelector
        selectedTone=""
        onSelectTone={onSelectTone}
        randomOrder={false}
      />
    );

    // First item auto-selected
    expect(onSelectTone).toHaveBeenCalledWith('t1');

    // Click second tone
    fireEvent.click(screen.getByText('Thoughtful'));
    expect(onSelectTone).toHaveBeenCalledWith('t2');
  });
});

