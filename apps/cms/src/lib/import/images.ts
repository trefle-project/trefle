import { createHash } from "node:crypto";

import type { PageExtract } from "@trefle/grapesjs-page-import/serialize";
import sharp, { type Metadata } from "sharp";

import { IMPORT_UA_TOKEN, guardedFetch } from "./url-guard";

/**
 * Imported images → ordinary Media items (012-url-page-import, research R8,
 * FR-012–FR-015).
 *
 * For every image ref the IR placed: take the largest candidate the extract
 * found, download it through the URL guard (15 MB, 20 s, `image/*` only),
 * store identical bytes once (FR-015), and normalise with `sharp` — SVG and
 * animated images rasterised (first frame), EXIF applied then stripped, at
 * most 2400 px wide, WebP from quality 82 down to 50 until ≤ 500 KB, then
 * once more at half the width. What can't be fetched or fitted is reported
 * and the serializer puts the standard placeholder instead (FR-014).
 *
 * The Media item carries the source's alt text; with none (or an empty one),
 * `alt` stays empty and the item is flagged "À décrire" (FR-013) — never the
 * file name.
 */

export type ImageFailure = { sourceUrl: string; reason: "unreachable" | "too-large" | "not-an-image" };
export type StoredImage = { url: string; alt: string; altPending: boolean };

export type NewMedia = { data: Buffer; name: string; alt: string; altPending: boolean };
export type CreateMedia = (media: NewMedia) => Promise<{ id: number; url: string }>;

export type ImagesInput = {
  /** Image refs placed by the IR, in document order. */
  refs: string[];
  extract: PageExtract;
  createMedia: CreateMedia;
  /** Called as soon as each Media item exists, so a later failure can delete it. */
  onCreated: (id: number) => void;
  signal?: AbortSignal;
  fetchImage?: (url: string, signal: AbortSignal) => Promise<Response>;
  /** Per-download limit; tests shorten it. */
  timeoutMs?: number;
  /** 013: `embedded:<n>` candidates → their `data:` URL (images inlined in a saved page). */
  embedded?: Map<string, string>;
  /** 013: resources of a saved MHTML, by URL — used instead of downloading. */
  savedResources?: Map<string, { contentType: string; data: Buffer }>;
};

export type ImagesResult = { media: Record<string, StoredImage>; failures: ImageFailure[] };

const IMPORT_IMAGES_UA = `Mozilla/5.0 (compatible; ${IMPORT_UA_TOKEN})`;

export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 20_000;
export const MAX_MEDIA_BYTES = 500 * 1024;
const MAX_WIDTH = 2400;
const QUALITIES = [82, 72, 62, 50];
const CONCURRENCY = 4;

class Failure extends Error {
  constructor(readonly reason: ImageFailure["reason"]) {
    super(reason);
  }
}

/** Bytes of `url` (http(s) through the guard, or a `data:` image), or a Failure. */
type Local = Pick<ImagesInput, "embedded" | "savedResources">;

async function download(
  candidate: string,
  signal: AbortSignal | undefined,
  fetchImage: (url: string, signal: AbortSignal) => Promise<Response>,
  timeoutMs: number,
  local: Local = {},
): Promise<Buffer> {
  // 013: images that come with a saved page are taken from it, never fetched.
  const url = candidate.startsWith("embedded:") ? local.embedded?.get(candidate) : candidate;
  if (!url) throw new Failure("unreachable");
  const part = local.savedResources?.get(url);
  if (part) {
    if (!part.contentType.startsWith("image/")) throw new Failure("not-an-image");
    if (part.data.length > MAX_DOWNLOAD_BYTES) throw new Failure("unreachable");
    return part.data;
  }
  if (url.startsWith("data:")) {
    const m = /^data:(image\/[\w.+-]+)?(;base64)?,(.*)$/s.exec(url);
    if (!m?.[1]) throw new Failure("not-an-image");
    const data = m[2] ? Buffer.from(m[3]!, "base64") : Buffer.from(decodeURIComponent(m[3]!));
    if (data.length > MAX_DOWNLOAD_BYTES) throw new Failure("unreachable");
    return data;
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetchImage(url, combined);
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Failure("unreachable");
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Failure("unreachable");
  }
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("image/")) {
    await res.body.cancel().catch(() => undefined);
    throw new Failure("not-an-image");
  }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) {
    await res.body.cancel().catch(() => undefined);
    throw new Failure("unreachable");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_DOWNLOAD_BYTES) throw new Failure("unreachable");
      chunks.push(chunk);
    }
  } catch (e) {
    if (e instanceof Failure) throw e;
    if (signal?.aborted) throw e;
    throw new Failure("unreachable");
  }
  return Buffer.concat(chunks);
}

