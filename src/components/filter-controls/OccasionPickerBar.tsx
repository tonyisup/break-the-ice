import { OCCASIONS, type OccasionConfig } from "@/config/occasions";
import { OccasionIcon } from "@/components/OccasionIcon";
import { cn } from "@/lib/utils";

export interface OccasionPickerBarProps {
  activeSlug: string | null;
  onSelect: (occasion: OccasionConfig | null) => void;
  className?: string;
}

export function OccasionPickerBar({
  activeSlug,
  onSelect,
  className,
}: OccasionPickerBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter by occasion"
      className={cn(
        "-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {OCCASIONS.map((occasion) => {
        const isActive = activeSlug === occasion.slug;
        return (
          <button
            key={occasion.slug}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? null : occasion)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/80 bg-card/85 text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <OccasionIcon
              name={occasion.icon}
              className="size-3.5 shrink-0"
              style={isActive ? undefined : { color: occasion.accentColor }}
              aria-hidden="true"
            />
            <span>{occasion.shortName}</span>
          </button>
        );
      })}
    </div>
  );
}
