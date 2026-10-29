import { createExecutionContext, createMessageBatch, getQueueResult, waitOnExecutionContext } from "cloudflare:test";
import { NONCE_PLACEHOLDER, encodeAbMarker, formTokenPlaceholder } from "@trefle/shared";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideVariant } from "../src/ab";
import type { Exposure } from "../src/exposures";
import worker, { type Env } from "../src/index";

/** 020-edge-html-cache, contracts/edge-worker.md §3, §7 — A/B at the edge (T060). */
const MARKER = encodeAbMarker({ experimentKey: "page-5-1760000000", variantIds: ["5", "9"], domainId: "3" });

describe("decideVariant (018 R15: drawn per view, no cookie)", () => {
  it("draws from the test's pages with the view number, deterministically", () => {
    const d = decideVariant(MARKER, "AAAAAAAAAAA")!;
    expect(["5", "9"]).toContain(d.variantId);
    expect(d).toMatchObject({ experimentKey: "page-5-1760000000", domainId: "3" });
    expect(decideVariant(MARKER, "AAAAAAAAAAA")).toEqual(d);
  });

  it("splits 10,000 random views 48–52 %", () => {
    let nine = 0;
    for (let i = 0; i < 10_000; i++) if (decideVariant(MARKER, crypto.randomUUID())!.variantId === "9") nine++;
    expect(nine).toBeGreaterThanOrEqual(4800);
    expect(nine).toBeLessThanOrEqual(5200);
  });

  it("falls back to the control on a marker it cannot fully read; null when even that fails", () => {
    expect(decideVariant("key;5,9", "x")).toEqual({ variantId: "5", experimentKey: "", domainId: "" });
    expect(decideVariant("garbage", "x")).toBeNull();
  });
});

describe("serving a page under test", () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const env = {
    EDGE_SECRET: "e".repeat(64),
    FORM_TOKEN_SECRET: "s",
    MODE: "on",
    EXPOSURES: "on",
    ORIGIN_INGEST_URL: "https://origin.example",
    PAGE_VIEWS: { writeDataPoint: vi.fn() },
    EXPOSURES_QUEUE: { send },
  } as unknown as Env;
  const variantPage = (id: string) =>
    new Response(`<html><head><meta name="tf-page" content="${id}"/><script nonce="${NONCE_PLACEHOLDER}"></script></head><body>variant ${id} ${formTokenPlaceholder(id)}</body></html>`, {
      headers: { "content-type": "text/html" },
    });

  let origin: MockInstance<typeof fetch>;
  beforeEach(() => {
    origin = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/offre") return new Response(null, { headers: { "x-trefle-ab": MARKER, "cache-tag": "html,domain:3" } });
      const id = /^\/ab-variant\/(\d+)$/.exec(path)?.[1];
      return id ? variantPage(id) : new Response("?", { status: 404 });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    send.mockClear();
  });

  async function visit(headers: Record<string, string> = {}, overrides: Partial<Env> = {}) {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://site-a.example/offre", { headers }) as Request<unknown, IncomingRequestCfProperties>, { ...env, ...overrides }, ctx);
    const body = await res.text();
    await waitOnExecutionContext(ctx);
    return { res, body };
  }

  /** The view number inside this response's form token (`pageId.issuedAt.<view number>`). */
  const viewNumberOf = (body: string) => {
    const token = /\b([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]{20,}\b/.exec(body.replace(/^.*variant \d+ /s, ""))![1]!;
    return atob(token.replace(/-/g, "+").replace(/_/g, "/")).split(".")[2];
  };

  it("serves a drawn version from the cache path, sets no cookie, no marker and no placeholder", async () => {
    const { res, body } = await visit({ cookie: "tf-ab-page-5-1760000000=9; tf_consent=accepted%7Cx" });
    const variant = /variant (\d+)/.exec(body)![1]!;
    expect(String(origin.mock.calls[1]![0])).toBe(`https://site-a.example/ab-variant/${variant}`);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(res.headers.get("x-trefle-ab")).toBeNull();
    expect(res.headers.get("cache-tag")).toBeNull();
    expect(res.headers.get("x-trefle-edge-served")).toBe("1");
    expect(body).not.toContain("TFEDGE");
  });

  it("draws every view anew, whatever the visitor's cookies: both versions appear", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30 && seen.size < 2; i++) seen.add(/variant (\d+)/.exec((await visit({ cookie: "tf-ab-page-5-1760000000=9" })).body)![1]!);
    expect(seen).toEqual(new Set(["5", "9"]));
  });

  it("sends one exposure per view, numbered like the view's form token; none for crawlers or with exposures off", async () => {
    const first = await visit({ "user-agent": "Mozilla/5.0" });
    const second = await visit();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toMatchObject({ visitorId: viewNumberOf(first.body), experimentKey: "page-5-1760000000", domainId: "3", variantId: /variant (\d+)/.exec(first.body)![1] });
    expect(send.mock.calls[1]![0].visitorId).toBe(viewNumberOf(second.body));
    expect(viewNumberOf(first.body)).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(viewNumberOf(first.body)).not.toBe(viewNumberOf(second.body));

    await visit({ "user-agent": "Googlebot/2.1" });
    await visit({}, { EXPOSURES: "off" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("the exposure queue consumer", () => {
  const env = { EDGE_SECRET: "e".repeat(64), ORIGIN_INGEST_URL: "https://origin.example" } as unknown as Env;
  const exposure: Exposure = { visitorId: "v1", experimentKey: "k", variantId: "9", domainId: "3", at: "2026-10-12T10:00:00.000Z" };
  afterEach(() => vi.restoreAllMocks());

  async function consume(status: number) {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const post = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status }));
    const batch = createMessageBatch<Exposure>("trefle-exposures", [
      { id: "1", timestamp: new Date(), attempts: 1, body: exposure },
      { id: "2", timestamp: new Date(), attempts: 1, body: { ...exposure, visitorId: "v2" } },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env);
    const result = await getQueueResult(batch, ctx);
    return { post, result };
  }

  it("posts one signed batch and acks it on 2xx", async () => {
    const { post, result } = await consume(200);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0]! as [URL, RequestInit];
    expect(String(url)).toBe("https://origin.example/api/edge/exposures");
    expect(JSON.parse(init.body as string).exposures).toHaveLength(2);
    expect(new Headers(init.headers).get("x-trefle-signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(result.explicitAcks.length + (result.ackAll ? 2 : 0)).toBe(2);
  });

  it("retries the whole batch when the origin refuses", async () => {
    const { result } = await consume(404);
    expect(result.retryBatch.retry).toBe(true);
  });
});
