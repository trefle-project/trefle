import { describe, expect, it } from "vitest";

import { resolveBannerCopy } from "../src/lib/banner-copy";
import type { CookieBannerTranslation } from "../src/lib/payload-client";

// 007-gtm-tagging, FR-014.

const row = (code: string, title: string): CookieBannerTranslation => ({
  language: { code },
  title,
  body: "body",
  acceptLabel: "Accepter",
  rejectLabel: "Refuser",
  revisitLabel: "Préférences",
});

describe("resolveBannerCopy", () => {
  it("returns the row matching the requested language", () => {
    const translations = [row("fr", "FR"), row("en", "EN")];
    expect(resolveBannerCopy("en", translations)?.title).toBe("EN");
  });

  it("falls back to the French row when the requested language has none", () => {
    const translations = [row("fr", "FR"), row("en", "EN")];
    expect(resolveBannerCopy("de", translations)?.title).toBe("FR");
  });

  it("returns null when even French is missing", () => {
    const translations = [row("en", "EN")];
    expect(resolveBannerCopy("de", translations)).toBeNull();
  });
});
