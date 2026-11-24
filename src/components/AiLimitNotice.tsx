import type { ReactNode } from "react";
import { Clock } from "lucide-react";

interface AiLimitNoticeProps {
  title: string;
  description: string;
  /** What the person can do about it, shown under the description. */
  children?: ReactNode;
}

/** The feed stopped making new questions until the cycle resets (or, when paused, until tomorrow). */
export function AiLimitNotice({ title, description, children }: AiLimitNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="deck-card mx-auto flex w-full max-w-md items-start gap-4 p-6"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Clock aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold tracking-[-0.01em] text-card-foreground">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
