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
import { cn, isColorDark } from '@/lib/utils';
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
            <span 
              style={{ borderColor: item.color }}
              className={cn(
                "text-sm text-muted-foreground p-2 rounded-2xl",
                item.type === "Style" ? "border-l-4 border-t-4 border-r-0 border-b-0" : "border-r-4 border-b-4 border-l-0 border-t-0"
              )}
            >{item.type}</span>
          </DrawerTitle>
          <DrawerDescription className="pt-4 text-sm text-muted-foreground">{item.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          {onSelectItem && <Button 
            onClick={handleSelect} 
            className={isColorDark(item.color) ? "text-white" : "text-black"}
            style={{ backgroundColor: item.color }}
          >Select</Button>}
          {onAddFilter && <Button 
            variant="secondary" 
            onClick={handleAddFilter}
            style={{ borderColor: item.color, borderWidth: '4px' }}
          >Add to filter</Button>}
          <Button variant="outline" onClick={handleHide}>Hide</Button>
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
