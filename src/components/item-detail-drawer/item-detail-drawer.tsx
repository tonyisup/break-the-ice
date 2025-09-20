import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import React from 'react';
import * as icons from '@/components/ui/icons';

export interface ItemDetails {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof icons;
  color: string;
}

interface ItemDetailDrawerProps {
  item: ItemDetails | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectItem: (itemId: string) => void;
  onHideItem: (itemId: string) => void;
}

export function ItemDetailDrawer({
  item,
  isOpen,
  onOpenChange,
  onSelectItem,
  onHideItem,
}: ItemDetailDrawerProps) {
  if (!item) {
    return null;
  }

  const handleSelect = () => {
    onSelectItem(item.id);
    onOpenChange(false);
  };

  const handleHide = () => {
    onHideItem(item.id);
    onOpenChange(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            {React.createElement(icons[item.icon], { size: 24, color: item.color })}
            {item.name}
          </DrawerTitle>
          <DrawerDescription>{item.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button onClick={handleSelect} style={{ backgroundColor: item.color }}>Select</Button>
          <Button variant="outline" onClick={handleHide}>Hide</Button>
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
