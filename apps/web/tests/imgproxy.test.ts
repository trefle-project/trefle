import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { imgproxyEnabled, rewriteImageTags, signImgproxyUrl } from "../src/lib/imgproxy";

const KEY = "6465616462656566"; // "deadbeef" hex
const SALT = "cafef00d";

describe("signImgproxyUrl (T086)", () => {
  beforeEach(() => {
    process.env.IMGPROXY_URL = "http://imgproxy.localhost:8080";
    process.env.IMGPROXY_KEY = KEY;
    process.env.IMGPROXY_SALT = SALT;
  });
  afterEach(() => {
    delete process.env.IMGPROXY_KEY;
    delete process.env.IMGPROXY_SALT;
    delete process.env.ASSET_ORIGIN;
    delete process.env.ASSET_S3_BUCKET;
  });

  it("produces /{sig}/rs:fit:W:0/{b64src} against IMGPROXY_URL, deterministically", () => {
    const a = signImgproxyUrl("s3://trefle-assets/a.jpg", { width: 800 });
    const b = signImgproxyUrl("s3://trefle-assets/a.jpg", { width: 800 });
    expect(a).toBe(b);
    expect(a).toMatch(/^http:\/\/imgproxy\.localhost:8080\/[A-Za-z0-9_-]+\/rs:fit:800:0\/g:ce\/[A-Za-z0-9_-]+$/);
  });

  it("throws without key/salt", () => {
    delete process.env.IMGPROXY_KEY;
    expect(() => signImgproxyUrl("s3://x/y.png")).toThrow(/IMGPROXY_KEY/);
  });
});

describe("rewriteImageTags (T086)", () => {
  afterEach(() => {
    delete process.env.IMGPROXY_KEY;
    delete process.env.IMGPROXY_SALT;
    delete process.env.ASSET_ORIGIN;
  });

  it("is a no-op when ImgProxy is not configured", () => {
    const html = `<img src="http://trefle-assets.web.garage.localhost:3902/x.jpg">`;
    expect(imgproxyEnabled()).toBe(false);
    expect(rewriteImageTags(html)).toBe(html);
  });

  it("rewrites only images under ASSET_ORIGIN, sizing from width/data-w", () => {
    process.env.IMGPROXY_KEY = KEY;
    process.env.IMGPROXY_SALT = SALT;
    process.env.ASSET_ORIGIN = "http://trefle-assets.web.garage.localhost:3902";
    process.env.ASSET_S3_BUCKET = "trefle-assets";

    const html =
      `<p><img src="http://trefle-assets.web.garage.localhost:3902/hero.jpg" width="960"></p>` +
      `<img src="https://via.placeholder.com/10" alt="x">` +
      `<img src="data:image/png;base64,AAAA">`;
    const out = rewriteImageTags(html);

    expect(out).toMatch(/src="http:\/\/imgproxy\.localhost:8080\/[^"]+\/rs:fit:960:0\//);
    expect(out).toContain('src="https://via.placeholder.com/10"'); // untouched
    expect(out).toContain('src="data:image/png;base64,AAAA"'); // untouched
  });
});

describe("rewriteImageTags with media aliases (017, contracts/media-aliases.md)", () => {
  const ORIGIN = "https://assets.example.test";
  beforeEach(() => {
    process.env.IMGPROXY_URL = "http://imgproxy.localhost:8080";
    process.env.IMGPROXY_KEY = KEY;
    process.env.IMGPROXY_SALT = SALT;
    process.env.ASSET_ORIGIN = ORIGIN;
  });
  afterEach(() => {
    delete process.env.IMGPROXY_KEY;
    delete process.env.IMGPROXY_SALT;
    delete process.env.ASSET_ORIGIN;
  });

  it("signs the current key for an <img> written with a replaced key", () => {
    const aliases = { "photo.jpg": "photo-3fa1c09b.jpg" };
    expect(rewriteImageTags(`<img src="${ORIGIN}/photo.jpg">`, 1280, aliases)).toBe(
      rewriteImageTags(`<img src="${ORIGIN}/photo-3fa1c09b.jpg">`),
    );
  });

  it("leaves unaliased keys as before, and an empty map (endpoint failure) changes nothing", () => {
    const html = `<img src="${ORIGIN}/other.jpg">`;
    expect(rewriteImageTags(html, 1280, { "photo.jpg": "photo-3fa1c09b.jpg" })).toBe(rewriteImageTags(html));
    expect(rewriteImageTags(html, 1280, {})).toBe(rewriteImageTags(html));
  });

  it("ignores inherited object keys", () => {
    const html = `<img src="${ORIGIN}/constructor">`;
    expect(rewriteImageTags(html, 1280, {})).toBe(rewriteImageTags(html));
  });
});
