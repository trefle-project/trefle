import { createHmac } from "node:crypto";

/**
 * T086 — sign ImgProxy URLs and rewrite `<img>` tags in GrapesJS-exported HTML
 * so published pages only ever reference **signed**, **sized** ImgProxy URLs
 * (constitution Principle V, quickstart V14).
 *
 * Server-only: reads `IMGPROXY_KEY` / `IMGPROXY_SALT` (hex). If those or
 * `ASSET_ORIGIN` are unset the rewrite is a no-op, so local pages built with
 * placeholder images keep working untouched.
 *
 *   ASSET_ORIGIN   public base URL of the object store (e.g. the S3/Garage
 *                  bucket URL) — only `<img src>` under this prefix is rewritten
 *   ASSET_S3_BUCKET  bucket name for the `s3://` source ImgProxy is allowed to read
 */
const urlSafeB64 = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

export interface ImgproxyOptions {
  width?: number;
  height?: number;
  resizingType?: "fit" | "fill" | "auto";
  gravity?: string;
  extension?: string;
}

export function signImgproxyUrl(source: string, opts: ImgproxyOptions = {}): string {
  const base = process.env.IMGPROXY_URL ?? "http://localhost:8080";
  const key = process.env.IMGPROXY_KEY;
  const salt = process.env.IMGPROXY_SALT;
  if (!key || !salt) throw new Error("IMGPROXY_KEY / IMGPROXY_SALT are required to sign URLs");

  const { width = 0, height = 0, resizingType = "fit", gravity = "ce", extension } = opts;
  const processing = `rs:${resizingType}:${width}:${height}/g:${gravity}`;
  const path = `/${processing}/${urlSafeB64(source)}${extension ? `.${extension}` : ""}`;

  const hmac = createHmac("sha256", Buffer.from(key, "hex"));
  hmac.update(Buffer.from(salt, "hex"));
  hmac.update(path);
  return `${base}/${urlSafeB64(hmac.digest())}${path}`;
}

/** Whether the renderer is configured to route images through ImgProxy. */
export function imgproxyEnabled(): boolean {
  return Boolean(process.env.IMGPROXY_KEY && process.env.IMGPROXY_SALT && process.env.ASSET_ORIGIN);
}

/**
 * 017-edge-protection (contracts/media-aliases.md) — old object key → the
 * media item's current key. A replaced file's old object is deleted, so every
 * rewrite maps the key through this before signing or linking.
 */
export type MediaAliases = Record<string, string>;

const currentKey = (key: string, aliases: MediaAliases): string =>
  Object.hasOwn(aliases, key) ? (aliases[key] ?? key) : key;

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_RE = /\ssrc=["']([^"']+)["']/i;
const WIDTH_ATTR_RE = /\s(?:data-w|width)=["']?(\d{2,4})["']?/i;

/**
 * Rewrite every `<img src>` that points at `ASSET_ORIGIN` to a signed ImgProxy
 * URL sized to the tag's `width` / `data-w` (default 1280w). Anything else
 * (placeholders, data URIs, remote images) is left as-is.
 */
export function rewriteImageTags(html: string, defaultWidth = 1280, aliases: MediaAliases = {}): string {
  if (!html || !imgproxyEnabled()) return html;
  const origin = process.env.ASSET_ORIGIN!.replace(/\/+$/, "");
  const bucket = process.env.ASSET_S3_BUCKET ?? process.env.S3_BUCKET ?? "trefle-assets";

  return html.replace(IMG_TAG_RE, (tag) => {
    const src = SRC_RE.exec(tag)?.[1];
    if (!src || !src.startsWith(`${origin}/`)) return tag;
    const key = currentKey(src.slice(origin.length + 1).split(/[?#]/)[0] ?? "", aliases);
    const width = Number(WIDTH_ATTR_RE.exec(tag)?.[1]) || defaultWidth;
    let signed: string;
    try {
      signed = signImgproxyUrl(`s3://${bucket}/${key}`, { width, resizingType: "fit" });
    } catch {
      return tag;
    }
    return tag.replace(SRC_RE, ` src="${signed}"`);
  });
}

// `url(...)` in CSS or in a `style` attribute: bare, single-, double-quoted,
// or HTML-escaped double quotes (how a sanitised `style` attribute carries them).
const CSS_URL_RE = /url\(\s*(&quot;|["']?)([^"')&]+?)\1\s*\)/gi;

/**
 * 012-url-page-import (research R9) — the same rewrite for background images:
 * every `url(...)` pointing at `ASSET_ORIGIN`, in page CSS or inline `style`
 * attributes, becomes a signed ImgProxy URL (default 1920w, a full-width
 * band). Section blocks carry Media background images this way. Same no-op
 * rules as `rewriteImageTags`.
 */
export function rewriteBackgroundUrls(text: string, width = 1920, aliases: MediaAliases = {}): string {
  if (!text || !imgproxyEnabled()) return text;
  const origin = process.env.ASSET_ORIGIN!.replace(/\/+$/, "");
  const bucket = process.env.ASSET_S3_BUCKET ?? process.env.S3_BUCKET ?? "trefle-assets";

  return text.replace(CSS_URL_RE, (match, quote: string, url: string) => {
    if (!url.startsWith(`${origin}/`)) return match;
    const key = currentKey(url.slice(origin.length + 1).split(/[?#]/)[0] ?? "", aliases);
    try {
      const signed = signImgproxyUrl(`s3://${bucket}/${key}`, { width, resizingType: "fit" });
      return `url(${quote}${signed}${quote})`;
    } catch {
      return match;
    }
  });
}

const A_HREF_RE = /(<a\b[^>]*?\shref=)(["'])([^"']+)\2/gi;

/**
 * 017-edge-protection (contracts/media-aliases.md) — links to stored files
 * (e.g. a PDF) are not images, so they stay on the asset host; only their key
 * follows a replacement. Needs `ASSET_ORIGIN` only, not ImgProxy.
 */
export function rewriteAssetLinks(html: string, aliases: MediaAliases = {}): string {
  const raw = process.env.ASSET_ORIGIN;
  if (!html || !raw || Object.keys(aliases).length === 0) return html;
  const origin = raw.replace(/\/+$/, "");
  return html.replace(A_HREF_RE, (match, start: string, quote: string, href: string) => {
    if (!href.startsWith(`${origin}/`)) return match;
    const rest = href.slice(origin.length + 1);
    const cut = rest.search(/[?#]/);
    const key = cut === -1 ? rest : rest.slice(0, cut);
    const tail = cut === -1 ? "" : rest.slice(cut);
    const next = currentKey(key, aliases);
    return next === key ? match : `${start}${quote}${origin}/${next}${tail}${quote}`;
  });
}
