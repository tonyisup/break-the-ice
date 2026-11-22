import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn, isColorDark } from "@/lib/utils";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { Id } from "../../../convex/_generated/dataModel";

export interface ItemDetails {
  id: Id<"styles"> | Id<"tones"> | Id<"topics">;
  slug: string;
  name: string;
  type: "Style" | "Tone" | "Topic";
  description: string;
  icon: Icon;
  color: string;
}

interface ItemDetailDrawerProps {
  item: ItemDetails | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectItem?: (item: ItemDetails) => void;
  onHideItem?: (item: ItemDetails) => void;
  onAddFilter?: (item: ItemDetails) => void;
  onAnchorItem?: (item: ItemDetails) => void;
  isAnchored?: boolean;
}

export function ItemDetailDrawer({
  item,
  isOpen,
  onOpenChange,
  onSelectItem,
  onHideItem,
  onAnchorItem,
  isAnchored,
}: ItemDetailDrawerProps) {
  if (!item) {
    return null;
  }

  const handleSelect = () => {
    onSelectItem?.(item);
    onOpenChange(false);
  };

  const handleHide = () => {
    onHideItem?.(item);
    onOpenChange(false);
  };

  const handleAnchor = () => {
    onAnchorItem?.(item);
    onOpenChange(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader className="text-left">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="flex items-center gap-3 text-xl font-bold tracking-[-0.02em]">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `color-mix(in srgb, ${item.color} 15%, transparent)`,
                  boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${item.color} 35%, transparent)`,
                }}
              >
                <IconComponent icon={item.icon} size={20} color={item.color} />
              </span>
              {item.name}
            </DrawerTitle>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              {item.type}
            </span>
          </div>
          <DrawerDescription className="pt-3 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="gap-2 pt-2">
          {onAnchorItem && (
            <Button
              onClick={handleAnchor}
              className={cn(
                "min-h-11 rounded-full font-semibold",
                isColorDark(item.color) ? "text-white" : "text-neutral-950",
              )}
              style={{ backgroundColor: item.color }}
            >
              {isAnchored ? "Remove filter" : `More like this ${item.type.toLowerCase()}`}
            </Button>
          )}
          {onSelectItem && (
            <Button
              onClick={handleSelect}
              className={cn(
                "min-h-11 rounded-full font-semibold",
                isColorDark(item.color) ? "text-white" : "text-neutral-950",
              )}
              style={{ backgroundColor: item.color }}
            >
              Select
            </Button>
          )}
          {onHideItem && item.type !== "Topic" && (
            <Button variant="outline" className="min-h-11 rounded-full" onClick={handleHide}>
              Hide
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="ghost" className="min-h-11 rounded-full">
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
