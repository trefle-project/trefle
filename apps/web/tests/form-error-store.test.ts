import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __MAX_KEYS, __resetFormErrorStore, __storeSize, __TTL_MS, put, take } from "../src/lib/form-error-store";

/**
 * 009-lead-form-error-recovery, research.md §2 — the flash store carrying a
 * validation failure's submitted values across the redirect to
 * `/form-retry` must be single-use (never replayable), must expire on its
 * own, and must stay bounded under a flood of distinct submissions, the
 * same guarantees `rate-limit.test.ts` already covers for its own store.
 */
describe("form-error-store", () => {
  beforeEach(() => {
    __resetFormErrorStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a record", () => {
    const record = { pageId: "page-1", values: { firstName: "Ada" }, fieldErrors: { email: "Adresse email invalide." } };
    const token = put(record);
    expect(take(token)).toEqual(record);
  });

  it("is single-use — a second take on the same token returns null", () => {
    const token = put({ pageId: "page-1", values: {}, fieldErrors: {} });
    expect(take(token)).not.toBeNull();
    expect(take(token)).toBeNull();
  });

  it("returns null for an unknown token", () => {
    expect(take("does-not-exist")).toBeNull();
  });

  it("expires a record after the TTL window", () => {
    vi.useFakeTimers();
    const token = put({ pageId: "page-1", values: {}, fieldErrors: {} });
    vi.advanceTimersByTime(__TTL_MS + 1);
    expect(take(token)).toBeNull();
  });

  it("keeps the store's key count at or below MAX_KEYS under a flood of distinct submissions", () => {
    for (let i = 0; i < __MAX_KEYS + 500; i++) put({ pageId: `page-${i}`, values: {}, fieldErrors: {} });
    expect(__storeSize()).toBeLessThanOrEqual(__MAX_KEYS);
  });
});
