import { useQuery } from 'convex/react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import * as icons from '@/components/ui/icons';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';

interface StyleSelectorProps {
  selectedStyle: string;
  randomOrder?: boolean;
  onSelectStyle: (style: string) => void;
  onRandomizeStyle: (style: string | null) => void;
}

export interface StyleSelectorRef {
  randomizeStyle: () => void;
  cancelRandomizingStyle: () => void;
  confirmRandomizedStyle: () => void;
  scrollToCenter: (styleId: string) => void;
  scrollToSelectedItem: () => void;
}
export const StyleSelector = ({ selectedStyle, onSelectStyle, onRandomizeStyle, randomOrder = true, ref }: StyleSelectorProps & { ref?: React.Ref<StyleSelectorRef> }) => {
  const styles = useQuery(api.styles.getStyles);
  const { hiddenStyles, setHiddenStyles } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  
  const handleHideStyle = (styleId: string) => {
    setHiddenStyles(prev => [...new Set([...prev, styleId])]);
  };

  const handleOpenDrawer = (itemId: string) => {
    const style = styles?.find(s => s.id === itemId);
    if (style) {
      setSelectedItemForDrawer({
        id: style.id,
        name: style.name,
        description: style.description,
        icon: style.icon as keyof typeof icons,
        color: style.color,
      });
      setIsDrawerOpen(true);
    }
  };

  // Convert styles to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = useMemo(() => styles
    ?.filter(style => !hiddenStyles.includes(style.id))
    .map(style => ({
      id: style.id,
      name: style.name,
      icon: style.icon as keyof typeof icons,
      color: style.color
    })), [styles, hiddenStyles]);

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    randomizeStyle: () => {
      genericSelectorRef.current?.randomizeItem();
    },
    cancelRandomizingStyle: () => {
      genericSelectorRef.current?.cancelRandomizingItem();
    },
    confirmRandomizedStyle: () => {
      genericSelectorRef.current?.confirmRandomizedItem();
    },
    scrollToCenter: (styleId: string) => {
      genericSelectorRef.current?.scrollToCenter(styleId);
    },
    scrollToSelectedItem: () => {
      genericSelectorRef.current?.scrollToSelectedItem();
    },
  }));

  useEffect(() => {
    if (!randomOrder) {
      return;
    }
    if (onSelectStyle && selectorItems) {
      onSelectStyle(selectorItems[0].id);
    }
  }, [randomOrder, selectorItems, onSelectStyle]);

  return (
    <>
      <GenericSelector
        ref={genericSelectorRef}
        items={selectorItems}
        selectedItem={selectedStyle}
        onSelectItem={handleOpenDrawer}
        randomizeLabel="Randomize Style"
        onRandomizeItem={onRandomizeStyle}
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={onSelectStyle}
        onHideItem={handleHideStyle}
      />
    </>
  );
};
