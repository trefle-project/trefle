import { createHmac } from "node:crypto";

/**
 * ImgProxy signed-URL builder (T007 stub; presets/sizing finalised in T086).
 *
 * Produces `/{signature}/{processing}/{encoded-source}` against IMGPROXY_URL.
 * KEY and SALT are hex strings (see infra/.env.example).
 */
const urlSafeBase64 = (buf: Buffer | string): string =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const hexDecode = (hex: string): Buffer => Buffer.from(hex, "hex");

export interface ImgproxyOptions {
  width?: number;
  height?: number;
  resizingType?: "fit" | "fill" | "auto";
  gravity?: string;
  extension?: string;
}

export function buildImgproxyUrl(sourceUrl: string, opts: ImgproxyOptions = {}): string {
  const base = process.env.IMGPROXY_URL ?? "http://localhost:8080";
  const key = process.env.IMGPROXY_KEY;
  const salt = process.env.IMGPROXY_SALT;
  if (!key || !salt) throw new Error("IMGPROXY_KEY / IMGPROXY_SALT are required");

  const { width = 0, height = 0, resizingType = "fit", gravity = "ce", extension } = opts;
  const processing = `rs:${resizingType}:${width}:${height}/g:${gravity}`;
  const encodedSource = urlSafeBase64(sourceUrl);
  const path = `/${processing}/${encodedSource}${extension ? `.${extension}` : ""}`;

  const hmac = createHmac("sha256", hexDecode(key));
  hmac.update(hexDecode(salt));
  hmac.update(path);
  const signature = urlSafeBase64(hmac.digest());

  return `${base}/${signature}${path}`;
}
