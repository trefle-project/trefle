import { LEGACY_PUBLIC_PATHS, LEGAL_NOTICE_PAGE_PATH, MEASUREMENT_PAGE_PATH, PRIVACY_PAGE_PATH } from "@trefle/shared";

/**
 * 020-edge-html-cache, contracts/edge-worker.md §1 — which requests the Worker
 * serves from the edge cache ("page") and which go to the origin untouched
 * ("pass"): anything but GET/HEAD, Next's client-navigation requests (their
 * RSC payloads are per request), and the pages that carry per-visitor
 * content.
 */
const PASS_HEADERS = ["rsc", "next-router-state-tree", "next-router-prefetch"];
// 018 — the measurement page; 021 — the legal pages, whose language is in the
// query string (cached pages are fetched without it); 023 — their French
// paths of before, which redirect with the query kept.
const PASS_PATHS = new Set([
  "/confirm",
  "/confirmation",
  "/unsubscribe",
  "/form-retry",
  MEASUREMENT_PAGE_PATH,
  PRIVACY_PAGE_PATH,
  LEGAL_NOTICE_PAGE_PATH,
  ...Object.keys(LEGACY_PUBLIC_PATHS),
]);

export function classify(request: Request): "pass" | "page" {
  if (request.method !== "GET" && request.method !== "HEAD") return "pass";
  if (PASS_HEADERS.some((name) => request.headers.has(name))) return "pass";
  const url = new URL(request.url);
  if (url.searchParams.has("_rsc")) return "pass";
  if (url.pathname === "/preview" || url.pathname.startsWith("/preview/")) return "pass";
  if (PASS_PATHS.has(url.pathname)) return "pass";
  return "page";
}
