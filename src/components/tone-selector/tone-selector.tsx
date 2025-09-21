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
  isHighlighting: boolean;
  setIsHighlighting: (isHighlighting: boolean) => void;
}

export interface ToneSelectorRef {
  selectedItem: string;
  randomizeTone: () => void;
  cancelRandomizingTone: () => void;
  confirmRandomizedTone: () => void;
  scrollToCenter: (toneId: string) => void;
  scrollToSelectedItem: () => void;
}

export const ToneSelector = ({ tones, selectedTone, onSelectTone, randomOrder = true, ref, isHighlighting, setIsHighlighting }: ToneSelectorProps & { ref?: React.Ref<ToneSelectorRef> }) => {
  const { addHiddenTone } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<ItemDetails | null>(null);
  
  useEffect(() => {
    setIsHighlighting(highlightedItem !== null);
  }, [highlightedItem, setIsHighlighting]);

  const handleHideTone = (item: ItemDetails) => {
    if (!item.id) return;
    if (item.type !== "Tone") return;

    addHiddenTone(item.id);
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

  const handleSetHighlightedItem = (item: ItemDetails) => {
    setHighlightedItem(item);
    genericSelectorRef.current?.scrollToCenter(item.id);
  };

  // Expose the randomizeTone function to parent components
  useImperativeHandle(ref, () => ({
    selectedItem: selectedTone,
    randomizeTone: () => {
      genericSelectorRef.current?.randomizeItem();
    },
    cancelRandomizingTone: () => {
      genericSelectorRef.current?.cancelRandomizingItem();
    },
    confirmRandomizedTone: () => {
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
          type: "Tone",
          description: tone.description || "",
          icon: tone.icon as Icon,
          color: tone.color
        }))}
        selectedItem={selectedTone}
        onClickItem={handleOpenDrawer}
        onSelectItem={onSelectTone}
        randomizeLabel="Randomize Tone"
        highlightedItem={highlightedItem}
        setHighlightedItem={setHighlightedItem}
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={handleSetHighlightedItem}
        onHideItem={handleHideTone}
      />
    </>
  );
};
