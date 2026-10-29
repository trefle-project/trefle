import { describe, expect, it } from "vitest";

import { fontFaceCss, isValidFontFamily } from "../src/fonts";

/** 015-penpot-site-import T039 — one shared `@font-face` builder (renderer + editor). */

const file = {
  family: "EB Garamond",
  weight: 400,
  style: "normal" as const,
  url: "https://assets.example/fonts/eb-garamond-400-latin.woff2",
  unicodeRange: "U+0000-00FF, U+0131, U+2000-206F",
};

describe("fontFaceCss", () => {
  it("one swap rule per file, with its unicode range", () => {
    expect(fontFaceCss([file, { ...file, style: "italic", weight: 700, unicodeRange: null }])).toBe(
      '@font-face{font-family:"EB Garamond";font-style:normal;font-weight:400;font-display:swap;src:url("https://assets.example/fonts/eb-garamond-400-latin.woff2") format("woff2");unicode-range:U+0000-00FF, U+0131, U+2000-206F;}' +
        '@font-face{font-family:"EB Garamond";font-style:italic;font-weight:700;font-display:swap;src:url("https://assets.example/fonts/eb-garamond-400-latin.woff2") format("woff2");}',
    );
  });
  it("skips anything that could break out of the rule", () => {
    expect(fontFaceCss([{ ...file, family: 'X";}body{color:red' }])).toBe("");
    expect(fontFaceCss([{ ...file, url: 'https://a/x.woff2") ; } body {' }])).toBe("");
    expect(fontFaceCss([{ ...file, url: "javascript:alert(1)" }])).toBe("");
    expect(fontFaceCss([{ ...file, weight: 450.5 }])).toBe("");
    expect(fontFaceCss([{ ...file, unicodeRange: "U+0000;}x{" }])).not.toContain("unicode-range");
    expect(fontFaceCss([])).toBe("");
  });
  it("family names", () => {
    expect(["Inter Tight", "Source Sans 3", "IBM Plex Sans"].every(isValidFontFamily)).toBe(true);
    expect(["", " Lead", "A".repeat(81), "X<y"].some(isValidFontFamily)).toBe(false);
  });
});
