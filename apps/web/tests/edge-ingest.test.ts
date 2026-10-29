import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postPageViewBatch, postAbExposureBatch, log } = vi.hoisted(() => ({
  postPageViewBatch: vi.fn(),
  postAbExposureBatch: vi.fn(),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/payload-client", () => ({ postPageViewBatch, postAbExposureBatch }));
vi.mock("../src/lib/log", () => ({ log }));

import { POST } from "../src/app/api/edge/views/route";
import { POST as POST_EXPOSURES } from "../src/app/api/edge/exposures/route";

/** 020-edge-html-cache, contracts/edge-ingest.md — the Worker's view batches. */
const SECRET = "e".repeat(64);
const WINDOWS = [{ start: "2026-10-12T10:12:00.000Z", counts: { "12": 340 } }];
const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");
const request = (raw: string, signature = sign(raw)) =>
  new Request("http://web/api/edge/views", { method: "POST", headers: { "x-trefle-signature": signature }, body: raw });
const body = (at = new Date().toISOString(), windows: unknown = WINDOWS) => JSON.stringify({ at, windows });

beforeEach(() => {
  vi.stubEnv("EDGE_SECRET", SECRET);
  postPageViewBatch.mockResolvedValue(200);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/edge/views", () => {
  it("forwards a signed, fresh batch to the CMS", async () => {
    const res = await POST(request(body()));
    expect(res.status).toBe(200);
    expect(postPageViewBatch).toHaveBeenCalledWith(WINDOWS);
  });

  it.each([
    ["wrong secret", (raw: string) => sign(raw, "f".repeat(64))],
    ["no signature", () => ""],
    ["signature of another body", () => sign("{}")],
  ])("401 on a bad signature (%s)", async (_label, signature) => {
    const raw = body();
    expect((await POST(request(raw, signature(raw)))).status).toBe(401);
    expect(postPageViewBatch).not.toHaveBeenCalled();
  });

  it("401 when EDGE_SECRET is not set", async () => {
    vi.stubEnv("EDGE_SECRET", "");
    expect((await POST(request(body()))).status).toBe(401);
  });

  it("400 when `at` is more than 5 minutes off", async () => {
    expect((await POST(request(body(new Date(Date.now() - 6 * 60_000).toISOString())))).status).toBe(400);
    expect(postPageViewBatch).not.toHaveBeenCalled();
  });

  it("502 when the CMS refuses or is unreachable (the Worker re-sends next minute)", async () => {
    postPageViewBatch.mockResolvedValue(500);
    expect((await POST(request(body()))).status).toBe(502);
    postPageViewBatch.mockRejectedValue(new Error("down"));
    expect((await POST(request(body()))).status).toBe(502);
    expect(log.error).toHaveBeenCalled();
  });
});

describe("POST /api/edge/exposures (018)", () => {
  const ITEM = { visitorId: "11111111-1111-4111-8111-111111111111", experimentKey: "k", variantId: "9", domainId: "3" };
  const exposures = (at = new Date().toISOString()) => JSON.stringify({ at, exposures: [{ ...ITEM, at }] });
  const req = (raw: string, signature = sign(raw)) =>
    new Request("http://web/api/edge/exposures", { method: "POST", headers: { "x-trefle-signature": signature }, body: raw });

  it("checks the signature and freshness like the views route", async () => {
    const raw = exposures();
    expect((await POST_EXPOSURES(req(raw, sign(raw, "f".repeat(64))))).status).toBe(401);
    expect((await POST_EXPOSURES(req(exposures(new Date(Date.now() - 6 * 60_000).toISOString())))).status).toBe(400);
    expect(postAbExposureBatch).not.toHaveBeenCalled();
  });

  it("forwards a valid batch to the CMS intake and answers its status and body", async () => {
    postAbExposureBatch.mockResolvedValue({ status: 200, body: { accepted: 1, ignored: 0 } });
    const res = await POST_EXPOSURES(req(exposures()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1, ignored: 0 });
    expect(postAbExposureBatch).toHaveBeenCalledWith([expect.objectContaining(ITEM)]);
  });

  it("passes a refusal through (the queue retries) and logs it", async () => {
    postAbExposureBatch.mockResolvedValue({ status: 400, body: { error: "bad body" } });
    expect((await POST_EXPOSURES(req(exposures()))).status).toBe(400);
    postAbExposureBatch.mockRejectedValue(new Error("down"));
    expect((await POST_EXPOSURES(req(exposures()))).status).toBe(502);
    expect(log.error).toHaveBeenCalled();
  });

  it("400 when exposures is not a list", async () => {
    const raw = JSON.stringify({ at: new Date().toISOString(), exposures: "x" });
    expect((await POST_EXPOSURES(req(raw))).status).toBe(400);
  });
});
