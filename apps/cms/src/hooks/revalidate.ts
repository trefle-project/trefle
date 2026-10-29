import { createHmac } from "node:crypto";

import { log } from "../lib/log";

/**
 * Cache invalidation (T035) — see contracts/revalidation.md and
 * contracts/revalidation-retry.md. Payload change hooks call this; it POSTs
 * a signed body to the renderer's `/api/revalidate`. Still fire-and-forget
 * from the caller's perspective (a failed revalidation must never block a
 * save) — but 003-post-launch-improvements (FR-008) retries a transient
 * failure up to MAX_ATTEMPTS times before giving up, and a final failure
 * logs at `error` (not `warn`) so it's operationally visible instead of
 * silently dropped. This is the fix for "editing a published page doesn't
 * visibly republish" — a single untried attempt could miss a transient blip
 * and leave the page stale for up to the 1h ISR fallback with no signal.
 */

type Reason =
  | "page-published"
  | "page-unpublished"
  | "page-changed"
  | "domain-changed"
  | "domain-deleted"
  | "settings-changed"
  | "experiment-changed"
  | "media";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

export async function revalidateTags(args: { reason: Reason; tags: string[] }): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) {
    log.warn("revalidate skipped: WEB_REVALIDATE_URL / REVALIDATE_SECRET not set");
    return;
  }
  const body = JSON.stringify({ reason: args.reason, tags: args.tags, at: new Date().toISOString() });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  let lastStatus: number | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Revalidate-Signature": signature },
        body,
      });
      if (res.ok) return;
      lastStatus = res.status;
      lastErr = undefined;
    } catch (err) {
      lastStatus = undefined;
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  log.error("revalidate failed after retries", {
    reason: args.reason,
    tags: args.tags,
    attempts: MAX_ATTEMPTS,
    status: lastStatus,
    err: lastErr ? String(lastErr) : undefined,
  });
}
