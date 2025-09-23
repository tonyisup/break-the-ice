import { cn } from "@/lib/utils";
import { Icon } from "../ui/icons/icon";
import { Doc } from "../../../convex/_generated/dataModel";

interface MultiSelectTonesSelectorProps {
  tones: Doc<"tones">[];
  selectedTones: string[];
  onSelectTone: (toneId: string) => void;
}

export const MultiSelectTonesSelector = ({
  tones,
  selectedTones,
  onSelectTone,
}: MultiSelectTonesSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {tones.map((tone) => (
        <button
          key={tone.id}
          data-testid="tone-selector-button"
          onClick={() => onSelectTone(tone.id)}
          className={cn(
            "p-2 rounded-lg border",
            selectedTones.includes(tone.id)
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-800"
          )}
        >
          {tone.name}
        </button>
      ))}
    </div>
  );
};
