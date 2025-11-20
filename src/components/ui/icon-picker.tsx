import React, { useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconMap } from "@/components/ui/icons/icons";

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredIcons = Object.keys(iconMap).filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const SelectedIcon = value ? iconMap[value] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:ring-offset-gray-950 dark:placeholder:text-gray-400",
            className
          )}
          type="button"
        >
          <div className="flex items-center gap-2 truncate text-gray-900 dark:text-white">
            {SelectedIcon ? (
              <SelectedIcon className="h-4 w-4 shrink-0" />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{value || "Select icon..."}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-gray-500 dark:text-gray-400" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-gray-400 text-gray-900 dark:text-white"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredIcons.length === 0 ? (
                 <p className="p-2 text-sm text-gray-500 text-center">No icon found.</p>
            ) : (
                <div className="grid grid-cols-4 gap-2">
                    {filteredIcons.map((iconName) => {
                        const Icon = iconMap[iconName];
                        if (!Icon) return null;
                        return (
                            <button
                                key={iconName}
                                onClick={() => {
                                    onChange(iconName);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "flex flex-col items-center justify-center rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-700 gap-1 transition-colors",
                                    value === iconName && "bg-gray-100 dark:bg-gray-700 ring-1 ring-blue-500"
                                )}
                                title={iconName}
                                type="button"
                            >
                                <Icon className="h-6 w-6 text-gray-900 dark:text-white" />
                                <span className="text-[10px] truncate w-full text-center text-gray-600 dark:text-gray-400">{iconName}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function IconDisplay({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
