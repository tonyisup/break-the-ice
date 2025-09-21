import { useRef, useImperativeHandle, useState, useEffect } from 'react';
import { GenericSelector, type GenericSelectorRef } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';
import { Icon } from '@/components/ui/icons/icon';
import { Doc } from '../../../convex/_generated/dataModel';

interface ToneSelectorProps {
  tones: Doc<"tones">[];
  selectedTone: string;
  randomOrder?: boolean;
  onSelectTone: (tone: string) => void;
}

export interface ToneSelectorRef {
  randomizeTone: () => void;
  cancelRandomizingTone: () => void;
  confirmRandomizedTone: () => void;
  scrollToCenter: (toneId: string) => void;
  scrollToSelectedItem: () => void;
}

export const ToneSelector = ({ tones, selectedTone, onSelectTone, randomOrder = true, ref }: ToneSelectorProps & { ref?: React.Ref<ToneSelectorRef> }) => {
  const { addHiddenTone } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  
  const handleHideTone = (toneId: string) => {
    if (!toneId) return;

    addHiddenTone(toneId);
  };

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
  const handleSelectTone = (toneId: string) => {
    if(isRandomizing) {
      onSelectTone(toneId);
      setIsRandomizing(false);
      return;
    }
    handleOpenDrawer(toneId);
  };

  // Expose the randomizeTone function to parent components
  useImperativeHandle(ref, () => ({
    randomizeTone: () => {
      setIsRandomizing(true);
      genericSelectorRef.current?.randomizeItem();
    },
    cancelRandomizingTone: () => {
      setIsRandomizing(false);
      genericSelectorRef.current?.cancelRandomizingItem();
    },
    confirmRandomizedTone: () => {
      setIsRandomizing(true);
      genericSelectorRef.current?.confirmRandomizedItem();
    },
    scrollToCenter: (toneId: string) => {
      genericSelectorRef.current?.scrollToCenter(toneId);
    },
    scrollToSelectedItem: () => {
      genericSelectorRef.current?.scrollToSelectedItem();
    },
  }));

  useEffect(() => {
    if (onSelectTone && tones) {
      onSelectTone(tones[0].id);
    }
  }, [tones, onSelectTone]);

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
        onSelectItem={handleSelectTone}
        randomizeLabel="Randomize Tone"
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={onSelectTone}
        onHideItem={handleHideTone}
      />
    </>
  );
};
