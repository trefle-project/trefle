import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LEGACY_PUBLIC_PATHS,
  LEGAL_NOTICE_PAGE_PATH,
  MEASUREMENT_PAGE_PATH,
  NONCE_PLACEHOLDER,
  PRIVACY_PAGE_PATH,
  FORM_TOKEN_PLACEHOLDER_RE,
  b64url,
  edgeTagsFor,
  encodeAbMarker,
  formTokenBody,
  formTokenPlaceholder,
  parseAbMarker,
} from "../src/index";

/**
 * Computed once with apps/web/src/lib/tokens.ts:
 * FORM_TOKEN_SECRET=test-secret, signFormToken("12", 1760000000000).
 * apps/edge/tests/form-token.test.ts checks the Worker's signer against the same values.
 */
const FORM_TOKEN_VECTOR = {
  secret: "test-secret",
  pageId: "12",
  issuedAt: 1760000000000,
  token: "MTIuMTc2MDAwMDAwMDAwMA.gS2yzBeSOKdzAB0owkJBxrfWaDBZGG6iR2AIUYOOpG4",
};

describe("edge placeholders (020)", () => {
  it("nonce placeholder is as long as the Worker's nonce", () => {
    expect(NONCE_PLACEHOLDER).toHaveLength(32);
  });

  it("form-token placeholder is found by the regex, with its page id", () => {
    const html = `<input value="${formTokenPlaceholder("42")}"><input value="${formTokenPlaceholder("7")}">`;
    expect([...html.matchAll(FORM_TOKEN_PLACEHOLDER_RE)].map((m) => m[1])).toEqual(["42", "7"]);
  });
});

describe("A/B marker (020)", () => {
  it("round-trips", () => {
    const marker = { experimentKey: "page-5-1760000000", variantIds: ["5", "9", "11"], domainId: "3" };
    expect(parseAbMarker(encodeAbMarker(marker))).toEqual(marker);
  });

  it.each([null, undefined, "", "key;5,9", "key;5,9;3;x", ";5,9;3", "key;;3", "key;5,,9;3", "key;5,9;"])(
    "rejects %j",
    (value) => {
      expect(parseAbMarker(value)).toBeNull();
    },
  );
});

describe("edgeTagsFor (contracts/purge.md)", () => {
  it.each([
    [["domain:3"], ["domain:3"]],
    [["page:5", "page-list", "domain:3"], ["domain:3"]],
    [["page:5"], []],
    [["ab-tests", "ab-test:5"], []],
    [["ab-tests", "ab-test:5", "domain:3", "domain:4", "domain:3"], ["domain:3", "domain:4"]],
    [["settings"], ["html"]],
    [["media-aliases"], ["html"]],
    [["domain:host:example.com", "domain:3"], ["html"]],
    [["domain:3", "something-new"], ["html"]],
  ])("%j → %j", (tags, expected) => {
    expect(edgeTagsFor(tags)).toEqual(expected);
  });
});

describe("form token format (020, research R5)", () => {
  it("matches the renderer's signFormToken (shared vector)", () => {
    const { secret, pageId, issuedAt, token } = FORM_TOKEN_VECTOR;
    const body = formTokenBody(pageId, issuedAt);
    const sig = new Uint8Array(createHmac("sha256", secret).update(body).digest());
    expect(`${b64url(new TextEncoder().encode(body))}.${b64url(sig)}`).toBe(token);
  });

  it("adds the salt as a third segment only when given (SC-005)", () => {
    expect(formTokenBody("12", 1760000000000)).toBe("12.1760000000000");
    expect(formTokenBody("12", 1760000000000, "c2FsdA")).toBe("12.1760000000000.c2FsdA");
  });
});

describe("public paths (023 US7)", () => {
  it("are English, and each French path of before 023 leads to its new one", () => {
    expect([PRIVACY_PAGE_PATH, LEGAL_NOTICE_PAGE_PATH, MEASUREMENT_PAGE_PATH]).toEqual(["/privacy", "/legal-notice", "/audience-measurement"]);
    expect(LEGACY_PUBLIC_PATHS).toEqual({
      "/confidentialite": "/privacy",
      "/mentions-legales": "/legal-notice",
      "/mesure-audience": "/audience-measurement",
    });
  });
});
