import { describe, expect, it } from "vitest";

import { resolveBannerLanguage } from "../src/lib/tagging-language";

// 007-gtm-tagging, research.md §3/§6.

describe("resolveBannerLanguage", () => {
  it("prefers the page's own language", () => {
    expect(resolveBannerLanguage({ pageLanguage: "en", domainDefaultLanguage: "es" })).toBe("en");
  });

  it("falls back to the domain's default when the page has none", () => {
    expect(resolveBannerLanguage({ domainDefaultLanguage: "es" })).toBe("es");
  });

  it("falls back to French when neither is available", () => {
    expect(resolveBannerLanguage({})).toBe("fr");
  });
});
