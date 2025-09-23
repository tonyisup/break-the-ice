import { MultiSelectStylesSelector } from "../styles-selector/multi-select-styles-selector";
import { MultiSelectTonesSelector } from "../tone-selector/multi-select-tone-selector";
import { Doc } from "../../../convex/_generated/dataModel";

interface FilterControlsProps {
  styles: Doc<"styles">[];
  tones: Doc<"tones">[];
  selectedStyles: string[];
  onSelectedStylesChange: (styles: string[]) => void;
  selectedTones: string[];
  onSelectedTonesChange: (tones: string[]) => void;
}

export const FilterControls = ({
  styles,
  tones,
  selectedStyles,
  onSelectedStylesChange,
  selectedTones,
  onSelectedTonesChange,
}: FilterControlsProps) => {

  const handleSelectStyle = (styleId: string) => {
    const newSelectedStyles = selectedStyles.includes(styleId)
      ? selectedStyles.filter((s) => s !== styleId)
      : [...selectedStyles, styleId];
    onSelectedStylesChange(newSelectedStyles);
  };

  const handleSelectTone = (toneId: string) => {
    const newSelectedTones = selectedTones.includes(toneId)
      ? selectedTones.filter((t) => t !== toneId)
      : [...selectedTones, toneId];
    onSelectedTonesChange(newSelectedTones);
  };

  return (
    <div className="flex flex-col gap-4">
      <MultiSelectStylesSelector
        styles={styles}
        selectedStyles={selectedStyles}
        onSelectStyle={handleSelectStyle}
      />
      <MultiSelectTonesSelector
        tones={tones}
        selectedTones={selectedTones}
        onSelectTone={handleSelectTone}
      />
    </div>
  );
};
