import { useEffect, useRef, useState } from "react";

interface HiddenCardNoticeProps {
  /** How long the notice stays before the card is taken out of the feed. */
  seconds?: number;
  /** The hide also took the question out of Liked, so the notice says so. */
  wasLiked: boolean;
  onUndo: () => void;
  onExpire: () => void;
}

let lastInputWasKeyboard = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => { lastInputWasKeyboard = true; }, true);
  window.addEventListener("pointerdown", () => { lastInputWasKeyboard = false; }, true);
}

/**
 * Stands in for a question card that was just hidden: says what happened, offers Undo, and
 * counts down to the card leaving the feed.
 */
export function HiddenCardNotice({ seconds = 6, wasLiked, onUndo, onExpire }: HiddenCardNoticeProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const undoRef = useRef<HTMLButtonElement>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (lastInputWasKeyboard) undoRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (paused) return;
    if (remaining <= 0) {
      onExpireRef.current();
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, paused]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="deck-card mx-auto flex w-full max-w-md items-center justify-between gap-3 px-5 py-4"
    >
      <div>
        <p role="status" className="text-sm font-semibold text-card-foreground">
          {wasLiked ? "Question hidden and removed from Liked" : "Question hidden"}
        </p>
        <p aria-hidden="true" className="text-xs text-muted-foreground">
          {paused ? "Paused" : `Leaving the feed in ${remaining}s`}
        </p>
      </div>
      <button
        ref={undoRef}
        type="button"
        onClick={onUndo}
        className="min-h-11 shrink-0 rounded-full border border-border bg-secondary px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Undo
      </button>
    </div>
  );
}
