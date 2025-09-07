import { useQuery } from 'convex/react';
import { Sparkles, Brain, Briefcase, HelpCircle, Zap, Shuffle, Dumbbell, Scale } from 'lucide-react';
import { api } from '../../../convex/_generated/api';

const iconMap = {
  Sparkles,
  Brain,
  Briefcase,
  HelpCircle,
  Zap,
  Shuffle, 
  Dumbbell,
  Scale
};

interface CategorySelectorProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  const categories = useQuery(api.categories.getCategories);
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {categories && categories.map((category) => {
        const Icon = iconMap[category.icon as keyof typeof iconMap];
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
            <Icon size={20} />
            <span className="text-sm font-semibold whitespace-nowrap">
              {category.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
