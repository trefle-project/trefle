import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rewriteAssetLinks } from "../src/lib/imgproxy";

/**
 * 017-edge-protection (T035, contracts/media-aliases.md) — links to stored
 * files keep the asset host and follow a file replacement.
 */
const ORIGIN = "https://assets.example.test";
const aliases = { "brochure.pdf": "brochure-1a2b3c4d.pdf" };

describe("rewriteAssetLinks", () => {
  beforeEach(() => {
    process.env.ASSET_ORIGIN = ORIGIN;
  });
  afterEach(() => {
    delete process.env.ASSET_ORIGIN;
  });

  it("rewrites an aliased <a href> under ASSET_ORIGIN, keeping the host, query and quotes", () => {
    expect(rewriteAssetLinks(`<a class="btn" href="${ORIGIN}/brochure.pdf">PDF</a>`, aliases)).toBe(
      `<a class="btn" href="${ORIGIN}/brochure-1a2b3c4d.pdf">PDF</a>`,
    );
    expect(rewriteAssetLinks(`<a href='${ORIGIN}/brochure.pdf?dl=1#p2'>PDF</a>`, aliases)).toBe(
      `<a href='${ORIGIN}/brochure-1a2b3c4d.pdf?dl=1#p2'>PDF</a>`,
    );
  });

  it("leaves other links, unaliased keys and an empty map untouched", () => {
    const html = `<a href="https://elsewhere.test/brochure.pdf">x</a><a href="${ORIGIN}/other.pdf">y</a>`;
    expect(rewriteAssetLinks(html, aliases)).toBe(html);
    const own = `<a href="${ORIGIN}/brochure.pdf">x</a>`;
    expect(rewriteAssetLinks(own, {})).toBe(own);
  });

  it("is a no-op without ASSET_ORIGIN", () => {
    delete process.env.ASSET_ORIGIN;
    const own = `<a href="${ORIGIN}/brochure.pdf">x</a>`;
    expect(rewriteAssetLinks(own, aliases)).toBe(own);
  });
});
