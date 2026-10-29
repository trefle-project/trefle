import { beforeEach, describe, expect, it } from "vitest";

import { __MAX_KEYS, __resetRateLimits, __storeSize, checkEmailPageLimit, checkIpLimit } from "../src/lib/rate-limit";

/**
 * 003-post-launch-improvements, FR-005 — the shared in-memory rate-limit
 * store must stay bounded even if an attacker cycles through many distinct
 * IPs/emails, and must keep working correctly for real keys once that cap
 * is reached.
 */
describe("rate-limit store bound", () => {
  beforeEach(() => {
    __resetRateLimits();
  });

  it("keeps the store's key count at or below MAX_KEYS under a flood of distinct IPs", () => {
    for (let i = 0; i < __MAX_KEYS + 5_000; i++) checkIpLimit(`203.0.113.${i}`);
    expect(__storeSize()).toBeLessThanOrEqual(__MAX_KEYS);
  });

  it("keeps rate limiting correctly for keys near the cap boundary", () => {
    for (let i = 0; i < __MAX_KEYS + 100; i++) checkIpLimit(`198.51.100.${i}`);
    // a fresh IP submitted after the flood still gets its own full allowance
    // (checkIpLimit returns the per-minute result only when IT fails; a pass
    // falls through to the per-day bucket's result, hence remaining: 99).
    const fresh = checkIpLimit("192.0.2.1");
    expect(fresh.ok).toBe(true);
    expect(fresh.remaining).toBe(99);
    // hitting the same fresh IP past its per-minute limit (10/min) still 429s
    for (let i = 0; i < 9; i++) checkIpLimit("192.0.2.1");
    expect(checkIpLimit("192.0.2.1").ok).toBe(false);
  });

  it("also stays bounded under a flood of distinct (email, page) keys", () => {
    for (let i = 0; i < __MAX_KEYS + 1_000; i++) checkEmailPageLimit(`u${i}@example.com`, "page-1");
    expect(__storeSize()).toBeLessThanOrEqual(__MAX_KEYS);
  });
});
