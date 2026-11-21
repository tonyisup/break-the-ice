import React, { ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff } from '@/components/ui/icons/icons';
import { Icon, IconComponent } from '../ui/icons/icon';

interface CollapsibleSectionProps {
  title: string;
  icons?: Icon[];
  iconColors?: (string | undefined)[];
  children: ReactNode;
  isOpen: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  count?: ReactNode;
  visibleCount?: number;
  hiddenCount?: number;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icons,
  iconColors,
  children,
  isOpen,
  onOpenChange,
  count,
  visibleCount,
  hiddenCount,
}) => {
  return (
    <section>
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex w-full min-h-11 items-center justify-between cursor-pointer border-b p-2 mb-1 text-left bg-white/30 dark:bg-black/30 backdrop-blur-sm rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        onClick={() => onOpenChange?.(!isOpen)}
      >
        <span className="flex items-center gap-2 font-semibold dark:text-white text-black">
          {title}
          {icons && (
            <span className="flex items-center gap-2 px-2">
              {icons.map((icon, index) =>
                icon ? (
                  <IconComponent
                    icon={icon}
                    size={24}
                    key={index}
                    color={iconColors?.[index]}
                  />
                ) : null,
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {visibleCount !== undefined && hiddenCount !== undefined ? (
            <span className="flex gap-2">
              <span className="flex items-center gap-1.5 bg-gray-500/20 text-gray-700 dark:text-gray-400 text-sm font-semibold px-2 py-1 rounded-full">
                <span>{hiddenCount}</span>
                <span className="hidden md:inline">Hidden</span>
                <EyeOff className="md:hidden w-4 h-4" />
              </span>
              <span className="flex items-center gap-1.5 bg-green-500/20 text-green-700 dark:text-green-400 text-sm font-semibold px-2 py-1 rounded-full">
                <span>{visibleCount}</span>
                <span className="hidden md:inline">Visible</span>
                <Eye className="md:hidden w-4 h-4" />
              </span>
            </span>
          ) : count !== undefined && (
            <span className="bg-white/20 dark:bg-black/20 text-sm font-semibold px-2 py-1 rounded-full">
              {count}
            </span>
          )}
          <ChevronDown
            className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""
              }`}
            size={24}
            aria-hidden="true"
          />
        </span>
      </button>
      {isOpen && (
        <div className="min-w-0 p-4 bg-white/30 dark:bg-black/30 backdrop-blur-sm rounded-lg">
          {children}
        </div>
      )}
    </section>
  );
};
