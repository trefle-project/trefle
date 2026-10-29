import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const error = vi.fn();
const warn = vi.fn();
vi.mock("../../src/lib/log", () => ({ log: { error, warn, info: vi.fn(), debug: vi.fn() } }));

const { revalidateTags } = await import("../../src/hooks/revalidate");

/**
 * 003-post-launch-improvements, FR-008 — a transient failure to notify the
 * renderer must be retried, and a final failure must be loud (error-level
 * log with the page id/tags), not silently dropped. This is the fix for
 * "editing a published page doesn't visibly republish".
 */
describe("revalidateTags retry", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_REVALIDATE_URL = "http://web:3001/api/revalidate";
    process.env.REVALIDATE_SECRET = "test-secret";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("recovers when an early attempt fails and a later one succeeds", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("network blip");
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await revalidateTags({ reason: "page-changed", tags: ["page:1"] });

    expect(calls).toBe(2);
    expect(error).not.toHaveBeenCalled();
  }, 10_000);

  it("logs at error level with the reason/tags/status once every attempt fails", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

    await revalidateTags({ reason: "page-changed", tags: ["page:1", "domain:2"] });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "revalidate failed after retries",
      expect.objectContaining({ reason: "page-changed", tags: ["page:1", "domain:2"], attempts: 3, status: 503 }),
    );
  }, 10_000);
});
