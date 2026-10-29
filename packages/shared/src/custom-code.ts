/**
 * 014-custom-code-editing — admin-only code attached to a page: the two page
 * scripts (head / end of page) and the « Code personnalisé » blocks. The CMS
 * stores it (admin-only field access), the renderer emits it; both use these
 * names so they can't drift.
 *
 * This code never goes through the page-markup sanitizer (html-allowlist.ts):
 * it is trusted admin input by construction, and is only ever emitted with
 * the per-request CSP nonce (research R1/R2).
 */

/** `data-block` value of a code-block placeholder in the page HTML. */
export const CUSTOM_CODE_MARKER = "custom-code";
/** Attribute linking a placeholder to its `customCode.blocks[].codeId` row. */
export const CODE_ID_ATTR = "data-code-id";

/** « Nécessite le consentement cookies » (default) or « Essentiel ». */
export const CONSENT_VALUES = ["consent", "essential"] as const;
export type Consent = (typeof CONSENT_VALUES)[number];

/** FR-021 — per snippet / per code block. */
export const CUSTOM_CODE_MAX_LENGTH = 50_000;

const SCRIPT_OPEN_TAG_RE = /<script(?=[\s>/])[^>]*>/gi;
const NONCE_ATTR_RE = /\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Gives every `<script …>` opening tag in an admin snippet the request's CSP
 * nonce, replacing any `nonce` pasted with it (a copied vendor snippet may
 * carry a stale one). Nothing else in the snippet changes, so vendor code
 * runs byte for byte as pasted. Not a sanitizer: never use on editor input.
 */
export function withNonce(snippet: string, nonce: string): string {
  const safe = nonce.replace(/[^A-Za-z0-9+/=_-]/g, "");
  return snippet.replace(SCRIPT_OPEN_TAG_RE, (tag) => {
    const bare = tag.replace(NONCE_ATTR_RE, "");
    return `<script nonce="${safe}"${bare.slice("<script".length)}`;
  });
}

const CODE_ID_RE = new RegExp(`\\s${CODE_ID_ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi");

/** Every `data-code-id` value in page HTML, in document order (research R6). */
export function codeIdsIn(html: string): string[] {
  return [...(html ?? "").matchAll(CODE_ID_RE)].map((m) => m[1] ?? m[2] ?? "");
}
