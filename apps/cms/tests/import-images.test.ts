import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { PageExtract } from "@trefle/grapesjs-page-import/serialize";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ImportError } from "../src/lib/import/errors";
import { MAX_MEDIA_BYTES, importImages, type NewMedia } from "../src/lib/import/images";
import { guardedAgent, guardedFetch, guardedRequest } from "../src/lib/import/url-guard";

/**
 * 012-url-page-import (T051, research R8) — imported images: normalised to
 * WebP within the Media limit, rasterised when vector or animated, failures
 * reported, identical images stored once, downloads guarded.
 */
const box = { x: 0, y: 0, width: 400, height: 300 };
const extractWith = (images: { id: string; url: string; alt?: string | null; width?: number }[]): PageExtract => ({
  url: "https://exemple.fr/",
  viewport: { width: 1440, height: 900 },
  texts: [],
  images: images.map((i) => ({ id: i.id, kind: "img", candidates: [i.url], alt: i.alt ?? null, box: { ...box, width: i.width ?? 400 } })),
  forms: [],
  unsupported: [],
  fonts: [],
});

const noise = (width: number, height: number) =>
  sharp(Buffer.from(Array.from({ length: width * height * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width, height, channels: 3 },
  });

const response = (body: BodyInit | null, type = "image/png", init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init, headers: { "content-type": type, ...(init.headers ?? {}) } });

/** Runs importImages with an in-memory Media store and a fetch serving `files` by URL. */
async function run(
  images: Parameters<typeof extractWith>[0],
  files: Record<string, (signal: AbortSignal) => Response | Promise<Response>>,
  extra: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const stored: (NewMedia & { id: number })[] = [];
  const created: number[] = [];
  const fetchImage = vi.fn(async (url: string, signal: AbortSignal) => {
    const serve = files[url];
    if (!serve) throw new Error("ENOTFOUND");
    return serve(signal);
  });
  const result = await importImages({
    refs: images.map((i) => i.id),
    extract: extractWith(images),
    fetchImage,
    createMedia: async (m) => {
      const id = 100 + stored.length;
      stored.push({ ...m, id });
      return { id, url: `/api/media/file/${m.name}` };
    },
    onCreated: (id) => created.push(id),
    ...extra,
  });
  return { result, stored, created, fetchImage };
}

