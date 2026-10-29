import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rewriteBackgroundUrls } from "../src/lib/imgproxy";

const ORIGIN = "https://assets.example.test";

describe("rewriteBackgroundUrls (012, R9)", () => {
  beforeEach(() => {
    process.env.IMGPROXY_URL = "http://imgproxy.localhost:8080";
    process.env.IMGPROXY_KEY = "6465616462656566";
    process.env.IMGPROXY_SALT = "cafef00d";
    process.env.ASSET_ORIGIN = ORIGIN;
  });
  afterEach(() => {
    delete process.env.IMGPROXY_KEY;
    delete process.env.IMGPROXY_SALT;
    delete process.env.ASSET_ORIGIN;
  });

  const signed = /url\((["']?|&quot;)http:\/\/imgproxy\.localhost:8080\/[A-Za-z0-9_-]+\/rs:fit:1920:0\/g:ce\/[A-Za-z0-9_-]+\1\)/;

  it("rewrites asset-origin url() in page CSS, keeping the quote style", () => {
    for (const q of ["", "'", '"']) {
      const out = rewriteBackgroundUrls(`#i1{background-image:url(${q}${ORIGIN}/hero.webp${q});}`);
      expect(out).toMatch(signed);
      expect(out).not.toContain(`${ORIGIN}/hero.webp`);
    }
  });

  it("rewrites the HTML-escaped form found in a sanitised style attribute", () => {
    const out = rewriteBackgroundUrls(`<section style="background-image:url(&quot;${ORIGIN}/a.webp&quot;)">`);
    expect(out).toMatch(signed);
  });

  it("rewrites url() inside a media query too", () => {
    const out = rewriteBackgroundUrls(`@media (max-width: 480px){#i1{background:url(${ORIGIN}/m.webp)}}`);
    expect(out).toMatch(signed);
  });

  it("leaves other origins, data URIs and a disabled proxy untouched", () => {
    const css = "a{background:url(https://elsewhere.test/x.png)}b{background:url(data:image/png;base64,AAA)}";
    expect(rewriteBackgroundUrls(css)).toBe(css);
    delete process.env.IMGPROXY_KEY;
    const own = `a{background:url(${ORIGIN}/x.png)}`;
    expect(rewriteBackgroundUrls(own)).toBe(own);
  });

  it("017 — maps a replaced key to the current one, bare, quoted and &quot;", () => {
    const aliases = { "hero.webp": "hero-9c2e11d0.webp" };
    for (const q of ["", "'", '"', "&quot;"]) {
      expect(rewriteBackgroundUrls(`a{background:url(${q}${ORIGIN}/hero.webp${q})}`, 1920, aliases)).toBe(
        rewriteBackgroundUrls(`a{background:url(${q}${ORIGIN}/hero-9c2e11d0.webp${q})}`),
      );
    }
    const css = `a{background:url(${ORIGIN}/x.png)}`;
    expect(rewriteBackgroundUrls(css, 1920, {})).toBe(rewriteBackgroundUrls(css));
  });
});
