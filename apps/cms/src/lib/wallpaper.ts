/**
 * 022-ux-improvement (US4, FR-020, contracts/admin-ui.md) — which cells of the
 * admin's tiled wallpaper show the variant image. Pure (the random source is
 * passed in) so it can be tested; drawn by AdminChrome on a canvas.
 * - `perScreen`: exactly `count` distinct cells (all of them if the screen
 *   has fewer);
 * - `oneIn`: each cell independently, with a 1-in-`oneIn` chance.
 */
export type VariantPlacement = { cols: number; rows: number; mode: "perScreen" | "oneIn"; count: number; oneIn: number; random?: () => number };

export function placeVariants({ cols, rows, mode, count, oneIn, random = Math.random }: VariantPlacement): Set<number> {
  const cells = Math.max(0, cols) * Math.max(0, rows);
  const picked = new Set<number>();
  if (cells === 0) return picked;
  if (mode === "oneIn") {
    const p = 1 / Math.max(2, oneIn);
    for (let i = 0; i < cells; i++) if (random() < p) picked.add(i);
    return picked;
  }
  const want = Math.min(cells, Math.max(1, Math.floor(count)));
  if (want === cells) {
    for (let i = 0; i < cells; i++) picked.add(i);
    return picked;
  }
  while (picked.size < want) picked.add(Math.floor(random() * cells));
  return picked;
}

/** Grid size for a viewport and a tile. */
export const gridFor = (width: number, height: number, tileW: number, tileH: number) => ({
  cols: Math.ceil(width / Math.max(1, tileW)),
  rows: Math.ceil(height / Math.max(1, tileH)),
});

/** A small seeded random source (mulberry32), for tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
