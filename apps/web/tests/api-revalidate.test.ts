import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const queueEdgePurge = vi.fn();
vi.mock("../src/lib/edge-purge", () => ({ queueEdgePurge }));

beforeAll(() => {
  process.env.REVALIDATE_SECRET = "test-reval";
});

const { POST } = await import("../src/app/api/revalidate/route");
const { revalidateSignature } = await import("../src/lib/tokens");

const makeReq = (body: string, sig: string) =>
  new Request("http://web/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-signature": sig },
    body,
  });

describe("POST /api/revalidate (T048)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 on a bad signature", async () => {
    const body = JSON.stringify({ reason: "page-published", tags: ["page:1"], at: new Date().toISOString() });
    const res = await POST(makeReq(body, "deadbeef"));
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("400 when `at` is older than 5 minutes", async () => {
    const body = JSON.stringify({
      reason: "page-changed",
      tags: ["page:1"],
      at: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    const res = await POST(makeReq(body, revalidateSignature(body)));
    expect(res.status).toBe(400);
  });

  it("200 and revalidates each tag on a valid request", async () => {
    const body = JSON.stringify({
      reason: "page-published",
      tags: ["page:1", "domain:2", "page-list"],
      at: new Date().toISOString(),
    });
    const res = await POST(makeReq(body, revalidateSignature(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, revalidated: ["page:1", "domain:2", "page-list"] });
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenCalledWith("domain:2", expect.anything());
  });

  it("017 + 020 — expires every tag immediately: the next render (the edge refilling its copy) never gets stale data", async () => {
    const body = JSON.stringify({ reason: "page-changed", tags: ["media-aliases", "page-list", "domain:2"], at: new Date().toISOString() });
    const res = await POST(makeReq(body, revalidateSignature(body)));
    expect(res.status).toBe(200);
    for (const tag of ["media-aliases", "page-list", "domain:2"]) expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
    expect(revalidateTag).not.toHaveBeenCalledWith(expect.anything(), "max");
  });

  it("020 — then queues the edge purge: a media replacement purges html, after the fresh alias map", async () => {
    const body = JSON.stringify({ reason: "media", tags: ["media-aliases", "page-list"], at: new Date().toISOString() });
    await POST(makeReq(body, revalidateSignature(body)));
    expect(queueEdgePurge).toHaveBeenCalledWith(["html"]);
    expect(revalidateTag.mock.invocationCallOrder[0]!).toBeLessThan(queueEdgePurge.mock.invocationCallOrder[0]!);
  });

  it("020 — a page publish purges only its domain", async () => {
    const body = JSON.stringify({ reason: "page-published", tags: ["page:1", "domain:2", "page-list"], at: new Date().toISOString() });
    await POST(makeReq(body, revalidateSignature(body)));
    expect(queueEdgePurge).toHaveBeenCalledWith(["domain:2"]);
  });

  it("020 — nothing is purged on a refused request", async () => {
    const body = JSON.stringify({ reason: "page-published", tags: ["domain:2"], at: new Date().toISOString() });
    await POST(makeReq(body, "deadbeef"));
    expect(queueEdgePurge).not.toHaveBeenCalled();
  });
});
