import { MultiSelectStylesSelector } from "../styles-selector/multi-select-styles-selector";
import { MultiSelectTonesSelector } from "../tone-selector/multi-select-tone-selector";
import { Doc } from "../../../convex/_generated/dataModel";
import { useMemo } from "react";

interface FilterControlsProps {
  questions: Doc<"questions">[];
  styles: Doc<"styles">[];
  tones: Doc<"tones">[];
  selectedStyles: string[];
  onSelectedStylesChange: (styles: string[]) => void;
  selectedTones: string[];
  onSelectedTonesChange: (tones: string[]) => void;
}

export const FilterControls = ({
  questions,
  styles,
  tones,
  selectedStyles,
  onSelectedStylesChange,
  selectedTones,
  onSelectedTonesChange,
}: FilterControlsProps) => {

  const availableStyles = useMemo(() => {
    const styleCounts = questions.reduce((acc, q) => {
      if (q.style) {
        acc[q.style] = (acc[q.style] || 0) + 1;
      }
      return acc;
    }, {} as { [key: string]: number });

    return styles
      .filter((style) => styleCounts[style.id])
      .map((style) => ({ ...style, count: styleCounts[style.id] }));
  }, [questions, styles]);

  const availableTones = useMemo(() => {
    const toneCounts = questions.reduce((acc, q) => {
      if (q.tone) {
        acc[q.tone] = (acc[q.tone] || 0) + 1;
      }
      return acc;
    }, {} as { [key: string]: number });

    return tones
      .filter((tone) => toneCounts[tone.id])
      .map((tone) => ({ ...tone, count: toneCounts[tone.id] }));
  }, [questions, tones]);

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
        styles={availableStyles}
        selectedStyles={selectedStyles}
        onSelectStyle={handleSelectStyle}
      />
      <MultiSelectTonesSelector
        tones={availableTones}
        selectedTones={selectedTones}
        onSelectTone={handleSelectTone}
      />
    </div>
  );
};
