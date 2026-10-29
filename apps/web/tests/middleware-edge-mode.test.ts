import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NONCE_PLACEHOLDER, parseAbMarker } from "@trefle/shared";

const { getActiveDomainByHost, getRunningTestFor } = vi.hoisted(() => ({
  getActiveDomainByHost: vi.fn(),
  getRunningTestFor: vi.fn(),
}));
vi.mock("../src/lib/payload-client", () => ({ getActiveDomainByHost, getRunningTestFor }));

import { middleware } from "../src/middleware";

/**
 * 020-edge-html-cache, contracts/origin-edge-mode.md — the edge Worker's
 * requests (secret in `X-Trefle-Edge`) render with placeholders and no
 * cookie; every other request is today's legacy mode.
 */
const SECRET = "a".repeat(64);
const TEST = { experimentKey: "page-5-1", variantIds: ["5", "9"] };

const nonceOf = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") ?? "")?.[1];
/** Request headers middleware forwards to the render (Next's override protocol). */
const forwarded = (r: Response, name: string) => r.headers.get(`x-middleware-request-${name}`);

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://site-a.example${path}`, { headers: { host: "site-a.example", "x-forwarded-proto": "https", ...headers } });
}

beforeEach(() => {
  vi.stubEnv("EDGE_SECRET", SECRET);
  getActiveDomainByHost.mockResolvedValue({ id: 3 });
  getRunningTestFor.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("edge mode (secret matches)", () => {
  it("uses the placeholder nonce in both CSP headers and x-nonce, tags the page, sets no cookie", async () => {
    const res = await middleware(request("/offre", { "x-trefle-edge": SECRET }));
    expect(nonceOf(res)).toBe(NONCE_PLACEHOLDER);
    expect(forwarded(res, "content-security-policy")).toContain(`'nonce-${NONCE_PLACEHOLDER}'`);
    expect(forwarded(res, "x-nonce")).toBe(NONCE_PLACEHOLDER);
    expect(res.headers.get("cache-tag")).toBe("html,domain:3");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("removes the secret and flags the render", async () => {
    const res = await middleware(request("/offre", { "x-trefle-edge": SECRET }));
    expect(forwarded(res, "x-trefle-edge")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")).not.toContain("x-trefle-edge,");
    expect(forwarded(res, "x-trefle-edge-render")).toBe("1");
  });

  it("tags with html only when the host has no active domain", async () => {
    getActiveDomainByHost.mockResolvedValue(null);
    const res = await middleware(request("/offre", { "x-trefle-edge": SECRET }));
    expect(res.headers.get("cache-tag")).toBe("html");
  });

  it("answers a tested path with an empty 200 and a parsable marker, no cookie, no render", async () => {
    getRunningTestFor.mockResolvedValue(TEST);
    const res = await middleware(request("/offre", { "x-trefle-edge": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(parseAbMarker(res.headers.get("x-trefle-ab"))).toEqual({ ...TEST, domainId: "3" });
    expect(res.headers.get("cache-tag")).toBe("html,domain:3");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("renders /ab-variant/<id> normally (no marker) with the domain tag", async () => {
    getRunningTestFor.mockResolvedValue(TEST);
    const res = await middleware(request("/ab-variant/9", { "x-trefle-edge": SECRET }));
    expect(res.headers.get("x-trefle-ab")).toBeNull();
    expect(res.headers.get("cache-tag")).toBe("html,domain:3");
    expect(getRunningTestFor).not.toHaveBeenCalled();
  });
});

describe("legacy mode", () => {
  it.each([
    ["wrong secret", { "x-trefle-edge": "b".repeat(64) }, SECRET],
    ["no secret sent", {}, SECRET],
    ["EDGE_SECRET unset", { "x-trefle-edge": SECRET }, ""],
  ])("%s → random nonce, no cache tag, client-sent render flag stripped", async (_label, headers, secret) => {
    vi.stubEnv("EDGE_SECRET", secret);
    const res = await middleware(request("/offre", { ...headers, "x-trefle-edge-render": "1" }));
    expect(nonceOf(res)).not.toBe(NONCE_PLACEHOLDER);
    expect(forwarded(res, "x-nonce")).toBe(nonceOf(res));
    expect(forwarded(res, "x-trefle-edge-render")).toBeNull();
    expect(forwarded(res, "x-trefle-edge")).toBeNull();
    expect(res.headers.get("cache-tag")).toBeNull();
  });

  it("018 R15 — draws a version for every view with a rewrite, sets no cookie, ignores the visitor's cookies", async () => {
    getRunningTestFor.mockResolvedValue(TEST);
    const seen = new Set<string>();
    for (let i = 0; i < 30 && seen.size < 2; i++) {
      const res = await middleware(request("/offre", { cookie: "tf-ab-page-5-1=9; tf_consent=rejected%7Cx" }));
      const rewrite = res.headers.get("x-middleware-rewrite") ?? "";
      expect(rewrite).toMatch(/\/ab-variant\/(5|9)$/);
      seen.add(rewrite.slice(-1));
      expect(res.headers.get("set-cookie") ?? "").not.toMatch(/tf-ab-/);
      expect(res.headers.get("x-trefle-ab")).toBeNull();
    }
    expect(seen).toEqual(new Set(["5", "9"]));
  });
});
