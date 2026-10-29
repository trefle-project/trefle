import { describe, expect, it } from "vitest";

import { newSalt, signFormToken } from "../src/form-token";

/**
 * Same vector as packages/shared/tests/edge.test.ts, computed once with the
 * renderer's signFormToken (apps/web/src/lib/tokens.ts):
 * FORM_TOKEN_SECRET=test-secret, signFormToken("12", 1760000000000).
 */
const VECTOR = {
  secret: "test-secret",
  pageId: "12",
  issuedAt: 1760000000000,
  token: "MTIuMTc2MDAwMDAwMDAwMA.gS2yzBeSOKdzAB0owkJBxrfWaDBZGG6iR2AIUYOOpG4",
};

/** Port of the signature half of the renderer's verifyFormToken, on WebCrypto. */
async function signatureValid(secret: string, token: string): Promise<boolean> {
  const [bodyB64, sigB64] = token.split(".") as [string, string];
  const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, fromB64url(sigB64), fromB64url(bodyB64));
}

describe("signFormToken at the edge (research R5)", () => {
  it("matches the renderer's token for the shared vector", async () => {
    expect(await signFormToken(VECTOR.secret, VECTOR.pageId, VECTOR.issuedAt)).toBe(VECTOR.token);
  });

  it("produces a token whose signature the renderer's check accepts, and only with the right secret", async () => {
    const token = await signFormToken("s3cret", "7", Date.now());
    expect(await signatureValid("s3cret", token)).toBe(true);
    expect(await signatureValid("other", token)).toBe(false);
  });

  it("encodes <pageId>.<issuedAt>.<salt> as the body when salted", async () => {
    const token = await signFormToken("s", "42", 1234, "c2FsdA");
    expect(atob(token.split(".")[0]!)).toBe("42.1234.c2FsdA");
    expect(token.split(".")).toHaveLength(2);
  });

  it("gives two tokens for the same page and millisecond different values (SC-005)", async () => {
    const a = await signFormToken("s", "42", 1234, newSalt());
    const b = await signFormToken("s", "42", 1234, newSalt());
    expect(a).not.toBe(b);
    expect(await signatureValid("s", a)).toBe(true);
  });

  it("salt is base64url, never a dot", () => {
    for (let i = 0; i < 100; i++) expect(newSalt()).toMatch(/^[\w-]{11}$/);
  });
});
