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
    // Keyboard users have the Back button and Escape; the click-anywhere is a touch nicety.
    <div
      role="group"
      aria-labelledby={headingId}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      className="flex h-full w-full cursor-pointer flex-col gap-3 rounded-[27px] px-6 py-5"
      style={{
        backgroundImage: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${item.color} 22%, transparent), transparent 70%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          {item.type}
        </span>
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Back to question"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-300 dark:hover:bg-white/10"
        >
          <RotateCcw size={16} aria-hidden="true" />
          Back
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, ${item.color} 15%, transparent)`,
            boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${item.color} 40%, transparent)`,
          }}
        >
          <IconComponent icon={item.icon} size={28} color={item.color} />
        </span>
        <h3 id={headingId} className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
          {item.name}
        </h3>
        {item.description && (
          <p className="max-w-xs text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {item.description}
          </p>
        )}
      </div>

      {(onAnchor || (onHide && item.type !== "Topic")) && (
        <div className="flex flex-wrap gap-2">
          {onAnchor && (
            <button
              type="button"
              onClick={() => onAnchor(item)}
              className={cn(
                "min-w-[8rem] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                isColorDark(item.color) ? "text-white" : "text-black",
              )}
              style={{ backgroundColor: item.color }}
            >
              {isAnchored ? "Remove anchor" : `More like this ${kind}`}
            </button>
          )}
          {onHide && item.type !== "Topic" && (
            <button
              type="button"
              onClick={() => onHide(item)}
              className="min-w-[8rem] flex-1 rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/10"
            >
              Hide this {kind}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
