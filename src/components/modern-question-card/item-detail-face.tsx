import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { RotateCcw } from "lucide-react";
import { IconComponent } from "../ui/icons/icon";
import type { ItemDetails } from "../item-detail-drawer/item-detail-drawer";
import { cn, isColorDark } from "@/lib/utils";

interface ItemDetailFaceProps {
  item: ItemDetails | null;
  /** True while this face is the one showing; focus moves here when it turns true. */
  isActive: boolean;
  isAnchored: boolean;
  onBack: () => void;
  onAnchor?: (item: ItemDetails) => void;
  onHide?: (item: ItemDetails) => void;
}

/** The back of a question card: what a style, tone or topic means, and what you can do with it. */
export function ItemDetailFace({
  item,
  isActive,
  isAnchored,
  onBack,
  onAnchor,
  onHide,
}: ItemDetailFaceProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (isActive) backButtonRef.current?.focus({ preventScroll: true });
  }, [isActive]);

  if (!item) return null;

  const kind = item.type.toLowerCase();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onBack();
    }
  };

  // Tapping anywhere on the back that isn't a button turns the card face-up again.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    onBack();
  };

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      className="flex h-full w-full cursor-pointer flex-col gap-4 rounded-[28px] px-6 py-5"
      style={{
        backgroundImage: `radial-gradient(110% 70% at 50% 0%, color-mix(in srgb, ${item.color} 16%, transparent), transparent 72%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {item.type}
        </span>
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Back to question"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Back
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 py-2 text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: `color-mix(in srgb, ${item.color} 14%, transparent)`,
            boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${item.color} 35%, transparent)`,
          }}
        >
          <IconComponent icon={item.icon} size={28} color={item.color} />
        </span>
        <h3 id={headingId} className="text-xl font-bold leading-tight tracking-[-0.02em] text-card-foreground">
          {item.name}
        </h3>
        {item.description && (
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>

      {(onAnchor || (onHide && item.type !== "Topic")) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onAnchor && (
            <button
              type="button"
              onClick={() => onAnchor(item)}
              className={cn(
                "min-h-11 min-w-[8rem] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isColorDark(item.color) ? "text-white" : "text-neutral-950",
              )}
              style={{ backgroundColor: item.color }}
            >
              {isAnchored ? "Remove filter" : `More like this ${kind}`}
            </button>
          )}
          {onHide && item.type !== "Topic" && (
            <button
              type="button"
              onClick={() => onHide(item)}
              className="min-h-11 min-w-[8rem] flex-1 rounded-full border border-border bg-secondary/50 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hide this {kind}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
