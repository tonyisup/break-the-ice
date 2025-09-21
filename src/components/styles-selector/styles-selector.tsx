import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GenericSelector, type GenericSelectorRef } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import { Icon } from '@/components/ui/icons/icon';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';
import { Doc } from '../../../convex/_generated/dataModel';

interface StyleSelectorProps {
  styles: Doc<"styles">[];
  selectedStyle: string;
  randomOrder?: boolean;
  onSelectStyle: (style: string) => void; 
}

export interface StyleSelectorRef {
  selectedItem: string;
  randomizeStyle: () => void;
  cancelRandomizingStyle: () => void;
  confirmRandomizedStyle: () => void;
  scrollToCenter: (styleId: string) => void;
  scrollToSelectedItem: () => void;
}
export const StyleSelector = ({ styles, selectedStyle, onSelectStyle, randomOrder = true, ref }: StyleSelectorProps & { ref?: React.Ref<StyleSelectorRef> }) => {
  const { addHiddenStyle } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  
  const handleHideStyle = (styleId: string, itemType: "Style" | "Tone") => {
    if (!styleId) return;
    if (itemType !== "Style") return;

    addHiddenStyle(styleId);
  };

  const handleOpenDrawer = (itemId: string) => {
    const style = styles?.find(s => s.id === itemId);
    if (style) {
      setSelectedItemForDrawer({
        id: style.id,
        name: style.name,
        type: "Style",
        description: style.description || "",
        icon: style.icon as Icon,
        color: style.color,
      });
      setIsDrawerOpen(true);
    }
  };

  const handleSelectStyle = (styleId: string) => {
    if(isRandomizing) {
      onSelectStyle(styleId);
      setIsRandomizing(false);
      return;
    }
    handleOpenDrawer(styleId);
  };

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    selectedItem: selectedStyle,
    randomizeStyle: () => {
      setIsRandomizing(true);
      genericSelectorRef.current?.randomizeItem();
    },
    cancelRandomizingStyle: () => {
      setIsRandomizing(false);
      genericSelectorRef.current?.cancelRandomizingItem();
    },
    confirmRandomizedStyle: () => {
      setIsRandomizing(true);
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
    if (onSelectStyle && styles) {
      onSelectStyle(styles[0].id);
    }
  }, [randomOrder, styles, onSelectStyle]);

  return (
    <>
      <GenericSelector
        ref={genericSelectorRef}
        items={styles.map(style => ({
          id: style.id,
          name: style.name,
          icon: style.icon as Icon,
          color: style.color
        }))}
        selectedItem={selectedStyle}
        onSelectItem={handleSelectStyle}
        randomizeLabel="Randomize Style"
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
