import { useEffect, useRef, useState } from "react";

interface HiddenCardNoticeProps {
  /** How long the notice stays before the card is taken out of the feed. */
  seconds?: number;
  /** The hide also took the question out of Liked, so the notice says so. */
  wasLiked: boolean;
  onUndo: () => void;
  onExpire: () => void;
}

// Whether the person's last input was the keyboard. Focus only moves to Undo for keyboard
// use: a focused notice pauses its countdown, so moving focus there after a tap or click
// would stop the card from ever leaving.
let lastInputWasKeyboard = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => { lastInputWasKeyboard = true; }, true);
  window.addEventListener("pointerdown", () => { lastInputWasKeyboard = false; }, true);
}

/**
 * Stands in for a question card that was just hidden: says what happened, offers Undo, and
 * counts down to the card leaving the feed. The count waits while the pointer is over it or
 * keyboard focus is inside it.
 * The question stays hidden after that and can still be brought back from Settings.
 */
export function HiddenCardNotice({ seconds = 6, wasLiked, onUndo, onExpire }: HiddenCardNoticeProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const undoRef = useRef<HTMLButtonElement>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // The Hide button that had focus is gone, so a keyboard user's focus moves to Undo.
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
      className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[30px] bg-black/70 px-5 py-4 text-white"
    >
      <div>
        <p role="status" className="font-semibold">
          {wasLiked ? "Question hidden and removed from Liked" : "Question hidden"}
        </p>
        {/* Not read out every second; the status line above is announced once. */}
        <p aria-hidden="true" className="text-sm text-white/80">
          {paused ? "Paused" : `Leaving the feed in ${remaining}s`}
        </p>
      </div>
      <button
        ref={undoRef}
        type="button"
        onClick={onUndo}
        className="min-h-11 shrink-0 rounded-full border border-white/50 px-5 font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Undo
      </button>
    </div>
  );
}
