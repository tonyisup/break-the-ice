/** Where each prompt first appears in the feed, as the index of the question above it. */
const CTA_SLOTS = { newsletter: 4, refine: 9 } as const;

export type FeedCta = keyof typeof CTA_SLOTS;
export type CtaAnchors = Partial<Record<FeedCta, string>>;
type FeedQuestion = { _id: string };

/** The question a prompt sits under: its pinned question if still there, else its usual slot. */
export function ctaHolderId(questions: FeedQuestion[], anchors: CtaAnchors, cta: FeedCta) {
  const anchor = anchors[cta];
  if (anchor && questions.some((question) => question._id === anchor)) return anchor;
  return questions[CTA_SLOTS[cta]]?._id;
}

/**
 * Pins each prompt before a question is removed, so it stays where the reader sees it instead
 * of jumping down a card. A prompt under the removed question moves to the question above.
 */
export function keepCtasInPlace(
  questions: FeedQuestion[],
  anchors: CtaAnchors,
  removedId: string,
): CtaAnchors {
  const next: CtaAnchors = {};
  for (const cta of Object.keys(CTA_SLOTS) as FeedCta[]) {
    const holderId = ctaHolderId(questions, anchors, cta);
    if (!holderId) continue;
    if (holderId !== removedId) {
      next[cta] = holderId;
      continue;
    }
    const at = questions.findIndex((question) => question._id === removedId);
    const neighbour = questions[at - 1] ?? questions[at + 1];
    if (neighbour) next[cta] = neighbour._id;
  }
  return next;
}
