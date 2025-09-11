import React, { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section>
      <div
        className="flex items-center justify-between cursor-pointer border-b pb-2 mb-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="text-2xl font-semibold dark:text-white text-black border-white/30">{title}</h2>
        <ChevronDown
          className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          size={24}
        />
      </div>
      {isOpen && <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg">{children}</div>}
    </section>
  );
};
