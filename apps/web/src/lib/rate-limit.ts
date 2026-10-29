/**
 * Fixed-window in-memory rate limiting (T044). Single-instance assumption
 * (documented in research.md §5) — move to a shared store if `apps/web` scales
 * out. Also feeds the "duplicate" heuristic via the per-(email,page) window.
 */

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// 003-post-launch-improvements, FR-005 — this Map is the "shared store" the
// deferred finding names: unbounded, an attacker cycling through many fake
// IPs/emails could grow it without limit (resource exhaustion). MAX_KEYS is
// a hard cap enforced on every new key; SWEEP_PER_CALL opportunistically
// reclaims expired buckets each call (no background timer) so eviction
// mostly hits genuinely-stale entries rather than the cap alone.
const MAX_KEYS = 50_000;
const SWEEP_PER_CALL = 20;

function sweepExpired(now: number): void {
  let checked = 0;
  for (const [key, bucket] of store) {
    if (checked >= SWEEP_PER_CALL) break;
    checked += 1;
    if (bucket.resetAt <= now) store.delete(key);
  }
}

/** Drop the oldest-inserted entry once at capacity — only called before a genuinely new key is added. */
function evictOldestIfFull(): void {
  if (store.size < MAX_KEYS) return;
  const oldest = store.keys().next().value;
  if (oldest !== undefined) store.delete(oldest);
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweepExpired(now);
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    if (!b) evictOldestIfFull();
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  b.count += 1;
  const ok = b.count <= limit;
  return { ok, remaining: Math.max(0, limit - b.count), retryAfterSec: ok ? 0 : Math.ceil((b.resetAt - now) / 1000) };
}

const MIN = 60_000;
const DAY = 24 * 60 * 60 * 1000;

/** Per client IP: 10/min and 100/day. Fails if either window is exceeded. */
export function checkIpLimit(ip: string): RateResult {
  const perMin = hit(`ip:m:${ip}`, 10, MIN);
  if (!perMin.ok) return perMin;
  return hit(`ip:d:${ip}`, 100, DAY);
}

/** Per (email, page): 3/day. */
export function checkEmailPageLimit(email: string, pageId: string): RateResult {
  return hit(`ep:${email.toLowerCase()}:${pageId}`, 3, DAY);
}

/** test helpers */
export function __resetRateLimits(): void {
  store.clear();
}
export function __storeSize(): number {
  return store.size;
}
export const __MAX_KEYS = MAX_KEYS;
