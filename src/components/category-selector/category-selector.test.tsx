import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategorySelector } from './category-selector';

// Mock convex/react
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
}));

// Mock icons
vi.mock('@/components/ui/icons', () => ({
  Heart: () => <svg>Heart</svg>,
  Smile: () => <svg>Smile</svg>,
}));

describe('CategorySelector', () => {
  const mockOnSelectCategory = vi.fn();
  const mockCategories = [
    { id: '1', name: 'Category 1', icon: 'Heart', gradient: ['#ff0000', '#00ff00'] },
    { id: '2', name: 'Category 2', icon: 'Smile', gradient: ['#0000ff', '#ffff00'] },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    const { useQuery } = vi.mocked(await import('convex/react'));
    useQuery.mockReturnValue(mockCategories);
  });

  it('renders categories', () => {
    render(<CategorySelector selectedCategory="1" onSelectCategory={mockOnSelectCategory} />);
    expect(screen.getByText('Category 1')).toBeInTheDocument();
    expect(screen.getByText('Category 2')).toBeInTheDocument();
  });

  it('calls onSelectCategory when a category is clicked', () => {
    render(<CategorySelector selectedCategory="1" onSelectCategory={mockOnSelectCategory} />);
    fireEvent.click(screen.getByText('Category 2'));
    expect(mockOnSelectCategory).toHaveBeenCalledWith('2');
  });
});
