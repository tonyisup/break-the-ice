import React, { ReactNode } from "react";
import { ChevronDown, Eye, EyeOff } from "@/components/ui/icons/icons";
import { Icon, IconComponent } from "../ui/icons/icon";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icons?: Icon[];
  iconColors?: (string | undefined)[];
  children: ReactNode;
  isOpen: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  count?: ReactNode;
  visibleCount?: number;
  hiddenCount?: number;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icons,
  iconColors,
  children,
  isOpen,
  onOpenChange,
  count,
  visibleCount,
  hiddenCount,
}) => {
  return (
    <section className="deck-card overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        className={cn(
          "flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isOpen && "border-b border-border/80",
        )}
        onClick={() => onOpenChange?.(!isOpen)}
      >
        <span className="flex items-center gap-2 text-base font-bold tracking-[-0.015em] text-card-foreground">
          {title}
          {icons && (
            <span className="flex items-center gap-2 px-2">
              {icons.map((icon, index) =>
                icon ? (
                  <IconComponent
                    icon={icon}
                    size={20}
                    key={index}
                    color={iconColors?.[index]}
                  />
                ) : null,
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {visibleCount !== undefined && hiddenCount !== undefined ? (
            <span className="flex gap-1.5">
              <span className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                <span>{hiddenCount}</span>
                <span className="hidden md:inline">Hidden</span>
                <EyeOff className="h-3.5 w-3.5 md:hidden" aria-hidden="true" />
              </span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <span>{visibleCount}</span>
                <span className="hidden md:inline">Visible</span>
                <Eye className="h-3.5 w-3.5 md:hidden" aria-hidden="true" />
              </span>
            </span>
          ) : (
            count !== undefined && (
              <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                {count}
              </span>
            )
          )}
          <ChevronDown
            className={cn(
              "text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            size={20}
            aria-hidden="true"
          />
        </span>
      </button>
      {isOpen && <div className="min-w-0 p-5">{children}</div>}
    </section>
  );
};
