import { animate } from "framer-motion";

const COLLAPSE_SECONDS = 0.34;
const COLLAPSE_DELAY_SECONDS = 0.05;
const FADE_SECONDS = 0.16;
// The same curve as the card flip and the hide morph.
const COLLAPSE_EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * Fades a feed card out while closing the space it and its gap take up, so its last frame
 * matches the layout once the card is removed. Returns a function that stops the animation, or
 * null when the card is off screen and can simply be removed; `onDone` is not called then.
 */
export function collapseFeedCard(card: HTMLElement, onDone: () => void): (() => void) | null {
  const { top, bottom, height } = card.getBoundingClientRect();
  if (height === 0 || bottom <= 0 || top >= window.innerHeight) return null;

  // A prompt placed under this card shares its wrapper, so the gap to close is inside it.
  const gapOwner = card.nextElementSibling ? card : (card.parentElement ?? card);
  const list = gapOwner.parentElement;
  const gap = list ? Number.parseFloat(getComputedStyle(list).rowGap) || 0 : 0;

  card.inert = true;
  card.style.height = `${height}px`;
  card.style.transformOrigin = "top center";

  const fade = animate(
    card,
    { opacity: 0, scale: 0.97 },
    { duration: FADE_SECONDS, ease: "easeOut" },
  );
  const collapse = animate(0, 1, {
    duration: COLLAPSE_SECONDS,
    delay: COLLAPSE_DELAY_SECONDS,
    ease: COLLAPSE_EASE,
    onUpdate: (progress) => {
      card.style.height = `${height * (1 - progress)}px`;
      gapOwner.style.marginBottom = `${-gap * progress}px`;
    },
    onComplete: onDone,
  });

  return () => {
    fade.stop();
    collapse.stop();
  };
}
