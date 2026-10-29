import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { type Env } from "../src/index";

/**
 * 020-edge-html-cache, research R14 (T052) — the Worker never makes a page
 * fail on its own account: anything that throws before the response falls
 * back to the origin (passThroughOnException, set before anything else), and
 * counting failures never reach the response.
 */
const env = { EDGE_SECRET: "e".repeat(64), FORM_TOKEN_SECRET: "s", MODE: "on", EXPOSURES: "off" } as Env;

function context() {
  const order: string[] = [];
  const ctx = {
    passThroughOnException: vi.fn(() => order.push("passThrough")),
    waitUntil: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, order };
}
const visit = () => new Request("https://site-a.example/offre") as Request<unknown, IncomingRequestCfProperties>;

afterEach(() => vi.restoreAllMocks());

describe("fallback to the origin", () => {
  it("MODE=fail: the fallback is armed, then it throws before any origin request", async () => {
    const origin = vi.spyOn(globalThis, "fetch");
    const { ctx } = context();
    await expect(worker.fetch(visit(), { ...env, MODE: "fail" }, ctx)).rejects.toThrow("MODE=fail");
    expect(ctx.passThroughOnException).toHaveBeenCalledTimes(1);
    expect(origin).not.toHaveBeenCalled();
  });

  it("an origin request that fails is thrown after the fallback is armed", async () => {
    const { ctx, order } = context();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      order.push("origin");
      throw new Error("origin unreachable");
    });
    await expect(worker.fetch(visit(), env, ctx)).rejects.toThrow("origin unreachable");
    expect(order).toEqual(["passThrough", "origin"]);
  });

  it("a failing view counter does not affect the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('<html><head><meta name="tf-page" content="12"/></head></html>', { headers: { "content-type": "text/html" } }),
    );
    const { ctx } = context();
    const broken = { ...env, PAGE_VIEWS: { writeDataPoint: () => { throw new Error("dataset down"); } } } as unknown as Env;
    const res = await worker.fetch(visit(), broken, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("tf-page");
    await Promise.all((ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls.map(([p]) => p));
  });

  it("pass-through requests do not arm the fallback (nothing of the Worker's can fail)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const { ctx } = context();
    await worker.fetch(new Request("https://site-a.example/offre", { method: "POST" }) as Request<unknown, IncomingRequestCfProperties>, env, ctx);
    expect(ctx.passThroughOnException).not.toHaveBeenCalled();
  });
});
