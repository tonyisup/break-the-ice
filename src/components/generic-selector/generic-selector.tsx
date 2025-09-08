import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';

export interface SelectorItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface GenericSelectorProps {
  items: SelectorItem[] | undefined;
  selectedItem: string;
  onSelectItem: (itemId: string) => void;
  iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>>;
  randomizeLabel?: string;
}

export interface GenericSelectorRef {
  randomizeItem: () => void;
}

export const GenericSelector = forwardRef<GenericSelectorRef, GenericSelectorProps>(
  ({ items, selectedItem, onSelectItem, iconMap, randomizeLabel = "Randomize" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    
    const checkScrollButtons = () => {
      const container = containerRef.current;
      if (container) {
        setCanScrollLeft(container.scrollLeft > 0);
        setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
      }
    };

    const scrollLeft = () => {
      const container = containerRef.current;
      if (container) {
        container.scrollBy({ left: -200, behavior: 'smooth' });
      }
    };

    const scrollRight = () => {
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
    }, [items]);
    
    const scrollToCenter = (itemId: string) => {
      const container = containerRef.current;
      const button = buttonRefs.current[itemId];
      
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

    const handleRandomItem = () => {
      if (!items || items.length === 0) return;
      const randomItem = items[Math.floor(Math.random() * items.length)];
      onSelectItem(randomItem.id);
      
      // Scroll to center the randomly selected item after a brief delay
      setTimeout(() => {
        scrollToCenter(randomItem.id);
      }, 100);
    };

    // Expose the randomizeItem function to parent components
    useImperativeHandle(ref, () => ({
      randomizeItem: handleRandomItem,
    }));

    return (
      <div className="relative">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}
        
        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}
        
        <div 
          ref={containerRef} 
          className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide scroll-smooth"
        >
          <button
            onClick={handleRandomItem}
            className="flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            title={randomizeLabel}
          >
            <Shuffle size={20} />
          </button>
          {items && items.map((item) => {
            const Icon = iconMap[item.icon];
            const isSelected = selectedItem === item.id;

            return (
              <button
                key={item.id}
                ref={(el) => {
                  buttonRefs.current[item.id] = el;
                }}
                onClick={() => onSelectItem(item.id)}
                className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${
                  isSelected
                    ? 'text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: item.color
                      }
                    : {}
                }
              >
                {Icon && <Icon size={20} />}
                <span className="text-sm font-semibold whitespace-nowrap">
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
