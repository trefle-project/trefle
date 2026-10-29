/**
 * Bounded, single-use, short-lived in-memory flash store (009, research.md
 * §2) — carries a lead-form validation failure's submitted values and
 * per-field errors across the redirect to `/form-retry`. Single-instance
 * assumption, same as `apps/web/src/lib/rate-limit.ts`'s existing store.
 *
 * The redirect URL only ever carries the random token this module hands
 * out, never the record itself — putting personal field values in a URL
 * would risk them reaching a reverse-proxy access log.
 *
 * Stored on `globalThis`, not a plain module-level `const` — confirmed live
 * (curl round-trip against the built image) that Next.js's App Router
 * bundles a Route Handler (`/api/leads`) and a Page (`/form-retry`) as
 * separate server chunks, each getting its OWN copy of an ordinary module,
 * so a plain `const store = new Map()` here silently split into two
 * disconnected stores — `put()` from one route was invisible to `take()`
 * from the other. `rate-limit.ts` never hit this because it's only ever
 * imported from the one route file that uses it. `globalThis` is the one
 * thing guaranteed to be the same object across every chunk in a single
 * Node.js process (`next start`'s actual runtime here, not serverless).
 */

import { randomBytes } from "node:crypto";

export interface FormErrorRecord {
  pageId: string;
  values: Record<string, string>;
  fieldErrors: Record<string, string>;
}

type Entry = { record: FormErrorRecord; expiresAt: number };

declare global {
  var __trefleFormErrorStore: Map<string, Entry> | undefined;
}

const store: Map<string, Entry> = globalThis.__trefleFormErrorStore ?? new Map();
globalThis.__trefleFormErrorStore = store;

const TTL_MS = 5 * 60_000;
const MAX_KEYS = 5_000;
const SWEEP_PER_CALL = 20;

function sweepExpired(now: number): void {
  let checked = 0;
  for (const [key, entry] of store) {
    if (checked >= SWEEP_PER_CALL) break;
    checked += 1;
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/** Drop the oldest-inserted entry once at capacity — only called before a genuinely new key is added. */
function evictOldestIfFull(): void {
  if (store.size < MAX_KEYS) return;
  const oldest = store.keys().next().value;
  if (oldest !== undefined) store.delete(oldest);
}

/** Stores a record, returning the opaque token that retrieves it exactly once. */
export function put(record: FormErrorRecord): string {
  const now = Date.now();
  sweepExpired(now);
  evictOldestIfFull();
  const token = randomBytes(18).toString("base64url");
  store.set(token, { record, expiresAt: now + TTL_MS });
  return token;
}

/** Retrieves and deletes a record — a second call with the same token returns null. */
export function take(token: string): FormErrorRecord | null {
  const now = Date.now();
  sweepExpired(now);
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  if (entry.expiresAt <= now) return null;
  return entry.record;
}

/** test helpers */
export function __resetFormErrorStore(): void {
  store.clear();
}
export function __storeSize(): number {
  return store.size;
}
export const __MAX_KEYS = MAX_KEYS;
export const __TTL_MS = TTL_MS;
