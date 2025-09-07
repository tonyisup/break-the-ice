import { useQuery } from 'convex/react';
import { 
  HelpCircle, 
  GitBranch, 
  Clock, 
  Anchor, 
  Zap, 
  Shuffle, 
  List, 
  Heart, 
  Box, 
  MessageCircle, 
  Type, 
  Award, 
  TrendingUp, 
  Smile, 
  GitPullRequest 
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';

const iconMap = {
  HelpCircle,
  GitBranch,
  Clock,
  Anchor,
  Zap,
  Shuffle,
  List,
  Heart,
  Box,
  MessageCircle,
  Type,
  Award,
  TrendingUp,
  Smile,
  GitPullRequest
};

interface StyleSelectorProps {
  selectedStyle: string;
  onSelectStyle: (style: string) => void;
}

export function StyleSelector({ selectedStyle, onSelectStyle }: StyleSelectorProps) {
  const styles = useQuery(api.styles.getStyles);
  
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {styles && styles.map((style) => {
        const Icon = iconMap[style.icon as keyof typeof iconMap];
        const isSelected = selectedStyle === style.id;

        return (
          <button
            key={style.id}
            onClick={() => onSelectStyle(style.id)}
            className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${
              isSelected 
                ? 'text-white shadow-lg' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            style={
              isSelected 
                ? {
                    backgroundColor: style.color
                  }
                : {}
            }
          >
            <Icon size={20} />
            <span className="text-sm font-semibold whitespace-nowrap">
              {style.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
