/**
 * 020-edge-html-cache — what the renderer (`apps/web`) and the edge Worker
 * (`apps/edge`) must agree on: header names, the placeholders the renderer
 * writes in edge mode and the Worker replaces per visit, the A/B marker, the
 * cache-tag mapping for purges, and the form-token format. No Node APIs: the
 * Worker imports this too. Contracts: origin-edge-mode.md, edge-worker.md,
 * purge.md.
 */

// --- Headers -----------------------------------------------------------------

/** Worker → origin: carries `EDGE_SECRET`; its presence switches edge mode on. */
export const EDGE_HEADER = "x-trefle-edge";
/** Middleware → render, internal: `1` in edge mode, always reset otherwise. */
export const EDGE_RENDER_HEADER = "x-trefle-edge-render";
/** Origin → Worker: the running A/B test on this path (never reaches a visitor). */
export const AB_MARKER_HEADER = "x-trefle-ab";

// --- Placeholders --------------------------------------------------------------

/** Stands for the CSP nonce in a cached page; as long as the Worker's nonce (32 hex chars). */
export const NONCE_PLACEHOLDER = "TFEDGENONCE000000000000000000000";

/** Stands for the lead-form token of page `pageId` in a cached page. */
export const formTokenPlaceholder = (pageId: string) => `TFEDGEFT${pageId}X`;
export const FORM_TOKEN_PLACEHOLDER_RE = /TFEDGEFT(\d+)X/g;

// --- Form token (same format as apps/web/src/lib/tokens.ts) ------------------

/**
 * The signed part of a form token: `<pageId>.<issuedAt>`, plus `.<salt>` when
 * signed at the edge — two visits in the same millisecond must not get the
 * same token (SC-005). The renderer's `verifyFormToken` reads the first two
 * segments and checks the signature over the whole body, so it accepts both.
 */
export const formTokenBody = (pageId: string, issuedAt: number, salt?: string) =>
  salt ? `${pageId}.${issuedAt}.${salt}` : `${pageId}.${issuedAt}`;

/** Base64url without padding, as `tokens.ts` writes it. */
export function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// --- A/B ---------------------------------------------------------------------

/** 007-gtm-tagging — the cookie banner's choice, `accepted|<ISO date>` or `rejected|<ISO date>`, URL-encoded. */
export const CONSENT_COOKIE_NAME = "tf_consent";

/** 018 — the page describing the A/B tests and their measurement, served on every domain. */
export const MEASUREMENT_PAGE_PATH = "/audience-measurement";

/** 021 — the domain's privacy policy and legal notice, served on every domain. */
export const PRIVACY_PAGE_PATH = "/privacy";
export const LEGAL_NOTICE_PAGE_PATH = "/legal-notice";

/**
 * 023-admin-i18n (US7, contracts/public-paths.md) — the French paths these
 * pages had until 023: each answers with one permanent redirect to its new
 * path, and stays reserved for editor pages.
 */
export const LEGACY_PUBLIC_PATHS = {
  "/confidentialite": PRIVACY_PAGE_PATH,
  "/mentions-legales": LEGAL_NOTICE_PAGE_PATH,
  "/mesure-audience": MEASUREMENT_PAGE_PATH,
} as const;

/**
 * 018-ab-significance (research R15) — a view number: the random salt the
 * edge Worker draws for every response (8 bytes, base64url) and signs into the
 * form token; exposures and lead attributions are keyed by it.
 */
export const isViewNumber = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);

export interface AbMarker {
  experimentKey: string;
  /** Control page id first, then the variants. */
  variantIds: string[];
  domainId: string;
}

/** `<experimentKey>;<id>,<id>…;<domainId>`. */
export const encodeAbMarker = ({ experimentKey, variantIds, domainId }: AbMarker) =>
  `${experimentKey};${variantIds.join(",")};${domainId}`;

/** Null when the value is not a well-formed marker. */
export function parseAbMarker(value: string | null | undefined): AbMarker | null {
  if (!value) return null;
  const parts = value.split(";");
  if (parts.length !== 3) return null;
  const [experimentKey, ids, domainId] = parts as [string, string, string];
  const variantIds = ids.split(",");
  if (!experimentKey || !domainId || variantIds.some((id) => !id)) return null;
  return { experimentKey, variantIds, domainId };
}

// --- Purge tags (contracts/purge.md) ---------------------------------------

/** Carried by every cached page, variant, marker and "not found". */
export const EDGE_HTML_TAG = "html";

/**
 * Edge tags to purge for the cache tags the CMS revalidates. `page:*` and
 * `page-list` come with `domain:<id>` from the same hook, and the experiments
 * hook sends `domain:<id>` too, so those purge nothing themselves. Anything
 * unknown purges every page: a tag added later can over-purge, never leave a
 * stale page. `html` covers everything, so it is returned alone.
 */
export function edgeTagsFor(tags: readonly string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    if (/^domain:\d+$/.test(tag)) out.add(tag);
    else if (/^page:/.test(tag) || tag === "page-list" || tag === "ab-tests" || /^ab-test:/.test(tag)) continue;
    else return [EDGE_HTML_TAG];
  }
  return [...out];
}

// --- Crawlers ------------------------------------------------------------------

/** Declared crawlers (same rule as the renderer's error reports). */
export const CRAWLER_UA_RE = /bot|crawl|spider|slurp|preview/i;
