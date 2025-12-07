import { HexColorPicker, HexColorInput } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ color, onChange, className }: ColorPickerProps) {
  const effectiveColor = color && /^#[0-9A-F]{6}$/i.test(color) ? color : "#000000";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm transition-colors hover:opacity-90 focus:ring-2 focus:ring-blue-500 focus:outline-none",
            className
          )}
          style={{ backgroundColor: color || "transparent" }}
          title="Pick a color"
          type="button"
        >
           {!color && <span className="text-gray-400 text-xs">No Color</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <div className="flex flex-col gap-3">
          <HexColorPicker color={effectiveColor} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">#</span>
            <HexColorInput
              color={effectiveColor}
              onChange={onChange}
              className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none uppercase"
              prefixed={false}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
