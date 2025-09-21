import { useRef, useState } from 'react';
import { GenericSelector, type GenericSelectorRef } from '../generic-selector';
import { useStorageContext } from '../../hooks/useStorageContext';
import { Icon } from '@/components/ui/icons/icon';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer';
import { Doc } from '../../../convex/_generated/dataModel';
import { useQuestionState } from '@/hooks/useQuestionState';

interface StyleSelectorProps {
  styles: Doc<"styles">[];
  selectedStyle: string;
  randomOrder?: boolean;
  onSelectStyle: (style: string) => void;
}

export const StyleSelector = ({ styles, selectedStyle, onSelectStyle, randomOrder = true }: StyleSelectorProps) => {
  const { addHiddenStyle } = useStorageContext();
  const { handleHideStyle } = useQuestionState();
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);

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
        onSelectItem={handleOpenDrawer}
        randomizeLabel="Randomize Style"
      />
      <ItemDetailDrawer
        item={selectedItemForDrawer}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSelectItem={onSelectStyle}
        onHideItem={() => handleHideStyle(selectedStyle)}
      />
    </>
  );
};
