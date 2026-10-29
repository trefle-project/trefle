import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { log } = vi.hoisted(() => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/lib/log", () => ({ log }));

import { queueEdgePurge, resetEdgePurgeForTests } from "../src/lib/edge-purge";

/** 020-edge-html-cache, contracts/purge.md — purge by tag, coalesced, retried. */
const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).tags as string[]);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLOUDFLARE_PURGE_TOKEN", "purge-token");
  vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-1");
  fetchMock = vi.fn().mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  resetEdgePurgeForTests();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("queueEdgePurge", () => {
  it("sends calls made within 1 s as one de-duplicated request to the zone, with the purge token", async () => {
    queueEdgePurge(["domain:3"]);
    queueEdgePurge(["domain:4", "domain:3"]);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer purge-token");
    expect(sent(fetchMock)).toEqual([["domain:3", "domain:4"]]);
  });

  it("sends html alone when it is queued (it covers every page)", async () => {
    queueEdgePurge(["domain:3"]);
    queueEdgePurge(["html"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent(fetchMock)).toEqual([["html"]]);
  });

  it("splits more than 100 tags into several requests", async () => {
    queueEdgePurge(Array.from({ length: 150 }, (_, i) => `domain:${i}`));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent(fetchMock).map((tags) => tags.length)).toEqual([100, 50]);
  });

  it("retries a 429 and a 5xx, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok());
    queueEdgePurge(["domain:3"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("gives up after 60 s of retries and logs the tags", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    queueEdgePurge(["domain:3"]);
    await vi.advanceTimersByTimeAsync(1000 + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(log.error).toHaveBeenCalledWith("edge purge failed", { tags: ["domain:3"], status: 429 });
  });

  it("does not retry a request Cloudflare refuses outright (403)", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    queueEdgePurge(["domain:3"]);
    await vi.advanceTimersByTimeAsync(1000 + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith("edge purge failed", { tags: ["domain:3"], status: 403 });
  });

  it("retries a network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(ok());
    queueEdgePurge(["domain:3"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("sends nothing without a purge token (local dev, e2e)", async () => {
    vi.stubEnv("CLOUDFLARE_PURGE_TOKEN", "");
    queueEdgePurge(["html"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an empty tag list", async () => {
    queueEdgePurge([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
