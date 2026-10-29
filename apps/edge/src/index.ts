/**
 * 020-edge-html-cache — the edge Worker (contracts/edge-worker.md).
 *
 * Pages are fetched from the origin in edge mode (secret header) and kept in
 * the edge cache with placeholders; every response gets this visit's nonce
 * and form token. Everything else is passed through unchanged. Any exception
 * before the response starts falls back to the origin (passThroughOnException),
 * which then serves the request in legacy mode, as before the Worker.
 */
import { AB_MARKER_HEADER, EDGE_HEADER, NONCE_PLACEHOLDER } from "@trefle/shared";

import { type AbDecision, decideVariant } from "./ab";
import { classify } from "./classify";
import { type Exposure, consumeExposures, maybeSendExposure } from "./exposures";
import { newSalt, signFormToken } from "./form-token";
import { newNonce, substitute } from "./substitute";
import { recordView, runViewCron } from "./views";

export interface Env {
  PAGE_VIEWS: AnalyticsEngineDataset;
  EXPOSURES_QUEUE: Queue<Exposure>;
  EDGE_SECRET: string;
  FORM_TOKEN_SECRET: string;
  CF_ANALYTICS_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ORIGIN_INGEST_URL: string;
  /** `on` | `passthrough` | `fail` (contracts/edge-worker.md §8). */
  MODE: string;
  /** `off` | `on` — exposure recording, off until 018 ships. */
  EXPOSURES: string;
  /** Local `wrangler dev` only (e2e `edge` project): where the origin really is. Never set in production. */
  ORIGIN_OVERRIDE?: string;
}

const DAY_S = 86_400;
/** Visitor headers the origin still sees; cookies never reach it with the secret. */
const FORWARDED_HEADERS = ["accept-language", "user-agent"];
/** Origin headers a visitor never sees. */
const INTERNAL_HEADERS = [AB_MARKER_HEADER, "cache-tag", "x-middleware-rewrite", "content-length", "etag", "last-modified"];

/**
 * Contract §8, `ORIGIN_OVERRIDE` — in local `wrangler dev` the origin is not
 * behind the request's host: subrequests go to the override address, and the
 * visitor's host travels in `X-Forwarded-Host`, which the renderer reads first.
 */
function originUrl(url: URL, env: Env): { url: URL; forwardedHost?: string } {
  if (!env.ORIGIN_OVERRIDE) return { url };
  const target = new URL(url.pathname + url.search, env.ORIGIN_OVERRIDE);
  return { url: target, forwardedHost: url.host };
}

/** A request the Worker does not handle, as the origin should see it. */
function passThrough(request: Request, env: Env): Promise<Response> {
  const { url, forwardedHost } = originUrl(new URL(request.url), env);
  if (!forwardedHost) return fetch(request);
  const forwarded = new Request(url, request);
  forwarded.headers.set("x-forwarded-host", forwardedHost);
  return fetch(forwarded);
}

/** Contract §2 steps 2–3: the page in edge mode, from the edge cache when it has it. */
function fetchFromCache(request: Request, env: Env, path?: string): Promise<Response> {
  const page = new URL(request.url);
  page.search = "";
  if (path) page.pathname = path;
  const { url, forwardedHost } = originUrl(page, env);
  const headers = new Headers({ [EDGE_HEADER]: env.EDGE_SECRET });
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return fetch(url, {
    method: "GET",
    headers,
    // A redirect is answered to the visitor as is (and cached as such), never followed here.
    redirect: "manual",
    cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": DAY_S, "404": DAY_S, "500-599": 0 } },
  });
}

async function servePage(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let origin = await fetchFromCache(request, env);
  // Contract §3: a path under test answers a marker; the variant is picked
  // here and its page fetched from the cache like any other (one copy per
  // variant, at /ab-variant/<id>). The visitor's address never changes.
  // 018 R15 — the form token's random salt is drawn first: it is the view
  // number the version is drawn with and the exposure is numbered with.
  const salt = newSalt();
  let decision: AbDecision | null = null;
  if (origin.headers.has(AB_MARKER_HEADER)) {
    decision = decideVariant(origin.headers.get(AB_MARKER_HEADER), salt);
    if (!decision) return passThrough(request, env);
    await origin.body?.cancel();
    origin = await fetchFromCache(request, env, `/ab-variant/${decision.variantId}`);
    if (origin.headers.has(AB_MARKER_HEADER)) return passThrough(request, env);
  }

  const nonce = newNonce();
  const headers = new Headers(origin.headers);
  for (const name of INTERNAL_HEADERS) headers.delete(name);
  for (const name of [...headers.keys()]) if (name.startsWith("x-nextjs-")) headers.delete(name);
  const csp = headers.get("content-security-policy");
  if (csp) headers.set("content-security-policy", csp.replaceAll(NONCE_PLACEHOLDER, nonce));
  headers.set("cache-control", "private, no-store");
  headers.set("x-trefle-edge-served", "1");
  if (decision && request.method === "GET") maybeSendExposure(env, ctx, request, decision, salt);

  // Only HTML carries placeholders; anything else (a file from public/) keeps its bytes.
  const isHtml = (headers.get("content-type") ?? "").startsWith("text/html");
  let body: ReadableStream<Uint8Array> | null = origin.body;
  if (body && isHtml) {
    const issuedAt = Date.now();
    const substituted = substitute(body, {
      nonce,
      tokenFor: (pageId) => signFormToken(env.FORM_TOKEN_SECRET, pageId, issuedAt, salt),
    });
    body = substituted.stream;
    // Contract §5: a page actually served (200, GET) counts once its id has
    // streamed past; never awaited before the response, failures ignored.
    if (origin.status === 200 && request.method === "GET") {
      const host = new URL(request.url).hostname;
      ctx.waitUntil(substituted.pageId.then((id) => id && recordView(env, id, host)).catch(() => {}));
    }
  }
  if (request.method === "HEAD") {
    await body?.cancel();
    body = null;
  }
  return new Response(body, { status: origin.status, statusText: origin.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    if (env.MODE === "passthrough" || classify(request) === "pass") return passThrough(request, env);
    ctx.passThroughOnException();
    // Validation of the fallback only (quickstart V11).
    if (env.MODE === "fail") throw new Error("trefle-edge: MODE=fail");
    return servePage(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runViewCron(env, controller.scheduledTime));
  },

  async queue(batch, env) {
    await consumeExposures(batch, env);
  },
} satisfies ExportedHandler<Env, Exposure>;
