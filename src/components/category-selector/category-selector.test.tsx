import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategorySelector } from './category-selector';

describe('CategorySelector', () => {
  const mockOnSelectCategory = vi.fn();
  const mockCategories = [
    { id: '1', name: 'Category 1', icon: 'Heart', gradient: ['#ff0000', '#00ff00'] },
    { id: '2', name: 'Category 2', icon: 'Smile', gradient: ['#0000ff', '#ffff00'] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders categories', () => {
    render(<CategorySelector selectedCategory="1" onSelectCategory={mockOnSelectCategory} categories={mockCategories as any} />);
    expect(screen.getByText('Category 1')).toBeInTheDocument();
    expect(screen.getByText('Category 2')).toBeInTheDocument();
  });

  it('calls onSelectCategory when a category is clicked', () => {
    render(<CategorySelector selectedCategory="1" onSelectCategory={mockOnSelectCategory} categories={mockCategories as any} />);
    fireEvent.click(screen.getByText('Category 2'));
    expect(mockOnSelectCategory).toHaveBeenCalledWith('2');
  });
});
