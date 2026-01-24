import React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import DynamicIcon from '@/components/ui/dynamic-icon';
import { ChevronDown, Check } from '@/components/ui/icons/icons';
import { cn } from '@/lib/utils';

export interface SelectorItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface SettingsItemSelectorProps {
  items: SelectorItem[];
  selectedItemId: string;
  onSelect: (itemId: string) => void;
  placeholder?: string;
}

export const SettingsItemSelector: React.FC<SettingsItemSelectorProps> = ({
  items,
  selectedItemId,
  onSelect,
  placeholder = "Select an option",
}) => {
  const selectedItem = items.find((item) => item.id === selectedItemId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "w-full justify-between bg-white/5 border-white/10 text-left font-normal hover:bg-white/10 dark:text-white text-black h-12",
            !selectedItem && "text-muted-foreground"
          )}
        >
          {selectedItem ? (
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-6 h-6 rounded-md bg-white/10"
                style={{ color: selectedItem.color }}
              >
                <DynamicIcon
                  name={selectedItem.icon}
                  size={16}
                  color={selectedItem.color}
                />
              </div>
              <span className="text-base">{selectedItem.name}</span>
            </div>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-[200px] bg-gray-900 border-white/10 p-1 text-white max-h-[300px] overflow-y-auto"
        align="start"
      >
          {items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => onSelect(item.id)}
              className="flex items-center gap-3 cursor-pointer focus:bg-white/10 py-3 px-2 rounded-md hover:bg-white/10 hover:text-white focus:text-white"
            >
              <div
                className="flex items-center justify-center w-6 h-6 rounded-md bg-white/5"
                style={{ color: item.color }}
              >
                <DynamicIcon
                  name={item.icon}
                  size={16}
                  color={item.color}
                />
              </div>
              <span className="flex-1 text-base">{item.name}</span>
              {selectedItemId === item.id && (
                  <Check className="h-4 w-4 opacity-70" />
              )}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
