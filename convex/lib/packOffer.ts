/**
 * The pack shown where a person's AI generations run out. Nothing is on sale yet: asking for
 * it is recorded (core/packInterest.ts) to measure demand. Change the id with the terms, so
 * answers to different offers stay apart.
 */
export const PACK_OFFER = {
  id: "pack-50-usd-5",
  generations: 50,
  priceUsd: 5,
} as const;