describe("normalising", () => {
  it("turns a large JPEG into a WebP of at most 2400 px and 500 KB, keeping the alt", async () => {
    const jpeg = await noise(3000, 2000).jpeg({ quality: 95 }).toBuffer();
    expect(jpeg.length).toBeGreaterThan(MAX_MEDIA_BYTES);
    const { result, stored } = await run([{ id: "i1", url: "https://cdn.exemple.fr/photos/Grand%20Potager.jpg?w=3000", alt: "Un potager" }], {
      "https://cdn.exemple.fr/photos/Grand%20Potager.jpg?w=3000": () => response(jpeg, "image/jpeg"),
    });
    expect(stored).toHaveLength(1);
    const meta = await sharp(stored[0]!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(2400);
    expect(stored[0]!.data.length).toBeLessThanOrEqual(MAX_MEDIA_BYTES);
    expect(stored[0]).toMatchObject({ alt: "Un potager", altPending: false });
    expect(stored[0]!.name).toMatch(/^grand-potager-[0-9a-f]{8}\.webp$/);
    expect(result.media.i1).toEqual({ url: `/api/media/file/${stored[0]!.name}`, alt: "Un potager", altPending: false });
  }, 30_000);

  it("converts a PNG, strips its metadata, and flags an image without alt as to describe (never the file name)", async () => {
    const png = await noise(200, 100).png().withMetadata({ exif: { IFD0: { Copyright: "Secret" } } }).toBuffer();
    const { stored, result } = await run([{ id: "i1", url: "https://exemple.fr/logo-final.png", alt: null }], {
      "https://exemple.fr/logo-final.png": () => response(png),
    });
    const meta = await sharp(stored[0]!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(stored[0]).toMatchObject({ alt: "", altPending: true });
    expect(result.media.i1).toMatchObject({ alt: "", altPending: true });
  });

  it("rasterises an SVG at twice its displayed width", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#15803d"/></svg>');
    const { stored } = await run([{ id: "i1", url: "https://exemple.fr/feuilles.svg", width: 320 }], {
      "https://exemple.fr/feuilles.svg": () => response(svg, "image/svg+xml"),
    });
    const meta = await sharp(stored[0]!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(640);
  });

  it("keeps the first frame of an animated GIF", async () => {
    const frame = (c: string) => sharp({ create: { width: 30, height: 20, channels: 3, background: c } }).png().toBuffer();
    const gif = await sharp([await frame("#ff0000"), await frame("#0000ff")], { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
    const { stored } = await run([{ id: "i1", url: "https://exemple.fr/anim.gif" }], {
      "https://exemple.fr/anim.gif": () => response(gif, "image/gif"),
    });
    const out = sharp(stored[0]!.data);
    expect((await out.metadata()).pages ?? 1).toBe(1);
    const { data } = await out.raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200); // red, the first frame
  });

  it("reports an image that can't fit even at half width as too-large, and creates nothing", async () => {
    // Random noise can't be compressed: even at 1200 × 1600 px and quality 50 it stays near 1 MB.
    const huge = await noise(2400, 3200).jpeg({ quality: 60 }).toBuffer();
    expect(huge.length).toBeLessThan(15 * 1024 * 1024);
    const { result, stored } = await run([{ id: "i1", url: "https://exemple.fr/infographie.png" }], {
      "https://exemple.fr/infographie.png": () => response(huge, "image/jpeg"),
    });
    expect(stored).toHaveLength(0);
    expect(result.media.i1).toBeUndefined();
    expect(result.failures).toEqual([{ sourceUrl: "https://exemple.fr/infographie.png", reason: "too-large" }]);
  }, 60_000);
});

describe("download failures", () => {
  const png = () => sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();

  it("a non-image content type is not-an-image", async () => {
    const { result } = await run([{ id: "i1", url: "https://exemple.fr/page" }], {
      "https://exemple.fr/page": () => response("<html></html>", "text/html"),
    });
    expect(result.failures).toEqual([{ sourceUrl: "https://exemple.fr/page", reason: "not-an-image" }]);
  });

  it("bytes that aren't an image despite the header are not-an-image", async () => {
    const { result } = await run([{ id: "i1", url: "https://exemple.fr/faux.png" }], {
      "https://exemple.fr/faux.png": () => response("pas une image"),
    });
    expect(result.failures[0]!.reason).toBe("not-an-image");
  });

  it("over 15 MB (declared, or streamed without a length) is unreachable", async () => {
    const big = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(new Uint8Array(1024 * 1024));
        },
      });
    const { result } = await run(
      [
        { id: "i1", url: "https://exemple.fr/declared.png" },
        { id: "i2", url: "https://exemple.fr/streamed.png" },
      ],
      {
        "https://exemple.fr/declared.png": () => response(null, "image/png", { headers: { "content-length": String(16 * 1024 * 1024) } }),
        "https://exemple.fr/streamed.png": () => response(big()),
      },
    );
    expect(result.failures.map((f) => f.reason)).toEqual(["unreachable", "unreachable"]);
  });

  it("slower than the time limit, an HTTP error or a network error is unreachable", async () => {
    const { result } = await run(
      [
        { id: "i1", url: "https://exemple.fr/lent.png" },
        { id: "i2", url: "https://exemple.fr/404.png" },
        { id: "i3", url: "https://absent.exemple/x.png" },
      ],
      {
        "https://exemple.fr/lent.png": (signal) =>
          new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
        "https://exemple.fr/404.png": () => response("", "text/html", { status: 404 }),
      },
      { timeoutMs: 50 },
    );
    expect(result.failures.map((f) => f.reason)).toEqual(["unreachable", "unreachable", "unreachable"]);
  });

  it("a data: image is decoded without any request", async () => {
    const data = `data:image/png;base64,${(await png()).toString("base64")}`;
    const { stored, fetchImage } = await run([{ id: "i1", url: data }], {});
    expect(fetchImage).not.toHaveBeenCalled();
    expect(stored[0]!.name).toMatch(/^image-[0-9a-f]{8}\.webp$/);
  });
});

describe("images from a saved page (013)", () => {
  it("an embedded image and an MHTML part are stored without any request; a missing one fails", async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#123456" } }).png().toBuffer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    const fetchImage = vi.fn(async () => {
      throw new Error("no network");
    });
    const stored: NewMedia[] = [];
    const result = await importImages({
      refs: ["i1", "i2", "i3"],
      extract: extractWith([
        { id: "i1", url: "embedded:0" },
        { id: "i2", url: "https://exemple.fr/img/tomates.svg" },
        { id: "i3", url: "embedded:9" },
      ]),
      embedded: new Map([["embedded:0", `data:image/png;base64,${png.toString("base64")}`]]),
      savedResources: new Map([["https://exemple.fr/img/tomates.svg", { contentType: "image/svg+xml", data: svg }]]),
      fetchImage,
      createMedia: async (m) => {
        stored.push(m);
        return { id: stored.length, url: `/m/${m.name}` };
      },
      onCreated: () => undefined,
    });
    expect(fetchImage).not.toHaveBeenCalled();
    expect(Object.keys(result.media).sort()).toEqual(["i1", "i2"]);
    expect(stored.map((m) => m.name)).toEqual(expect.arrayContaining([expect.stringMatching(/^image-[0-9a-f]{8}\.webp$/), expect.stringMatching(/^tomates-/)]));
    expect(result.failures).toEqual([{ sourceUrl: "embedded:9", reason: "unreachable" }]);
  });
});

