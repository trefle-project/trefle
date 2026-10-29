import { describe, expect, it } from "vitest";

import { CONSENT_COOKIE_NAME, parseConsentCookie, serializeConsentCookie } from "../src/lib/consent-cookie";

// 007-gtm-tagging, FR-006/FR-009, research.md §9.

describe("serializeConsentCookie", () => {
  it("sets a ~6-month Max-Age and no Domain attribute", () => {
    const cookie = serializeConsentCookie("accepted");
    expect(cookie).toContain(`${CONSENT_COOKIE_NAME}=`);
    expect(cookie).toMatch(/Max-Age=15552000/);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toMatch(/SameSite=Lax/);
  });
});

describe("parseConsentCookie", () => {
  it("round-trips a value serializeConsentCookie produced", () => {
    const setCookie = serializeConsentCookie("rejected");
    const value = setCookie.split(";")[0]!;
    const result = parseConsentCookie(value);
    expect(result?.choice).toBe("rejected");
    expect(result?.decidedAt).toBeTruthy();
  });

  it("returns null for a missing cookie header", () => {
    expect(parseConsentCookie(null)).toBeNull();
    expect(parseConsentCookie(undefined)).toBeNull();
  });

  it("returns null when the cookie isn't present among others", () => {
    expect(parseConsentCookie("a=1; b=2")).toBeNull();
  });

  it("returns null for a malformed value", () => {
    expect(parseConsentCookie(`${CONSENT_COOKIE_NAME}=garbage`)).toBeNull();
  });
});
