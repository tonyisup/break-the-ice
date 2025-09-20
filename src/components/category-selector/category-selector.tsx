import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import * as icons from '@/components/ui/icons/icons';

interface CategorySelectorProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  const categories = useQuery(api.categories.getCategories);
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {categories && categories.map((category) => {
        const isSelected = selectedCategory === category.id;

        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${
              isSelected 
                ? 'text-white shadow-lg' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            style={
              isSelected 
                ? {
                    background: `linear-gradient(135deg, ${category.gradient[0]}, ${category.gradient[1]})`
                  }
                : {}
            }
          >
            {React.createElement(icons[category.icon as keyof typeof icons], { size: 20 })}
            <span className="text-sm font-semibold whitespace-nowrap">
              {category.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
