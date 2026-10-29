import { b64url, formTokenBody } from "@trefle/shared";

/**
 * 020-edge-html-cache, research R5 — the lead-form token, signed per visit at
 * the edge. Same format as the renderer's `signFormToken`
 * (apps/web/src/lib/tokens.ts), which keeps verifying it unchanged:
 * `b64url(body) + "." + b64url(HMAC-SHA256(secret, body))`, where body is
 * `<pageId>.<issuedAt>.<salt>`: the salt (random per response, SC-005) keeps
 * two visits in the same millisecond from sharing a token.
 */
const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(secret, key);
  }
  return key;
}

export async function signFormToken(secret: string, pageId: string, issuedAt: number, salt?: string): Promise<string> {
  const body = formTokenBody(pageId, issuedAt, salt);
  const sig = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
  return `${b64url(encoder.encode(body))}.${b64url(new Uint8Array(sig))}`;
}

/** Per-response salt: 8 random bytes, base64url (never contains a dot). */
export const newSalt = () => b64url(crypto.getRandomValues(new Uint8Array(8)));
