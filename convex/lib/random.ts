export function normalizeSelectionSeed(seed?: number) {
  if (!Number.isFinite(seed)) {
    return Math.random();
  }

  const numericSeed = seed as number;
  return ((numericSeed % 1) + 1) % 1;
}
