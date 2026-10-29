import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// No domain → no A/B bucketing: the test only looks at the CSP header.
vi.mock("../src/lib/payload-client", () => ({
  getActiveDomainByHost: vi.fn().mockResolvedValue(null),
  getRunningTestFor: vi.fn().mockResolvedValue(null),
}));

import { middleware } from "../src/middleware";

/**
 * 002-security-hardening FR-004, amended by 014-custom-code-editing
 * (research R3, contracts/rendering.md § CSP): `script-src` stays strict
 * (nonce + 'strict-dynamic', never 'unsafe-inline'); connections, frames,
 * media and stylesheets are opened to https so admin-added vendor code works.
 */
async function cspFor(url: string, headers: Record<string, string> = {}) {
  const res = await middleware(new NextRequest(url, { headers }));
  const csp = res.headers.get("content-security-policy") ?? "";
  return Object.fromEntries(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  ) as Record<string, string>;
}

describe("renderer CSP (014)", () => {
  it("keeps script-src nonce-only and opens connect/frame/media/style to https", async () => {
    const csp = await cspFor("https://site-a.example/offre", { "x-forwarded-proto": "https" });
    expect(csp["script-src"]).toMatch(/^'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'$/);
    expect(csp["script-src"]).not.toContain("unsafe-inline");
    expect(csp["connect-src"]).toBe("'self' https:");
    expect(csp["frame-src"]).toBe("'self' https:");
    expect(csp["media-src"]).toBe("'self' https: blob:");
    expect(csp["style-src"]).toBe("'self' 'unsafe-inline' https:");
    expect(csp["object-src"]).toBe("'none'");
    expect(csp["frame-ancestors"]).toBe("'none'");
    expect(csp["form-action"]).toBe("'self'");
    expect(csp).toHaveProperty("upgrade-insecure-requests");
  });

  it("uses a fresh nonce per request and passes it to the page as x-nonce", async () => {
    const a = await middleware(new NextRequest("http://site-a.localhost/"));
    const b = await middleware(new NextRequest("http://site-a.localhost/"));
    const nonce = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce(a));
  });

  it("doesn't force https upgrades on the plain-http local stack", async () => {
    expect(await cspFor("http://site-a.localhost/")).not.toHaveProperty("upgrade-insecure-requests");
  });
});

describe("renderer CSP — domain fonts (015)", () => {
  it("font-src names a plain-http asset host (local/CI), adds nothing for an https one", async () => {
    vi.stubEnv("ASSET_ORIGIN", "http://trefle-assets.web.garage.localhost:3902/");
    expect((await cspFor("http://site-a.localhost:3001/"))["font-src"]).toBe("'self' data: https: http://trefle-assets.web.garage.localhost:3902");
    vi.stubEnv("ASSET_ORIGIN", "https://assets.example.fr");
    expect((await cspFor("https://site-a.example/", { "x-forwarded-proto": "https" }))["font-src"]).toBe("'self' data: https:");
    vi.stubEnv("ASSET_ORIGIN", "");
    expect((await cspFor("https://site-a.example/"))["font-src"]).toBe("'self' data: https:");
    vi.unstubAllEnvs();
  });
});
