import { useQuery } from 'convex/react';
import { useRef, useImperativeHandle, useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';
import { Icon } from '@/components/ui/icons/icon';

interface ToneSelectorProps {
  selectedTone: string;
  randomOrder?: boolean;
  onSelectTone: (tone: string) => void;
  onRandomizeTone: (tone: string | null) => void;
}

export interface ToneSelectorRef {
  randomizeTone: () => void;
  cancelRandomizingTone: () => void;
  confirmRandomizedTone: () => void;
  scrollToCenter: (toneId: string) => void;
  scrollToSelectedItem: () => void;
}

export const ToneSelector = ({ selectedTone, onSelectTone, onRandomizeTone, randomOrder = true, ref }: ToneSelectorProps & { ref?: React.Ref<ToneSelectorRef> }) => {
  const tones = useQuery(api.tones.getTones);
  const { hiddenTones, setHiddenTones } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  
  const handleHideTone = (toneId: string) => {
    if (!toneId) return;

    setHiddenTones(hiddenTones.filter(id => id !== toneId));
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

  // Convert tones to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = useMemo(() => tones
    ?.filter(tone => !hiddenTones.includes(tone.id))
    .map(tone => ({
      id: tone.id,
      name: tone.name,
      icon: tone.icon as Icon,
      color: tone.color
    })), [tones, hiddenTones]);

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

  // useEffect(() => {
  //   if (onSelectTone && selectorItems) {
  //     onSelectTone(selectorItems[0].id);
  //   }
  // }, [selectorItems, onSelectTone]);

  return (
    <>
      <GenericSelector
        ref={genericSelectorRef}
        items={selectorItems}
        selectedItem={selectedTone}
        onSelectItem={handleSelectTone}
        randomizeLabel="Randomize Tone"
        onRandomizeItem={onRandomizeTone}
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
