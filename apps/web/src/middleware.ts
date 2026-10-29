import { NextResponse, type NextRequest } from "next/server";
import {
  AB_MARKER_HEADER,
  EDGE_HEADER,
  EDGE_HTML_TAG,
  EDGE_RENDER_HEADER,
  NONCE_PLACEHOLDER,
  assignVariant,
  encodeAbMarker,
} from "@trefle/shared";

import { isEdgeRequest } from "./lib/edge-mode";
import { getActiveDomainByHost, getRunningTestFor } from "./lib/payload-client";

/** Same normalisation as `lib/domains.ts`'s `requestHostname()` — duplicated
 * here because middleware gets the request directly, not via `next/headers`
 * (which only works in the App Router rendering context, not middleware). */
function hostnameFrom(request: NextRequest): string {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return raw.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * 008-ab-testing, research.md §1, contracts/bucketing-and-caching.md — for a
 * path with a running test, rewrite (never redirect — FR-006) to the
 * id-keyed `ab-variant/[pageId]` route, which reads only `params.pageId` and stays
 * ordinarily ISR-cacheable. Every step here — the domain/running-test lookup
 * and the bucket computation — is cheap and local/cached; any failure falls
 * through to the ordinary, untouched request (FR-016). Skips `/ab-variant/*` and
 * `/api/*` outright to avoid rewriting the rewrite target or a non-page
 * request.
 */
type AbDecision = { rewrittenPathname: string };

async function maybeBucketForActiveTest(request: NextRequest): Promise<AbDecision | null> {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/ab-variant/") || pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return null;

  try {
    const host = hostnameFrom(request);
    if (!host) return null;
    const domain = await getActiveDomainByHost(host);
    if (!domain) return null;

    const test = await getRunningTestFor(domain.id, pathname);
    if (!test) return null;
    // 018-ab-significance, research R15 (2026-10-20) — cookieless: the
    // version is drawn for every view and nothing is read from or written to
    // the visitor's device (008's per-visitor stickiness is withdrawn). In
    // production this path serves only while the edge Worker is cut (020).
    const assigned = assignVariant(crypto.randomUUID(), test.experimentKey, test.variantIds);
    return { rewrittenPathname: `/ab-variant/${assigned}` };
  } catch {
    return null; // FR-016 — any failure here serves the ordinary, unrewritten request.
  }
}

/**
 * 020-edge-html-cache, contracts/origin-edge-mode.md — in edge mode the
 * renderer never buckets: a path with a running test answers an empty 200
 * carrying the test as a marker, and the Worker picks the variant. The same
 * lookup gives the `Cache-Tag` the edge cache purges by. Any failure counts as
 * "no domain, no test" (the page then carries only `html`, purged by
 * everything).
 */
type EdgeLookup = { domainId: string | null; marker: string | null };

async function edgeLookup(request: NextRequest): Promise<EdgeLookup> {
  const { pathname } = request.nextUrl;
  try {
    const host = hostnameFrom(request);
    const domain = host ? await getActiveDomainByHost(host) : null;
    if (!domain) return { domainId: null, marker: null };
    const domainId = String(domain.id);
    if (pathname.startsWith("/ab-variant/") || pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
      return { domainId, marker: null };
    }
    const test = await getRunningTestFor(domain.id, pathname);
    return { domainId, marker: test ? encodeAbMarker({ ...test, domainId }) : null };
  } catch {
    return { domainId: null, marker: null };
  }
}

/**
 * Per-request Content-Security-Policy with a nonce (002-security-hardening).
 *
 * The renderer emits editor-authored HTML via `dangerouslySetInnerHTML`, so a
 * strict `script-src` is the real control: nonce + `strict-dynamic`, no
 * `'unsafe-inline'`. Inline `<script>` an editor pastes into a block is blocked
 * by design. Next automatically applies this nonce to its own bootstrap
 * scripts because the CSP is set on the *request* header.
 *
 * `style-src 'unsafe-inline'` stays — GrapesJS emits a `<style>` block and
 * inline `style=` attributes on every page. `img-src` is permissive (images
 * aren't a script vector; ImgProxy sits on an arbitrary host, http in dev).
 *
 * 014-custom-code-editing (research R3) — admins add third-party code (ad
 * pixels, analytics, chat and booking widgets, video embeds). `script-src`
 * is unchanged: those snippets run only because the renderer gives each of
 * their `<script>`s this nonce, and `'strict-dynamic'` lets them load their
 * own follow-on scripts. What they need beyond that is opened to any https
 * origin: `connect-src` (beacons, XHR), `frame-src` (widgets, embeds),
 * `media-src` (video/audio), `style-src` (widget stylesheets). Page markup
 * still can't run code: it is sanitised and never carries the nonce.
 *
 * 015-penpot-site-import (domain fonts) — `font-src` also names the asset
 * host (`ASSET_ORIGIN`), where a domain's font files are served: plain http
 * in the local and CI stacks, which `https:` alone would block.
 */
/** The asset host's origin for `font-src` (only when it isn't already covered by `https:`). */
function assetFontOrigin(): string {
  try {
    const origin = new URL(process.env.ASSET_ORIGIN ?? "").origin;
    return origin.startsWith("http://") ? ` ${origin}` : "";
  } catch {
    return "";
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // 020 — edge mode: a placeholder the Worker replaces per visit, so one
  // cached copy serves everyone with a fresh nonce each time.
  const edge = isEdgeRequest(request.headers);
  const nonce = edge ? NONCE_PLACEHOLDER : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  // Only upgrade sub-resources / form posts to https when the request itself
  // arrived over https (behind Caddy). On the plain-http local & e2e stack it
  // would rewrite a form POST to a port with no TLS listener and hang.
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline' https:`,
    `img-src 'self' data: https: http:`,
    `font-src 'self' data: https:${assetFontOrigin()}`,
    `connect-src 'self' https:`,
    `frame-src 'self' https:`,
    `media-src 'self' https: blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads this off the request to nonce its own <script> tags.
  requestHeaders.set("content-security-policy", csp);
  // The secret never reaches the render; the render flag is only ever set
  // here, so a client cannot switch a render to edge mode by sending it.
  requestHeaders.delete(EDGE_HEADER);
  if (edge) requestHeaders.set(EDGE_RENDER_HEADER, "1");
  else requestHeaders.delete(EDGE_RENDER_HEADER);

  if (edge) {
    const { domainId, marker } = await edgeLookup(request);
    const cacheTag = domainId ? `${EDGE_HTML_TAG},domain:${domainId}` : EDGE_HTML_TAG;
    // No rendering: the Worker reads the marker, picks the variant and fetches
    // /ab-variant/<id> itself. Never a cookie in edge mode.
    if (marker) {
      return new NextResponse(null, { status: 200, headers: { [AB_MARKER_HEADER]: marker, "cache-tag": cacheTag } });
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", csp);
    response.headers.set("cache-tag", cacheTag);
    return response;
  }

  const abDecision = await maybeBucketForActiveTest(request);
  let response: NextResponse;
  if (abDecision) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = abDecision.rewrittenPathname;
    response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("content-security-policy", csp);
  // FR-006, known residual gap (docs and Playwright coverage updated to
  // match, not to hide it): Next stamps its own `x-middleware-rewrite`
  // response header with the rewritten path for a bucketed request — found
  // live that this is NOT cosmetic, it is (or at least behaves as) the
  // signal `next start`'s own dispatcher uses to actually fetch/render the
  // rewrite target; deleting it here produced a 200 with correct status,
  // cookies, and every *other* header, but a permanently empty body — the
  // rewritten route's render was silently never invoked. Left in place:
  // the address bar, canonical link, and page content never reveal the
  // variant id (verified), but a visitor with browser dev tools open and
  // the specific knowledge to look at this one response header could read
  // it off there. No known way to scrub it without breaking the rewrite
  // itself in this Next.js version.
  return response;
}

export const config = {
  // Everything except Next's immutable assets and the favicon.
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)$).*)",
    },
  ],
};