describe("stored once (FR-015)", () => {
  it("one address used by several refs is downloaded and stored once", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#0f0" } }).png().toBuffer();
    const { result, stored, fetchImage } = await run(
      [
        { id: "i1", url: "https://exemple.fr/a.png", alt: null },
        { id: "i2", url: "https://exemple.fr/a.png", alt: "Une feuille" },
      ],
      { "https://exemple.fr/a.png": () => response(png) },
    );
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.alt).toBe("Une feuille");
    expect(result.media.i1).toBe(result.media.i2);
  });

  it("two different images with the same file name get different names (no race on Payload's unique filename)", async () => {
    const a = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#f00" } }).png().toBuffer();
    const b = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#0f0" } }).png().toBuffer();
    const { stored } = await run(
      [
        { id: "i1", url: "https://exemple.fr/a/image.png" },
        { id: "i2", url: "https://cdn.exemple.fr/b/image.png" },
      ],
      { "https://exemple.fr/a/image.png": () => response(a), "https://cdn.exemple.fr/b/image.png": () => response(b) },
    );
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((m) => m.name)).size).toBe(2);
  });

  it("the same bytes behind two addresses are stored once", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#00f" } }).png().toBuffer();
    const { result, stored, created } = await run(
      [
        { id: "i1", url: "https://exemple.fr/a.png" },
        { id: "i2", url: "https://cdn.exemple.fr/copie.png" },
      ],
      { "https://exemple.fr/a.png": () => response(png), "https://cdn.exemple.fr/copie.png": () => response(png) },
    );
    expect(stored).toHaveLength(1);
    expect(created).toEqual([100]);
    expect(result.media.i1!.url).toBe(result.media.i2!.url);
  });
});

describe("cancel", () => {
  it("an aborted import stops and creates no Media", async () => {
    const controller = new AbortController();
    controller.abort("cancel");
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(
      run([{ id: "i1", url: "https://exemple.fr/a.png" }], { "https://exemple.fr/a.png": () => response(png) }, { signal: controller.signal }),
    ).rejects.toBe("cancel");
  });
});

describe("guarded downloads (research R4)", () => {
  let server: Server;
  let port = 0;
  let seenUserAgent = "";
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/to-internal") {
        res.writeHead(302, { location: `http://127.0.0.1:${port}/secret.png` });
        return res.end();
      }
      if (req.url === "/ua.png") {
        seenUserAgent = req.headers["user-agent"] ?? "";
        res.writeHead(200, { "content-type": "image/png" });
        return res.end("png");
      }
      if (req.url === "/to-metadata") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      res.writeHead(200, { "content-type": "image/png" });
      res.end("png");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => vi.unstubAllEnvs());

  it("guardedAgent refuses to connect to a host name that resolves to a private address", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "");
    const { fetch } = await import("undici");
    await expect(fetch(`http://localhost:${port}/a.png`, { dispatcher: guardedAgent() })).rejects.toThrow();
  });

  it("a host that passes the check but resolves privately at connect time (DNS rebinding) is refused", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "");
    // The check sees a public address; the connection's own lookup gets 127.0.0.1.
    const resolvesPublic = async () => ["93.184.216.34"];
    const err = await guardedRequest(`http://localhost:${port}/a.png`, { resolve: resolvesPublic }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: "private-address" });
  });

  it("guardedRequest hands a redirect back instead of following it", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "localhost");
    const res = await guardedRequest(`http://localhost:${port}/to-internal`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`http://127.0.0.1:${port}/secret.png`);
  });

  it("guardedFetch refuses an IP-literal private host before connecting", async () => {
    await expect(guardedFetch(`http://127.0.0.1:${port}/a.png`)).rejects.toMatchObject({ code: "private-address" });
  });

  it.each(["/to-internal", "/to-metadata"])("a redirect to an internal address (%s) is refused", async (path) => {
    // The first hop is allowed (test-only exemption), the redirect target is not.
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "localhost");
    const err = await guardedFetch(`http://localhost:${port}${path}`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: "private-address" });
  });

  it("an exempted test host is fetched normally", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "localhost");
    const res = await guardedFetch(`http://localhost:${port}/a.png`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png");
  });

  it("image downloads introduce themselves as the Trefle importer", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "localhost");
    await importImages({
      refs: ["i1"],
      extract: extractWith([{ id: "i1", url: `http://localhost:${port}/ua.png` }]),
      createMedia: async () => ({ id: 1, url: "/x" }),
      onCreated: () => undefined,
    });
    expect(seenUserAgent).toContain("TrefleImport/1.0");
  });

  it("importImages reports a privately redirected image as unreachable and stores nothing", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "localhost");
    const created: number[] = [];
    const result = await importImages({
      refs: ["i1"],
      extract: extractWith([{ id: "i1", url: `http://localhost:${port}/to-internal` }]),
      createMedia: async () => ({ id: 1, url: "/x" }),
      onCreated: (id) => created.push(id),
    });
    expect(result.failures).toEqual([{ sourceUrl: `http://localhost:${port}/to-internal`, reason: "unreachable" }]);
    expect(created).toEqual([]);
  });
});
