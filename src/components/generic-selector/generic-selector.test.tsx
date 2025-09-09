import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GenericSelector } from './generic-selector';

const DummyIcon: React.FC<{ size?: number; className?: string }> = () => (
  <svg data-testid="dummy-icon" />
);

const items = [
  { id: 'one', name: 'One', icon: 'A', color: '#111111' },
  { id: 'two', name: 'Two', icon: 'A', color: '#222222' },
  { id: 'three', name: 'Three', icon: 'A', color: '#333333' },
];

describe('GenericSelector', () => {
  it('renders items and selects on click', () => {
    const onSelectItem = vi.fn();
    render(
      <GenericSelector
        items={items}
        selectedItem=""
        onSelectItem={onSelectItem}
        iconMap={{ A: DummyIcon }}
        randomizeLabel="Randomize"
      />
    );

    fireEvent.click(screen.getByText('One'));
    expect(onSelectItem).toHaveBeenCalledWith('one');
  });

  it('calls onHideItem when hide button is clicked', () => {
    const onHideItem = vi.fn();
    render(
      <GenericSelector
        items={items}
        selectedItem=""
        onSelectItem={vi.fn()}
        onHideItem={onHideItem}
        iconMap={{ A: DummyIcon }}
        randomizeLabel="Randomize"
      />
    );

    const hideButton = screen.getByLabelText('Hide One');
    fireEvent.click(hideButton);
    expect(onHideItem).toHaveBeenCalledWith('one');
  });

  it('randomize button selects a random item', () => {
    const onSelectItem = vi.fn();
    const originalRandom = Math.random;
    Math.random = () => 0.1; // deterministically pick first item
    try {
      render(
        <GenericSelector
          items={items}
          selectedItem=""
          onSelectItem={onSelectItem}
          iconMap={{ A: DummyIcon }}
          randomizeLabel="Randomize"
        />
      );
      fireEvent.click(screen.getByTitle('Randomize'));
      expect(onSelectItem).toHaveBeenCalled();
    } finally {
      Math.random = originalRandom;
    }
  });
});

