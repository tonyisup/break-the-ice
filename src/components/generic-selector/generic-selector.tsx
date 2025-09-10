import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onHideItem?: (itemId: string) => void;
  onRandomizeItem?: (itemId: string | null) => void;
}

export interface GenericSelectorRef {
  randomizeItem: () => void;
  cancelRandomizingItem: () => void;
  confirmRandomizedItem: () => void;
}

export const GenericSelector = forwardRef<GenericSelectorRef, GenericSelectorProps>(
  ({ items, selectedItem, onSelectItem, iconMap, randomizeLabel = "Randomize", onHideItem, onRandomizeItem }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [randomItem, setRandomItem] = useState<SelectorItem | null>(null);

    // Drag scrolling state
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [dragScrollLeft, setDragScrollLeft] = useState(0);

    // Long press state for mobile
    const [longPressedItems, setLongPressedItems] = useState<Set<string>>(new Set());
    const longPressTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

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

    // Drag scrolling handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Don't start dragging if clicking on a button
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      setIsDragging(true);
      setStartX(e.pageX - container.offsetLeft);
      setDragScrollLeft(container.scrollLeft);
      container.style.cursor = 'grabbing';
      container.style.userSelect = 'none';
    }, []);

    const handleMouseLeave = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;

      setIsDragging(false);
      container.style.cursor = 'grab';
      container.style.userSelect = 'auto';
    }, []);

    const handleMouseUp = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;

      setIsDragging(false);
      container.style.cursor = 'grab';
      container.style.userSelect = 'auto';
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 2; // Scroll speed multiplier
      container.scrollLeft = dragScrollLeft - walk;
    }, [isDragging, startX, dragScrollLeft]);

    // Touch support for mobile devices
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Don't start dragging if touching a button
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }

      setIsDragging(true);
      setStartX(e.touches[0].pageX - container.offsetLeft);
      setDragScrollLeft(container.scrollLeft);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const x = e.touches[0].pageX - container.offsetLeft;
      const walk = (x - startX) * 2; // Scroll speed multiplier
      container.scrollLeft = dragScrollLeft - walk;
    }, [isDragging, startX, dragScrollLeft]);

    const handleTouchEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    // Long press handlers for individual items
    const handleItemTouchStart = useCallback((e: React.TouchEvent, itemId: string) => {
      // Clear all existing long press states when starting a new touch
      setLongPressedItems(new Set());

      // Clear any existing timers
      Object.values(longPressTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      longPressTimers.current = {};

      // Set a timer for long press (500ms)
      longPressTimers.current[itemId] = setTimeout(() => {
        setLongPressedItems(prev => new Set(prev).add(itemId));
      }, 500);
    }, []);

    const handleItemTouchEnd = useCallback((e: React.TouchEvent, itemId: string) => {
      // Clear the timer if touch ends before long press
      if (longPressTimers.current[itemId]) {
        clearTimeout(longPressTimers.current[itemId]);
        delete longPressTimers.current[itemId];
      }

      // Clear long press state immediately when touch ends
      // This will be overridden if the user clicks the hide button
      setLongPressedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, []);

    const handleItemTouchMove = useCallback((e: React.TouchEvent, itemId: string) => {
      // Clear the timer if touch moves (user is scrolling)
      if (longPressTimers.current[itemId]) {
        clearTimeout(longPressTimers.current[itemId]);
        delete longPressTimers.current[itemId];
      }
    }, []);

    const handleItemMouseDown = useCallback((e: React.MouseEvent, itemId: string) => {
      // Clear all long press states when starting mouse interaction
      setLongPressedItems(new Set());

      // Clear all timers
      Object.values(longPressTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      longPressTimers.current = {};
    }, []);

    const handleItemClick = useCallback((e: React.MouseEvent, itemId: string) => {
      // If item is in long press mode, don't select it
      if (longPressedItems.has(itemId)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }, [longPressedItems]);

    const handleHideButtonClick = useCallback((e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      // Remove from long press mode after hiding
      setLongPressedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }, []);

    // Clear all long press states when touching outside
    const clearAllLongPressStates = useCallback(() => {
      setLongPressedItems(new Set());
      // Clear all timers
      Object.values(longPressTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      longPressTimers.current = {};
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (container) {
        checkScrollButtons();
        container.addEventListener('scroll', checkScrollButtons);
        window.addEventListener('resize', checkScrollButtons);

        // Add global mouse up event to handle dragging outside the container
        const handleGlobalMouseUp = () => {
          if (isDragging) {
            handleMouseUp();
          }
        };

        // Add global touch events to clear long press states when touching outside
        const handleGlobalTouchStart = (e: TouchEvent) => {
          // Check if the touch is outside any item container
          const target = e.target as HTMLElement;
          const isInsideItem = target.closest('[data-item-container]');
          if (!isInsideItem) {
            clearAllLongPressStates();
          }
        };

        document.addEventListener('mouseup', handleGlobalMouseUp);
        document.addEventListener('touchstart', handleGlobalTouchStart);

        return () => {
          container.removeEventListener('scroll', checkScrollButtons);
          window.removeEventListener('resize', checkScrollButtons);
          document.removeEventListener('mouseup', handleGlobalMouseUp);
          document.removeEventListener('touchstart', handleGlobalTouchStart);

          // Clean up long press timers
          Object.values(longPressTimers.current).forEach(timer => {
            if (timer) clearTimeout(timer);
          });
          longPressTimers.current = {};
        };
      }
    }, [items, isDragging, handleMouseUp, clearAllLongPressStates]);

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

    const handleSetRandomItem = (item: SelectorItem) => {
      if (!item) return;
      setRandomItem(item);
      onRandomizeItem?.(item.id);
      setTimeout(() => {
        scrollToCenter(item.id);
      }, 100);

    };

    const handleRandomItem = () => {
      if (!items || items.length === 0) return;
      const randomItem = items.filter(item => item.id !== selectedItem)[Math.floor(Math.random() * items.length)];
      // onSelectItem(randomItem.id);
      handleSetRandomItem(randomItem);
    };

    // Expose the randomizeItem function to parent components
    useImperativeHandle(ref, () => ({
      randomizeItem: handleRandomItem,
      cancelRandomizingItem: () => {
        setRandomItem(null);
        onRandomizeItem?.(null);
        scrollToCenter(selectedItem);
      },
      confirmRandomizedItem: () => {
        if (!randomItem) return;
        onSelectItem(randomItem.id);
        setRandomItem(null);
        onRandomizeItem?.(null);
      },
    }));

    return (
      <div className="relative">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={scrollToLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={scrollToRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-900 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}
        <div className={cn("flex items-center gap-2")}>
          <div
            ref={containerRef}
            className={cn(
              "flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide scroll-smooth cursor-grab select-none"
            )}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {items && items.map((item) => {
              const Icon = iconMap[item.icon];
              const isSelected = selectedItem === item.id;
              const isLongPressed = longPressedItems.has(item.id);
              const showHideButton = isLongPressed || false; // Will be overridden by CSS hover on desktop

              return (
                <div
                  key={item.id}
                  className="relative group"
                  data-item-container
                  ref={(el) => {
                    buttonRefs.current[item.id] = el;
                  }}
                  onTouchStart={(e) => handleItemTouchStart(e, item.id)}
                  onTouchEnd={(e) => handleItemTouchEnd(e, item.id)}
                  onTouchMove={(e) => handleItemTouchMove(e, item.id)}
                >
                  <button
                    onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                    onClick={(e) => {
                      handleItemClick(e, item.id);
                      if (!isLongPressed) {
                        handleSetRandomItem(item);
                      }
                    }}
                    className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${isSelected
                        ? 'text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    style={
                      isSelected
                        ? {
                          backgroundColor: item.color
                        }
                        : (randomItem?.id === item.id) ? {
                          borderColor: item.color,
                          borderWidth: '4px'
                        } : {}

                    }
                  >
                    {Icon && <Icon size={20} />}
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {item.name}
                    </span>
                  </button>
                  {onHideItem && (
                    <button
                      onClick={(e) => {
                        handleHideButtonClick(e, item.id);
                        onHideItem(item.id);
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className={`absolute -top-1 -right-1 z-20 p-0.5 bg-gray-300 dark:bg-gray-600 rounded-full transition-opacity ${showHideButton ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      aria-label={`Hide ${item.name}`}
                    >
                      <EyeOff size={12} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);
