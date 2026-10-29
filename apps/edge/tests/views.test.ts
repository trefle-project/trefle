import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { NONCE_PLACEHOLDER, formTokenPlaceholder } from "@trefle/shared";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker, { type Env } from "../src/index";
import { runViewCron, toWindows, viewQuery, windowBounds } from "../src/views";

/** 020-edge-html-cache, contracts/edge-worker.md §5–§6 — counting at the edge. */
const writeDataPoint = vi.fn();
const env = {
  EDGE_SECRET: "e".repeat(64),
  FORM_TOKEN_SECRET: "form-secret",
  CF_ACCOUNT_ID: "acct",
  CF_ANALYTICS_TOKEN: "analytics-token",
  ORIGIN_INGEST_URL: "https://origin.example",
  MODE: "on",
  EXPOSURES: "off",
  PAGE_VIEWS: { writeDataPoint },
} as unknown as Env;

const page = (status = 200) =>
  new Response(`<html><head><meta name="tf-page" content="12"/><script nonce="${NONCE_PLACEHOLDER}"></script></head><body>${formTokenPlaceholder("12")}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => page());
});
afterEach(() => {
  vi.restoreAllMocks();
  writeDataPoint.mockReset();
});

async function serve(request: Request) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, env, ctx);
  await res.text();
  await waitOnExecutionContext(ctx);
  return res;
}

describe("recording views", () => {
  it("writes one data point per page served, with the page id and host", async () => {
    await serve(new Request("https://site-a.example/offre"));
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({ indexes: ["12"], blobs: ["site-a.example"], doubles: [1] });
  });

  it("does not count a pass-through request, a not-found page or a HEAD", async () => {
    await serve(new Request("https://site-a.example/offre", { method: "POST" }));
    fetchMock.mockImplementation(async () => page(404));
    await serve(new Request("https://site-a.example/missing"));
    fetchMock.mockImplementation(async () => page());
    await serve(new Request("https://site-a.example/offre", { method: "HEAD" }));
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("a failing dataset never breaks the page", async () => {
    writeDataPoint.mockImplementation(() => {
      throw new Error("dataset down");
    });
    const res = await serve(new Request("https://site-a.example/offre"));
    expect(res.status).toBe(200);
  });
});

describe("the per-minute cron", () => {
  const NOW = Date.parse("2026-10-12T10:15:03.456Z");

  it("asks for the 10 last closed minutes, the current one excluded", () => {
    const { start, end } = windowBounds(NOW);
    expect(start.toISOString()).toBe("2026-10-12T10:05:00.000Z");
    expect(end.toISOString()).toBe("2026-10-12T10:15:00.000Z");
    const sql = viewQuery(start, end);
    expect(sql).toContain("FROM trefle_page_views");
    expect(sql).toContain("SUM(_sample_interval) AS n");
    expect(sql).toContain("timestamp >= toDateTime('2026-10-12 10:05:00') AND timestamp < toDateTime('2026-10-12 10:15:00')");
  });

  it("turns rows into minute windows with rounded counts", () => {
    expect(
      toWindows([
        { m: "2026-10-12 10:13:00", page: "12", n: "298" },
        { m: "2026-10-12 10:12:00", page: "12", n: 340 },
        { m: "2026-10-12 10:12:00", page: "57", n: 11.6 },
        { m: "2026-10-12 10:12:00", page: "", n: 3 },
      ]),
    ).toEqual([
      { start: "2026-10-12T10:12:00.000Z", counts: { "12": 340, "57": 12 } },
      { start: "2026-10-12T10:13:00.000Z", counts: { "12": 298 } },
    ]);
  });

  it("queries Analytics Engine with the analytics token, then posts the windows signed with EDGE_SECRET", async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ data: [{ m: "2026-10-12 10:12:00", page: "12", n: "340" }] }));
    fetchMock.mockImplementationOnce(async () => Response.json({ ok: true }));
    const result = await runViewCron(env, NOW);
    expect(result).toEqual({ windows: 1, status: 200 });

    const [aeUrl, aeInit] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(aeUrl).toBe("https://api.cloudflare.com/client/v4/accounts/acct/analytics_engine/sql");
    expect(new Headers(aeInit.headers).get("authorization")).toBe("Bearer analytics-token");

    const [originUrl, originInit] = fetchMock.mock.calls[1]! as [URL, RequestInit];
    expect(String(originUrl)).toBe("https://origin.example/api/edge/views");
    const body = originInit.body as string;
    expect(JSON.parse(body)).toEqual({
      at: "2026-10-12T10:15:03.456Z",
      windows: [{ start: "2026-10-12T10:12:00.000Z", counts: { "12": 340 } }],
    });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.EDGE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(new Headers(originInit.headers).get("x-trefle-signature")).toBe(expected);
  });

  it("sends nothing when no page was viewed", async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ data: [] }));
    expect(await runViewCron(env, NOW)).toEqual({ windows: 0, status: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when Analytics Engine or the origin fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementationOnce(async () => new Response("", { status: 500 }));
    await expect(runViewCron(env, NOW)).resolves.toEqual({ windows: 0, status: null });
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    await expect(runViewCron(env, NOW)).resolves.toEqual({ windows: 0, status: null });
  });
});
