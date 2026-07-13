import React from 'react';
import { iconMap } from '@/components/ui/icons/icons';

type Category = {
  id: string;
  name: string;
  icon: string;
  gradient: [string, string];
};

interface CategorySelectorProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories?: Category[];
}

export function CategorySelector({ selectedCategory, onSelectCategory, categories = [] }: CategorySelectorProps) {
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {categories.map((category) => {
        const isSelected = selectedCategory === category.id;
        const CategoryIcon = iconMap[category.icon];

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
            {CategoryIcon ? <CategoryIcon size={20} /> : null}
            <span className="text-sm font-semibold whitespace-nowrap">
              {category.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
