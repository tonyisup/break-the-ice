import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { CategorySelector } from './category-selector';

vi.mock('../../../convex/_generated/api', () => ({
  api: {
    categories: { getCategories: {} },
  },
}));

import { useQuery } from 'convex/react';
vi.mock('convex/react', () => ({ useQuery: vi.fn() }));

describe('CategorySelector', () => {
  it('renders categories and calls onSelectCategory', () => {
    vi.mocked(useQuery).mockReturnValue([
      { id: 'c1', name: 'General', icon: 'Sparkles', gradient: ['#000', '#111'] },
      { id: 'c2', name: 'Work', icon: 'Briefcase', gradient: ['#222', '#333'] },
    ] as any);

    const onSelect = vi.fn();
    render(<CategorySelector selectedCategory="" onSelectCategory={onSelect} />);
    fireEvent.click(screen.getByText('Work'));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });
});

