import { cn } from "@/lib/utils";
import { Doc } from "../../../convex/_generated/dataModel";
import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons/icons';
import DynamicIcon from "../ui/dynamic-icon";

interface MultiSelectStylesSelectorProps {
  styles: (Doc<"styles"> & { count: number })[];
  selectedStyles: string[];
  onSelectStyle: (styleId: string) => void;
}

export const MultiSelectStylesSelector = ({
  styles,
  selectedStyles,
  onSelectStyle,
}: MultiSelectStylesSelectorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollButtons = () => {
    const container = containerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
    }
  };

  const scrollToLeft = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollToRight = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      checkScrollButtons();
      container.addEventListener('scroll', checkScrollButtons);
      window.addEventListener('resize', checkScrollButtons);

      return () => {
        container.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
      };
    }
  }, [styles]);

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          onClick={scrollToLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={scrollToRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
      )}
      <div
        ref={containerRef}
        className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide scroll-smooth"
      >
        {styles.map((style) => {
          const isSelected = selectedStyles.includes(style.id);
          return (
            <button
              key={style.id}
              data-testid="style-selector-button"
              onClick={() => onSelectStyle(style.id)}
              className={cn(
                "p-2 px-4 rounded-lg border whitespace-nowrap flex items-center gap-2 transition-colors",
                !isSelected && "bg-gray-200 dark:bg-gray-800"
              )}
              style={{
                borderColor: isSelected ? style.color : undefined,
                color: isSelected ? 'white' : undefined,
              }}
            >
              <DynamicIcon color={style.color} name={style.icon} size={16} />
              {style.name} <span className="text-xs opacity-75">({style.count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
