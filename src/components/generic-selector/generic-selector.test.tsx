import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericSelector, GenericSelectorRef } from './generic-selector';
import { ItemDetails } from '../item-detail-drawer';

vi.mock('@/components/ui/icons/icon', () => ({
  IconComponent: ({ icon, size, color }: { icon: string, size: number, color: string }) => (
    <div data-testid="mock-icon" data-icon={icon} data-size={size} data-color={color} />
  )
}));

window.HTMLElement.prototype.scrollTo = vi.fn();

const mockItems: ItemDetails[] = [
  { id: '1', name: 'Item 1', type: 'Style', description: 'desc 1', icon: 'Cat', color: '#ff0000' },
  { id: '2', name: 'Item 2', type: 'Style', description: 'desc 2', icon: 'Dog', color: '#00ff00' },
  { id: '3', name: 'Item 3', type: 'Style', description: 'desc 3', icon: 'Rabbit', color: '#0000ff' },
];

describe('GenericSelector', () => {
  let ref: React.RefObject<GenericSelectorRef>;
  const mockOnClickItem = vi.fn();
  const mockOnSelectItem = vi.fn();
  const mockOnRandomizeItem = vi.fn();
  const mockSetHighlightedItem = vi.fn();

  beforeEach(() => {
    ref = React.createRef<GenericSelectorRef>();
    vi.clearAllMocks();
  });

  const renderComponent = (selectedItem = '1', highlightedItem = null) => {
    render(
      <GenericSelector
        ref={ref}
        items={mockItems}
        selectedItem={selectedItem}
        onClickItem={mockOnClickItem}
        onSelectItem={mockOnSelectItem}
        onRandomizeItem={mockOnRandomizeItem}
        highlightedItem={highlightedItem}
        setHighlightedItem={mockSetHighlightedItem}
      />
    );
  };

  it('renders all items', () => {
    renderComponent();
    mockItems.forEach(item => {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    });
  });

  it('calls onClickItem when an item is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Item 2'));
    expect(mockOnClickItem).toHaveBeenCalledWith('2');
  });

  it('calls onSelectItem when confirmRandomizedItem is called', () => {
    renderComponent('1', mockItems[1]); // highlightedItem is Item 2
    ref.current?.confirmRandomizedItem();
    expect(mockOnSelectItem).toHaveBeenCalledWith('2');
    expect(mockSetHighlightedItem).toHaveBeenCalledWith(null);
  });

  it('randomizes an item when randomizeItem is called', () => {
    renderComponent();
    ref.current?.randomizeItem();
    expect(mockOnRandomizeItem).toHaveBeenCalledWith(expect.any(String));
    expect(mockSetHighlightedItem).toHaveBeenCalledWith(expect.any(Object));
  });

  it('cancels randomization when cancelRandomizingItem is called', () => {
    renderComponent('1', mockItems[1]); // highlightedItem is Item 2
    ref.current?.cancelRandomizingItem();
    expect(mockSetHighlightedItem).toHaveBeenCalledWith(null);
    expect(mockOnRandomizeItem).toHaveBeenCalledWith(null);
  });
});
