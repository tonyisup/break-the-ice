import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

interface RefineResultsCTAProps {
  bgGradient?: [string, string];
  onDismiss: () => void;
}

export function RefineResultsCTA({ bgGradient, onDismiss }: RefineResultsCTAProps) {
  const accent =
    bgGradient?.[0] && bgGradient?.[1]
      ? `linear-gradient(90deg, ${bgGradient[0]}, ${bgGradient[1]})`
      : undefined;

  return (
    <div className="deck-card relative mx-auto w-full max-w-md overflow-hidden">
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-primary"
        style={accent ? { background: accent } : undefined}
      />
      <button
        onClick={onDismiss}
        type="button"
        className="absolute right-3 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Don't show this again"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex flex-col items-center gap-5 p-7 text-center sm:p-8">
        <div className="flex flex-col gap-1.5 pr-6 pl-6">
          <h3 className="text-xl font-bold tracking-[-0.02em] text-card-foreground">
            Not liking what you're seeing?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Hide styles or tones you don't want and tailor your deck in Settings.
          </p>
        </div>
        <Button asChild className="min-h-11 w-full rounded-full font-semibold">
          <Link to="/settings?expand=manage-styles,manage-tones">Go to Settings</Link>
        </Button>
        <button
          onClick={onDismiss}
          type="button"
          className="min-h-10 text-xs font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Don't show this again
        </button>
      </div>
    </div>
  );
}
