import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "framer-motion";
import { cn } from "@/lib/utils";

const MORPH_SECONDS = 0.38;
const NOTICE_FADE_SECONDS = 0.18;
// The same curve the card flip uses, so the card's motion feels like one family.
const MORPH_EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const GAP_BELOW_HEADER_PX = 12;

/** How far to scroll (zero or negative) so the top of the card clears the fixed header. */
function scrollNeededToReveal(card: Element | null) {
  if (!card) return 0;
  const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  return Math.min(0, card.getBoundingClientRect().top - headerBottom - GAP_BELOW_HEADER_PX);
}

interface CardBodyMorphProps {
  /** When set, the card body eases into this content. Clearing it eases back. */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * The part of a card below its accent edge. Swapping to a notice crossfades the content while
 * the height eases, so the card's border and accent edge never leave the screen. The question
 * stays mounted underneath, which lets Undo bring it back without reloading anything.
 */
export function CardBodyMorph({ notice, children }: CardBodyMorphProps) {
  const showNotice = notice !== undefined && notice !== null;
  const reduceMotion = useReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const heightAnimation = useRef<AnimationPlaybackControls | null>(null);
  const previousShowNotice = useRef(showNotice);
  // Whichever layer is in flow sets the card's resting height; the other is laid over it.
  const [noticeInFlow, setNoticeInFlow] = useState(showNotice);

  useLayoutEffect(() => {
    if (previousShowNotice.current === showNotice) return;
    previousShowNotice.current = showNotice;

    const shell = shellRef.current;
    const target = showNotice ? noticeRef.current : bodyRef.current;
    if (!shell || !target) return;

    heightAnimation.current?.stop();
    heightAnimation.current = null;
    const from = shell.getBoundingClientRect().height;
    const to = target.getBoundingClientRect().height;

    // Hide sits at the bottom of the card and the notice at the top, so on a tall card the
    // notice could land above the screen. Scroll with the morph to keep Undo in view.
    const scrollStart = window.scrollY;
    const scrollDistance = showNotice ? scrollNeededToReveal(shell.parentElement) : 0;
    const scrollTo = (progress: number) => {
      if (scrollDistance === 0) return;
      window.scrollTo({ top: scrollStart + scrollDistance * progress, behavior: "instant" });
    };

    const releaseHeight = () => {
      shell.style.height = "";
      shell.style.flex = "";
    };

    if (reduceMotion || from === to) {
      releaseHeight();
      setNoticeInFlow(showNotice);
      scrollTo(1);
      return;
    }

    // Hold the current height so changing which layer is in flow can't make the card jump.
    shell.style.flex = "none";
    shell.style.height = `${from}px`;
    if (!showNotice) setNoticeInFlow(false);

    heightAnimation.current = animate(from, to, {
      duration: MORPH_SECONDS,
      ease: MORPH_EASE,
      onUpdate: (height) => {
        shell.style.height = `${height}px`;
        scrollTo((height - from) / (to - from));
      },
      onComplete: () => {
        heightAnimation.current = null;
        if (showNotice) flushSync(() => setNoticeInFlow(true));
        releaseHeight();
      },
    });
  }, [showNotice, reduceMotion]);

  useLayoutEffect(() => () => heightAnimation.current?.stop(), []);

  return (
    <div ref={shellRef} className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={bodyRef}
        inert={showNotice}
        className={cn(
          "flex flex-col transition-opacity ease-out motion-reduce:transition-none",
          noticeInFlow ? "absolute inset-x-0 top-0" : "flex-1",
          showNotice ? "opacity-0 duration-150" : "opacity-100 delay-100 duration-300",
        )}
      >
        {children}
      </div>
      {/* This wrapper stays mounted because an exiting child keeps the props it last had. */}
      <div ref={noticeRef} className={noticeInFlow ? "relative" : "absolute inset-x-0 top-0"}>
        <AnimatePresence initial={false}>
          {showNotice && (
            <motion.div
              key="notice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduceMotion ? 0 : NOTICE_FADE_SECONDS,
                delay: reduceMotion ? 0 : 0.08,
              }}
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
