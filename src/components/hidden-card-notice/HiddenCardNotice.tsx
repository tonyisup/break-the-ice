import { useEffect, useRef, useState } from "react";
import { useIsPresent } from "framer-motion";

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
 * Fills a question card that was just hidden: says what happened, offers Undo, and counts down
 * to the card leaving the feed. The card supplies the border and accent edge.
 */
export function HiddenCardNotice({ seconds = 6, wasLiked, onUndo, onExpire }: HiddenCardNoticeProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  // After Undo the notice is still on screen while it fades, and must not expire or act again.
  const isPresent = useIsPresent();
  const undoRef = useRef<HTMLButtonElement>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  // The card stays on screen while it collapses, so focus or hover changes can re-run the timer.
  const hasExpired = useRef(false);

  useEffect(() => {
    if (lastInputWasKeyboard) undoRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (paused || !isPresent) return;
    if (remaining <= 0) {
      if (hasExpired.current) return;
      hasExpired.current = true;
      onExpireRef.current();
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, paused, isPresent]);

  return (
    <div
      inert={!isPresent}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="flex w-full items-center justify-between gap-3 px-5 py-4"
    >
      <div>
        <p role="status" className="text-sm font-semibold text-card-foreground">
          {wasLiked ? "Question hidden and removed from Liked" : "Question hidden"}
        </p>
        <p aria-hidden="true" className="text-xs text-muted-foreground">
          {paused ? "Paused" : remaining > 0 ? `Leaving the feed in ${remaining}s` : "Leaving the feed"}
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
