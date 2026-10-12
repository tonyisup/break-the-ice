// What is left of the eval's own short brief: the seeded shuffle that pairsRecord.mjs and
// selectRecord.mjs draw their sets with. The brief itself, which every generating path now sends,
// lives in convex/lib/brief.ts. The shuffle stays as it was, because sets already drawn depend on
// the order it gives for a key.
import { createHash } from "node:crypto";

/** A 32-bit seed from a string, and a small generator from it, so a shuffle is the same every run. */
function seedFrom(key) {
  return createHash("sha256").update(key).digest().readUInt32LE(0);
}
function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `items` in an order fixed by `key`. The input is left as it was. */
export function seededShuffle(items, key) {
  const random = mulberry32(seedFrom(key));
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
