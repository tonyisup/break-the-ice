import { Sparkles, Brain, Briefcase, HelpCircle, Zap, Shuffle, Dumbbell } from 'lucide-react';

export interface Category {
  id: string;
  name: string;
  icon: string;
  gradient: [string, string];
  description: string;
  hidden: boolean; // if true, the category will not be shown in the selector
}

export const categories: Category[] = [  
  {
    id: 'random',
    name: 'Random Mix',
    icon: 'Shuffle',
    gradient: ['#F093FB', '#F5576C'],
    description: 'A mix of everything',
    hidden: true
  },
  {
    id: 'fun',
    name: 'Fun & Silly',
    icon: 'Sparkles',
    gradient: ['#FF6B6B', '#FFE66D'],
    description: 'Light-hearted questions to break the ice',
    hidden: false
  },
  {
    id: 'deep',
    name: 'Deep & Thoughtful',
    icon: 'Brain',
    gradient: ['#667EEA', '#764BA2'],
    description: 'Questions that spark meaningful conversations',
    hidden: false
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: 'Briefcase',
    gradient: ['#0093E9', '#80D0C7'],
    description: 'Great for work events and networking',
    hidden: false
  },
  {
    id: 'wouldYouRather',
    name: 'Would You Rather',
    icon: 'HelpCircle',
    gradient: ['#FA709A', '#FEE140'],
    description: 'Classic choice-based questions',
    hidden: false
  },
  {
    id: 'thisOrThat',
    name: 'This or That',
    icon: 'Zap',
    gradient: ['#30CFD0', '#330867'],
    description: 'Quick preference questions',
    hidden: false
  },
  {
    id: 'crossfit',
    name: 'CrossFit',
    icon: 'Dumbbell',
    gradient: ['#F36B6B', '#F3E66D'],
    description: 'QOD questions for CrossFit',
    hidden: false
  }
];

const iconMap = {
  Sparkles,
  Brain,
  Briefcase,
  HelpCircle,
  Zap,
  Shuffle, 
  Dumbbell
};

interface CategorySelectorProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {categories.map((category) => {
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
