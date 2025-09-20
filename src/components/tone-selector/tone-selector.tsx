import { useQuery } from 'convex/react';
import { useRef, useImperativeHandle, useEffect, useMemo } from 'react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';

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
  
  const handleHideTone = (toneId: string) => {
    setHiddenTones(prev => [...new Set([...prev, toneId])]);
  };

  // Convert tones to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = useMemo(() => tones
    ?.filter(tone => !hiddenTones.includes(tone.id))
    .map(tone => ({
      id: tone.id,
      name: tone.name,
      icon: tone.icon as SelectorItem['icon'],
      color: tone.color
    })), [tones, hiddenTones]);

  // Expose the randomizeTone function to parent components
  useImperativeHandle(ref, () => ({
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

  // useEffect(() => {
  //   if (onSelectTone && selectorItems) {
  //     onSelectTone(selectorItems[0].id);
  //   }
  // }, [selectorItems, onSelectTone]);

  return (
    <GenericSelector
      ref={genericSelectorRef}
      items={selectorItems}
      selectedItem={selectedTone}
      onSelectItem={onSelectTone}
      onHideItem={handleHideTone}
      randomizeLabel="Randomize Tone"
      onRandomizeItem={onRandomizeTone}
    />
  );
};
