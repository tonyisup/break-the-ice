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
import { isColorDark } from '@/lib/utils';
import { Icon, IconComponent } from '@/components/ui/icons/icon';

export interface ItemDetails {
  id: string;
  name: string; 
  type: "Style" | "Tone";
  description: string;
  icon: Icon;
  color: string;
}

interface ItemDetailDrawerProps {
  item: ItemDetails | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectItem?: (item: ItemDetails) => void;
  onHideItem: (item: ItemDetails) => void;
  onAddFilter?: (item: ItemDetails) => void;
}

export function ItemDetailDrawer({
  item,
  isOpen,
  onOpenChange,
  onSelectItem,
  onHideItem,
  onAddFilter,
}: ItemDetailDrawerProps) {

  if (!item) {
    return null;
  }

  const handleSelect = () => {
    onSelectItem?.(item);
    onOpenChange(false);
  };

  const handleHide = () => {
    onHideItem(item);
    onOpenChange(false);
  };

  const handleAddFilter = () => {
    onAddFilter?.(item);
    onOpenChange(false);
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <IconComponent icon={item.icon} size={24} color={item.color} />
              {item.name}
            </span>
            <span className="text-sm text-muted-foreground">{item.type}</span>
          </DrawerTitle>
          <DrawerDescription className="pt-4 text-sm text-muted-foreground">{item.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          {onSelectItem && <Button 
            onClick={handleSelect} 
            className={isColorDark(item.color) ? "text-white" : "text-black"}
            style={{ backgroundColor: item.color }}
          >Select</Button>}
          {onAddFilter && <Button variant="secondary" onClick={handleAddFilter}>Add to filter</Button>}
          <Button variant="outline" onClick={handleHide}>Hide</Button>
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
