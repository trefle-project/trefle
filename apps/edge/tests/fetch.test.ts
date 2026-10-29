import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { NONCE_PLACEHOLDER, formTokenPlaceholder } from "@trefle/shared";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classify } from "../src/classify";
import worker, { type Env } from "../src/index";

const SECRET = "e".repeat(64);
const env = {
  EDGE_SECRET: SECRET,
  FORM_TOKEN_SECRET: "form-secret",
  MODE: "on",
  EXPOSURES: "off",
} as Env;

const CSP = `default-src 'self'; script-src 'self' 'nonce-${NONCE_PLACEHOLDER}' 'strict-dynamic'`;
const PAGE =
  `<html><head><meta name="tf-page" content="12"/><script nonce="${NONCE_PLACEHOLDER}"></script></head>` +
  `<body><input name="formToken" value="${formTokenPlaceholder("12")}"/></body></html>`;

/** The origin as the edge sees it: a cached page in edge mode. */
function originPage(extra: Record<string, string> = {}) {
  return new Response(PAGE, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      "content-length": String(PAGE.length),
      etag: '"abc"',
      "last-modified": "Sat, 11 Oct 2026 10:00:00 GMT",
      "x-middleware-rewrite": "/ab-variant/12",
      "x-nextjs-cache": "HIT",
      "x-nextjs-prerender": "1",
      "cache-tag": "html,domain:3",
      ...extra,
    },
  });
}

let origin: MockInstance<typeof fetch>;

beforeEach(() => {
  origin = vi.spyOn(globalThis, "fetch").mockImplementation(async () => originPage());
});
afterEach(() => vi.restoreAllMocks());

async function serve(request: Request, overrides: Partial<Env> = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, { ...env, ...overrides }, ctx);
  const body = await response.text();
  await waitOnExecutionContext(ctx);
  return { response, body };
}

const visit = (path = "/offre?utm_source=x", init: RequestInit = {}) =>
  new Request(`https://site-a.example${path}`, {
    headers: { cookie: "tf-consent=1", "accept-language": "fr", "user-agent": "Mozilla/5.0", referer: "https://x.example/" },
    ...init,
  });

describe("classify (contract §1)", () => {
  it.each([
    ["GET page", new Request("https://a.example/offre"), "page"],
    ["HEAD page", new Request("https://a.example/", { method: "HEAD" }), "page"],
    ["POST", new Request("https://a.example/offre", { method: "POST" }), "pass"],
    ["RSC header", new Request("https://a.example/offre", { headers: { RSC: "1" } }), "pass"],
    ["router state tree", new Request("https://a.example/offre", { headers: { "Next-Router-State-Tree": "x" } }), "pass"],
    ["router prefetch", new Request("https://a.example/offre", { headers: { "Next-Router-Prefetch": "1" } }), "pass"],
    ["_rsc query", new Request("https://a.example/offre?_rsc=abc"), "pass"],
    ["preview", new Request("https://a.example/preview/12"), "pass"],
    ["confirm", new Request("https://a.example/confirm"), "pass"],
    ["confirmation", new Request("https://a.example/confirmation"), "pass"],
    ["018 measurement page", new Request("https://a.example/audience-measurement"), "pass"],
    ["021 privacy policy", new Request("https://a.example/privacy?lang=en"), "pass"],
    ["021 legal notice", new Request("https://a.example/legal-notice"), "pass"],
    ["023 old measurement path", new Request("https://a.example/mesure-audience"), "pass"],
    ["023 old privacy path", new Request("https://a.example/confidentialite?lang=en"), "pass"],
    ["023 old legal-notice path", new Request("https://a.example/mentions-legales"), "pass"],
    ["unsubscribe", new Request("https://a.example/unsubscribe"), "pass"],
    ["form-retry", new Request("https://a.example/form-retry"), "pass"],
    ["a page whose path starts like one", new Request("https://a.example/previews-offre"), "page"],
  ])("%s → %s", (_label, request, expected) => {
    expect(classify(request)).toBe(expected);
  });
});

