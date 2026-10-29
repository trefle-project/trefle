import { EDGE_HTML_TAG } from "@trefle/shared";

import { log } from "./log";

/**
 * 020-edge-html-cache, contracts/purge.md — drops cached page copies from the
 * edge (Cloudflare purge by tag) when content changes.
 *
 * Tags are collected for 1 s and sent as one request: a publish fires several
 * revalidations in a row, and the Free plan allows 5 purge requests a minute.
 * `html` covers every cached page, so it is sent alone when present. 429 and
 * 5xx are retried with backoff (≤ 60 s in all); a final failure is logged —
 * the webhook answer never waits for it. Without `CLOUDFLARE_PURGE_TOKEN`
 * (local dev, e2e) nothing is sent.
 */
const COALESCE_MS = 1_000;
const MAX_TAGS_PER_REQUEST = 100;
/** Waits before each retry; they add up to 60 s. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 29_000];

let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function queueEdgePurge(tags: readonly string[]): void {
  if (tags.length === 0) return;
  if (!process.env.CLOUDFLARE_PURGE_TOKEN || !process.env.CLOUDFLARE_ZONE_ID) {
    log.debug("edge purge skipped (no purge token)", { tags: [...tags] });
    return;
  }
  for (const tag of tags) pending.add(tag);
  timer ??= setTimeout(() => void flush(), COALESCE_MS);
}

async function flush(): Promise<void> {
  const tags = pending.has(EDGE_HTML_TAG) ? [EDGE_HTML_TAG] : [...pending];
  pending = new Set();
  timer = null;
  for (let i = 0; i < tags.length; i += MAX_TAGS_PER_REQUEST) {
    await purge(tags.slice(i, i + MAX_TAGS_PER_REQUEST));
  }
}

async function purge(tags: string[]): Promise<void> {
  let status: number | string = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CLOUDFLARE_PURGE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      status = res.status;
      if (res.ok) {
        log.info("edge purged", { tags });
        return;
      }
      // Anything but rate limiting or a Cloudflare-side error will not get better by waiting.
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      status = err instanceof Error ? err.message : "network error";
    }
  }
  log.error("edge purge failed", { tags, status });
}

/** Tests only: forget anything queued. */
export function resetEdgePurgeForTests(): void {
  if (timer) clearTimeout(timer);
  pending = new Set();
  timer = null;
}