/** WebP ≤ 500 KB, or a Failure. `displayWidth` sizes the rasterisation of vector images. */
export async function normalise(input: Buffer, displayWidth: number): Promise<Buffer> {
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new Failure("not-an-image");
  }
  // SVG: rasterise sharp at twice its displayed width instead of its nominal 72 dpi size.
  const vectorTarget = Math.min(MAX_WIDTH, Math.max(320, Math.round(displayWidth * 2)));
  const density = meta.format === "svg" && meta.width ? Math.min(2400, (72 * vectorTarget) / meta.width) : undefined;
  const encode = (width: number, quality: number) =>
    sharp(input, { density, animated: false })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  try {
    let width = MAX_WIDTH;
    for (let attempt = 0; attempt < 2; attempt++) {
      let outWidth = width;
      for (const quality of QUALITIES) {
        const { data, info } = await encode(width, quality);
        if (data.length <= MAX_MEDIA_BYTES) return data;
        outWidth = info.width;
      }
      width = Math.max(1, Math.floor(outWidth / 2));
    }
  } catch {
    throw new Failure("not-an-image");
  }
  throw new Failure("too-large");
}

/** "hero-photo" from ".../hero-photo.jpg?w=2000"; "image" when nothing usable. */
function baseName(url: string): string {
  if (url.startsWith("data:") || url.startsWith("embedded:")) return "image";
  let last = "";
  try {
    last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    /* keep default */
  }
  const stem = last.replace(/\.[a-z0-9]+$/i, "").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return (stem || "image").slice(0, 60).toLowerCase();
}

export async function importImages({
  refs,
  extract,
  createMedia,
  onCreated,
  signal,
  fetchImage = (url, s) => guardedFetch(url, { signal: s, headers: { "user-agent": IMPORT_IMAGES_UA } }),
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
  embedded,
  savedResources,
}: ImagesInput): Promise<ImagesResult> {
  const byId = new Map(extract.images.map((i) => [i.id, i]));
  const media: Record<string, StoredImage> = {};
  const failures: ImageFailure[] = [];

  // One download per distinct source address (FR-015), shared by every ref using it.
  const jobs = new Map<string, { refs: string[]; displayWidth: number; alt: string | null }>();
  for (const ref of new Set(refs)) {
    const img = byId.get(ref);
    const url = img?.candidates[0];
    if (!img || !url) continue;
    const job = jobs.get(url);
    if (job) {
      job.refs.push(ref);
      job.displayWidth = Math.max(job.displayWidth, img.box.width);
      job.alt ||= img.alt;
    } else {
      jobs.set(url, { refs: [ref], displayWidth: img.box.width, alt: img.alt });
    }
  }

  // Identical bytes behind different addresses are stored once too.
  const byHash = new Map<string, Promise<StoredImage>>();
  const store = (raw: Buffer, url: string, job: { displayWidth: number; alt: string | null }): Promise<StoredImage> => {
    const hash = createHash("sha256").update(raw).digest("hex");
    let pending = byHash.get(hash);
    if (!pending) {
      const text = job.alt?.trim() ?? "";
      pending = normalise(raw, job.displayWidth).then(async (data) => {
        signal?.throwIfAborted();
        // The content hash in the name keeps two different images with the
        // same source file name (created concurrently) from racing on
        // Payload's unique filename.
        const doc = await createMedia({ data, name: `${baseName(url)}-${hash.slice(0, 8)}.webp`, alt: text, altPending: text === "" });
        onCreated(doc.id);
        return { url: doc.url, alt: text, altPending: text === "" };
      });
      byHash.set(hash, pending);
    }
    return pending;
  };

  const queue = [...jobs.entries()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      signal?.throwIfAborted();
      const [url, job] = next;
      try {
        const raw = await download(url, signal, fetchImage, timeoutMs, { embedded, savedResources });
        const stored = await store(raw, url, job);
        for (const ref of job.refs) media[ref] = stored;
      } catch (e) {
        if (!(e instanceof Failure)) throw e;
        // 023: the panel names an embedded image in the reader's language.
        failures.push({ sourceUrl: url, reason: e.reason });
      }
    }
  };
  // Settle every worker before returning or throwing: nothing may be created after the caller cleans up.
  const settled = await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  return { media, failures };
}
