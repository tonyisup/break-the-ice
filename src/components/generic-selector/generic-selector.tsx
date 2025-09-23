import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons/icons';
import { IconComponent } from '@/components/ui/icons/icon';
import { cn, isColorDark } from '@/lib/utils';
import React from 'react';
import { ItemDetails as SelectorItem } from '../item-detail-drawer';

interface GenericSelectorProps {
  items: SelectorItem[] | undefined;
  selectedItem: string;
  onClickItem: (itemId: string) => void;
  onSelectItem: (itemId: string) => void;
  randomizeLabel?: string;
  onRandomizeItem?: (itemId: string | null) => void;  
  highlightedItem: SelectorItem | null;
  setHighlightedItem: (item: SelectorItem | null) => void;
}

export interface GenericSelectorRef {
  randomizeItem: () => void;
  cancelRandomizingItem: () => void;
  confirmRandomizedItem: () => void;
  scrollToCenter: (itemId: string) => void;
  scrollToSelectedItem: () => void;
}

export const GenericSelector = forwardRef<GenericSelectorRef, GenericSelectorProps>(
  ({ items, selectedItem, onClickItem, onSelectItem, randomizeLabel = "Randomize", onRandomizeItem, highlightedItem, setHighlightedItem }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Drag scrolling state
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [dragScrollLeft, setDragScrollLeft] = useState(0);

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

        document.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
          container.removeEventListener('scroll', checkScrollButtons);
          window.removeEventListener('resize', checkScrollButtons);
          document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
      }
    }, [items, isDragging, handleMouseUp]);

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
      setHighlightedItem(item);
      onRandomizeItem?.(item.id);
      setTimeout(() => {
        scrollToCenter(item.id);
      }, 100);

    };

    const handleRandomItem = () => {
      if (!items || items.length === 0) return;
      const filteredItems = items.filter((item) => item.id !== selectedItem);
      const randomItem = filteredItems[Math.floor(Math.random() * filteredItems.length)];
      // onSelectItem(randomItem.id);
      handleSetRandomItem(randomItem);
    };

    // Expose the randomizeItem function to parent components
    useImperativeHandle(ref, () => ({
      scrollToSelectedItem: () => {
        scrollToCenter(selectedItem);
      },
      randomizeItem: handleRandomItem,
      cancelRandomizingItem: () => {
        setHighlightedItem(null);
        onRandomizeItem?.(null);
        scrollToCenter(selectedItem);
      },
      confirmRandomizedItem: () => {
        if (!highlightedItem) return;
        onSelectItem(highlightedItem.id);
        setHighlightedItem(null);
        onRandomizeItem?.(null);
      },
      scrollToCenter: scrollToCenter,
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
        <div className={cn("flex items-center")}>
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
              const isSelected = selectedItem === item.id;

              return (
                <div
                  key={item.id}
                  className="relative group"
                  ref={(el) => {
                    buttonRefs.current[item.id] = el;
                  }}
                >
                  <button
                    onClick={() => onClickItem(item.id)}
                    className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${isSelected
                        ? 'text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    style={
                      isSelected
                        ? {
                          backgroundColor: item.color
                        }
                        : (highlightedItem?.id === item.id) ? {
                          borderColor: item.color,
                          borderWidth: '4px'
                        } : {}

                    }
                  >
                    <IconComponent color={isSelected ? isColorDark(item.color) ? "white" : "black" : item.color} icon={item.icon} size={20} />
                    <span className={cn("text-sm font-semibold whitespace-nowrap", isSelected ? isColorDark(item.color) ? "text-white" : "text-black" : "text-gray-600 dark:text-gray-400")}>
                      {item.name}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);
