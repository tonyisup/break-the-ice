import { cn } from "@/lib/utils";
import { Icon } from "../ui/icons/icon";
import { Doc } from "../../../convex/_generated/dataModel";
import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons/icons';

interface MultiSelectTonesSelectorProps {
  tones: (Doc<"tones"> & { count: number })[];
  selectedTones: string[];
  onSelectTone: (toneId: string) => void;
}

export const MultiSelectTonesSelector = ({
  tones,
  selectedTones,
  onSelectTone,
}: MultiSelectTonesSelectorProps) => {
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
  }, [tones]);

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
        {tones.map((tone) => (
          <button
            key={tone.id}
            data-testid="tone-selector-button"
            onClick={() => onSelectTone(tone.id)}
            className={cn(
              "p-2 rounded-lg border whitespace-nowrap",
              selectedTones.includes(tone.id)
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-800"
            )}
          >
            {tone.name} <span className="text-xs opacity-75">({tone.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
};
