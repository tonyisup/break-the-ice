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
  isHighlighting: boolean;
  setIsHighlighting: (isHighlighting: boolean) => void;
  onHighlightStyle?: (style: Doc<"styles"> | null) => void;
}

export interface StyleSelectorRef {
  selectedItem: string;
  randomizeStyle: () => void;
  cancelRandomizingStyle: () => void;
  confirmRandomizedStyle: () => void;
  scrollToCenter: (styleId: string) => void;
  scrollToSelectedItem: () => void;
}
export const StyleSelector = ({ styles, selectedStyle, onSelectStyle, randomOrder = true, ref, isHighlighting, setIsHighlighting, onHighlightStyle }: StyleSelectorProps & { ref?: React.Ref<StyleSelectorRef> }) => {
  const { addHiddenStyle, hiddenStyles } = useStorageContext();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
  const [highlightedItem, setHighlightedItem] = useState<ItemDetails | null>(null);
  
  const visibleStyles = styles.filter(style => !hiddenStyles.includes(style.id));

  useEffect(() => {
    setIsHighlighting(highlightedItem !== null);
    if (onHighlightStyle) {
      if (highlightedItem) {
        const style = styles.find(s => s.id === highlightedItem.id);
        onHighlightStyle(style ?? null);
      } else {
        onHighlightStyle(null);
      }
    }
  }, [highlightedItem, setIsHighlighting, onHighlightStyle, styles]);

  const handleHideStyle = (item: ItemDetails) => {
    if (!item.id) return;
    if (item.type !== "Style") return;

    addHiddenStyle(item.id);
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

  const handleSetHighlightedItem = (item: ItemDetails) => {
    setHighlightedItem(item);
    genericSelectorRef.current?.scrollToCenter(item.id);
  };

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    selectedItem: selectedStyle,
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

  return (
    <>
      <GenericSelector
        ref={genericSelectorRef}
        items={visibleStyles.map(style => ({
          id: style.id,
          name: style.name,
          type: "Style",
          description: style.description || "",
          icon: style.icon as Icon,
          color: style.color
        }))}
        selectedItem={selectedStyle}
        onClickItem={handleOpenDrawer}
        onSelectItem={onSelectStyle}
        randomizeLabel="Randomize Style"
        highlightedItem={highlightedItem}
        setHighlightedItem={setHighlightedItem}
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={handleSetHighlightedItem}
        onHideItem={handleHideStyle}
      />
    </>
  );
};
