import { useRef, useState } from 'react';
import { GenericSelector, type GenericSelectorRef } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';
import { Icon } from '@/components/ui/icons/icon';
import { Doc } from '../../../convex/_generated/dataModel';
import { useQuestionState } from '@/hooks/useQuestionState';

interface ToneSelectorProps {
  tones: Doc<"tones">[];
  selectedTone: string;
  randomOrder?: boolean;
  onSelectTone: (tone: string) => void;
}

export const ToneSelector = ({ tones, selectedTone, onSelectTone, randomOrder = true }: ToneSelectorProps) => {
  const { addHiddenTone } = useStorageContext();
  const { handleHideTone } = useQuestionState();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);

  const handleOpenDrawer = (itemId: string) => {
    const tone = tones?.find(t => t.id === itemId);
    if (tone) {
      setSelectedItemForDrawer({
        id: tone.id,
        name: tone.name,
        type: "Tone",
        description: tone.description || "",
        icon: tone.icon as Icon,
        color: tone.color,
      });
      setIsDrawerOpen(true);
    }
  };

  return (
    <>
      <GenericSelector
        ref={genericSelectorRef}
        items={tones.map(tone => ({
          id: tone.id,
          name: tone.name,
          icon: tone.icon as Icon,
          color: tone.color
        }))}
        selectedItem={selectedTone}
        onSelectItem={handleOpenDrawer}
        randomizeLabel="Randomize Tone"
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={onSelectTone}
        onHideItem={() => handleHideTone(selectedTone)}
      />
    </>
  );
};
