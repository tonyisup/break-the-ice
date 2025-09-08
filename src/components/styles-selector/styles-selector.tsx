import { useQuery } from 'convex/react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
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
  GitPullRequest,
  BowArrow
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
  GitPullRequest,
  BowArrow
};

interface StyleSelectorProps {
  selectedStyle: string;
  onSelectStyle: (style: string) => void;
}

export interface StyleSelectorRef {
  randomizeStyle: () => void;
}
export const StyleSelector = forwardRef<StyleSelectorRef, StyleSelectorProps>(({ selectedStyle, onSelectStyle }, ref) => {
  const styles = useQuery(api.styles.getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  
  const scrollToCenter = (styleId: string) => {
    const container = containerRef.current;
    const button = buttonRefs.current[styleId];
    
    if (container && button) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      // Calculate the scroll position to center the button
      const scrollLeft = button.offsetLeft - (containerRect.width / 2) + (buttonRect.width / 2);
      
      container.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  };

  const handleRandomStyle = () => {
    if (!styles) return;
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    onSelectStyle(randomStyle.id);
    
    // Scroll to center the randomly selected style after a brief delay
    setTimeout(() => {
      scrollToCenter(randomStyle.id);
    }, 100);
  };

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    randomizeStyle: handleRandomStyle,
  }));

  return (
    <div 
      ref={containerRef} 
      className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide"
    >
      <button
        onClick={handleRandomStyle}
        className="flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <Shuffle size={20} />
      </button>
      {styles && styles.map((style) => {
        const Icon = iconMap[style.icon as keyof typeof iconMap];
        const isSelected = selectedStyle === style.id;

        return (
          <button
            key={style.id}
            ref={(el) => {
              buttonRefs.current[style.id] = el;
            }}
            onClick={() => onSelectStyle(style.id)}
            className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${isSelected
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
});
