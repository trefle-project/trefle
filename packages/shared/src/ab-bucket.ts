/**
 * 008-ab-testing, research.md §3 — deterministic visitor → variant
 * assignment. Pure and self-contained: no network call, no dependency on
 * GrowthBook being reachable. The renderer's middleware and the edge Worker
 * (020) call this after they already know which variant page ids are in play
 * for a given running test; this only decides *which one* a given visitor
 * lands on. In `@trefle/shared` so both use the exact same split.
 *
 * FNV-1a over `${experimentKey}:${visitorId}`, normalised to [0, 1) and
 * partitioned evenly across `variantIds` — the same shape GrowthBook's own
 * SDKs document for deterministic hashing (same visitor + same experiment
 * key always yields the same result; a different experiment key can yield
 * a different one for the same visitor).
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assignVariant(visitorId: string, experimentKey: string, variantIds: string[]): string {
  if (variantIds.length === 0) throw new Error("assignVariant: variantIds must not be empty");
  const normalized = fnv1a32(`${experimentKey}:${visitorId}`) / 0xffffffff;
  const index = Math.min(variantIds.length - 1, Math.floor(normalized * variantIds.length));
  // Safe: index is clamped to [0, variantIds.length - 1] above, and the
  // empty-array case already threw.
  return variantIds[index]!;
}
