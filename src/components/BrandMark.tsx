import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

interface BrandMarkProps {
  className?: string;
  labelClassName?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function BrandMark({
  className,
  labelClassName,
  showLabel = true,
  size = "md",
}: BrandMarkProps) {
  const iconBox = size === "sm" ? "size-8" : "size-9";
  const imgSize = size === "sm" ? "size-5" : "size-6";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm",
          iconBox,
        )}
      >
        <img
          src="/break-the-iceberg.png"
          alt=""
          className={cn("object-contain", imgSize)}
        />
      </span>
      {showLabel && (
        <span
          className={cn(
            "font-extrabold tracking-[-0.025em] text-foreground whitespace-nowrap",
            labelClassName,
          )}
        >
          {siteConfig.name}
        </span>
      )}
    </span>
  );
}
