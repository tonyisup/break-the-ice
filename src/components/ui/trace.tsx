import * as React from "react";
import { cn } from "@/lib/utils";

// The display parts of shadcn/ui's Trace, written for this app's Tailwind 3 setup.

function Trace({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="trace" className={cn("flex w-full min-w-0 flex-col gap-2", className)} {...props} />;
}

function TraceLine({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & {
  status?: "running" | "error" | "pending";
}) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "group/trace-line flex w-fit max-w-full min-w-0 items-center gap-2 text-sm text-muted-foreground transition-colors data-[status=error]:text-destructive data-[status=pending]:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

function TraceIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-title"
      className={cn("min-w-0 truncate group-data-[status=running]/trace-line:trace-shimmer", className)}
      {...props}
    />
  );
}

function TraceDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 text-muted-foreground/70 tabular-nums", className)}
      {...props}
    />
  );
}

export { Trace, TraceLine, TraceIcon, TraceTitle, TraceDescription };
