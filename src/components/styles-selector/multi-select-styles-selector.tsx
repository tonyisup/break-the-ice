import { cn } from "@/lib/utils";
import { Icon } from "../ui/icons/icon";
import { Doc } from "../../../convex/_generated/dataModel";

interface MultiSelectStylesSelectorProps {
  styles: Doc<"styles">[];
  selectedStyles: string[];
  onSelectStyle: (styleId: string) => void;
}

export const MultiSelectStylesSelector = ({
  styles,
  selectedStyles,
  onSelectStyle,
}: MultiSelectStylesSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {styles.map((style) => (
        <button
          key={style.id}
          data-testid="style-selector-button"
          onClick={() => onSelectStyle(style.id)}
          className={cn(
            "p-2 rounded-lg border",
            selectedStyles.includes(style.id)
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-800"
          )}
        >
          {style.name}
        </button>
      ))}
    </div>
  );
};
