import React, { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  count?: number;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  isOpen,
  onOpenChange,
  count,
}) => {
  return (
    <section>
      <div
        className="flex items-center justify-between cursor-pointer border-b pb-2 mb-4"
        onClick={() => onOpenChange(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold dark:text-white text-black border-white/30">{title}</h2>
          {count !== undefined && (
            <span className="bg-white/20 dark:bg-black/20 text-sm font-semibold px-2 py-1 rounded-full">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          size={24}
        />
      </div>
      {isOpen && <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg">{children}</div>}
    </section>
  );
};