describe("cached page (contract §2)", () => {
  it("asks the origin for the page in edge mode: secret, no cookie, no query, GET, cached", async () => {
    await serve(visit());
    const [url, init] = origin.mock.calls[0]! as [URL, RequestInit & { cf: RequestInitCfProperties }];
    expect(String(url)).toBe("https://site-a.example/offre");
    const headers = new Headers(init.headers);
    expect(headers.get("x-trefle-edge")).toBe(SECRET);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("referer")).toBeNull();
    expect(headers.get("accept-language")).toBe("fr");
    expect(headers.get("user-agent")).toBe("Mozilla/5.0");
    expect(init.method).toBe("GET");
    expect(init.cf.cacheEverything).toBe(true);
    expect(init.cf.cacheTtlByStatus).toEqual({ "200-299": 86400, "404": 86400, "500-599": 0 });
  });

  it("never follows an origin redirect: the visitor gets it as is", async () => {
    await serve(visit());
    const [, init] = origin.mock.calls[0]! as [URL, RequestInit];
    expect(init.redirect).toBe("manual");
  });

  it("answers with this visit's nonce and token, and no placeholder", async () => {
    const { response, body } = await serve(visit());
    expect(body).not.toMatch(/TFEDGE/);
    const nonce = /'nonce-([0-9a-f]{32})'/.exec(response.headers.get("content-security-policy")!)?.[1];
    expect(nonce).toBeTruthy();
    expect(body).toContain(`<script nonce="${nonce}">`);
    expect(body).toMatch(/name="formToken" value="[\w-]+\.[\w-]+"/);
  });

  it("never gives two visits the same nonce or token", async () => {
    const a = await serve(visit());
    const b = await serve(visit());
    const nonce = (h: Headers) => /'nonce-([^']+)'/.exec(h.get("content-security-policy")!)?.[1];
    const token = (body: string) => /value="([^"]+)"/.exec(body)?.[1];
    expect(nonce(a.response.headers)).not.toBe(nonce(b.response.headers));
    expect(token(a.body)).toBeTruthy();
    expect(token(a.body)).not.toBe(token(b.body));
  });

  it("strips the internal headers and is never stored by the browser or a shared cache", async () => {
    const { response } = await serve(visit());
    for (const name of ["x-trefle-ab", "cache-tag", "x-middleware-rewrite", "x-nextjs-cache", "x-nextjs-prerender", "content-length", "etag", "last-modified"]) {
      expect(response.headers.get(name), name).toBeNull();
    }
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-trefle-edge-served")).toBe("1");
    expect(response.status).toBe(200);
  });

  it("keeps the origin status (a cached not-found page)", async () => {
    origin.mockImplementation(async () => new Response(PAGE, { status: 404, headers: { "content-type": "text/html" } }));
    const { response, body } = await serve(visit());
    expect(response.status).toBe(404);
    expect(body).not.toMatch(/TFEDGE/);
  });

  it("answers HEAD with the headers and no body", async () => {
    const { response, body } = await serve(visit("/offre", { method: "HEAD" }));
    expect(body).toBe("");
    expect(response.headers.get("x-trefle-edge-served")).toBe("1");
    expect(response.headers.get("content-security-policy")).not.toContain(NONCE_PLACEHOLDER);
  });

  it("leaves a non-HTML file's bytes alone", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]);
    origin.mockImplementation(async () => new Response(bytes, { headers: { "content-type": "image/png" } }));
    const ctx = createExecutionContext();
    const response = await worker.fetch(visit("/logo.png") as Request<unknown, IncomingRequestCfProperties>, env, ctx);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    await waitOnExecutionContext(ctx);
  });
});

describe("pass-through and switches (contract §1, §8)", () => {
  it("forwards a pass-through request unchanged", async () => {
    const request = visit("/confirm?t=abc");
    await serve(request);
    expect(origin).toHaveBeenCalledTimes(1);
    expect(origin.mock.calls[0]![0]).toBe(request);
  });

  it("MODE=passthrough forwards every request unchanged", async () => {
    const request = visit();
    const { response } = await serve(request, { MODE: "passthrough" });
    expect(origin.mock.calls[0]![0]).toBe(request);
    expect(response.headers.get("x-trefle-edge-served")).toBeNull();
  });

  it("ORIGIN_OVERRIDE (local wrangler dev) sends cached-page and pass-through requests there, with the visitor's host", async () => {
    await serve(visit("/offre?x=1"), { ORIGIN_OVERRIDE: "http://localhost:3001" });
    const [url, init] = origin.mock.calls[0]! as [URL, RequestInit];
    expect(String(url)).toBe("http://localhost:3001/offre");
    expect(new Headers(init.headers).get("x-forwarded-host")).toBe("site-a.example");

    await serve(visit("/confirm?t=abc"), { ORIGIN_OVERRIDE: "http://localhost:3001" });
    const forwarded = origin.mock.calls[1]![0] as Request;
    expect(forwarded.url).toBe("http://localhost:3001/confirm?t=abc");
    expect(forwarded.headers.get("x-forwarded-host")).toBe("site-a.example");
    expect(forwarded.headers.get("cookie")).toBe("tf-consent=1");
  });

  it("without ORIGIN_OVERRIDE no x-forwarded-host is added", async () => {
    await serve(visit());
    const [, init] = origin.mock.calls[0]! as [URL, RequestInit];
    expect(new Headers(init.headers).get("x-forwarded-host")).toBeNull();
  });

  it("MODE=fail throws (the platform then serves the origin)", async () => {
    await expect(serve(visit(), { MODE: "fail" })).rejects.toThrow("MODE=fail");
    expect(origin).not.toHaveBeenCalled();
  });
});
