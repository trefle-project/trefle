import { describe, expect, it, vi } from "vitest";

import { mediaUsageEndpoint } from "../src/endpoints/mediaUsage";
import { findMediaUsage } from "../src/lib/media-usage";

/**
 * 017-edge-protection (T044, contracts/media-usage.md) — the pages and domains
 * that use a media item. The database narrows with `contains`; the exact
 * `/<key>` boundary is checked here.
 */
const media = { id: 7, filename: "photo-3fa1c09b.jpg", previousFilenames: [{ filename: "photo.jpg" }] };
const domain = { id: 2, hostname: "www.example.fr" };

const page = (id: number, over: Record<string, unknown>) => ({
  id,
  title: `Page ${id}`,
  path: `/p${id}`,
  status: "published",
  domain,
  builder: { html: "", css: "" },
  seo: {},
  ...over,
});

const payloadWith = (pages: unknown[], domains: unknown[] = []) => ({
  find: vi.fn(async ({ collection }: { collection: string }) => ({ docs: collection === "pages" ? pages : domains })),
});

const usage = (pages: unknown[], domains: unknown[] = []) => findMediaUsage(payloadWith(pages, domains) as never, media);

describe("findMediaUsage", () => {
  it("matches the current key, a previous key and CSS url()", async () => {
    const out = await usage([
      page(1, { builder: { html: `<img src="https://a.test/photo-3fa1c09b.jpg">`, css: "" } }),
      page(2, { builder: { html: `<img src="https://a.test/photo.jpg">`, css: "" } }),
      page(3, { builder: { html: "", css: `#x{background:url(https://a.test/photo.jpg)}` } }),
    ]);
    expect(out.pages.map((p) => [p.id, p.via])).toEqual([
      [1, "content"],
      [2, "content"],
      [3, "content"],
    ]);
    expect(out.total).toBe(3);
  });

  it("does not match a longer name containing the key (`/<key>` boundary)", async () => {
    const out = await usage([
      page(1, { builder: { html: `<img src="https://a.test/big-photo.jpg">`, css: "" } }),
      page(2, { builder: { html: `<img src="https://a.test/photo.jpg.bak">`, css: "" } }),
    ]);
    expect(out).toEqual({ pages: [], domains: [], total: 0 });
  });

  it("lists a share image, and a page once even when it matches both ways (content wins)", async () => {
    const out = await usage([
      page(1, { seo: { ogImage: 7 } }),
      page(2, { seo: { ogImage: { id: 7 } }, builder: { html: `<img src="https://a.test/photo.jpg">`, css: "" } }),
    ]);
    expect(out.pages.map((p) => [p.id, p.via])).toEqual([
      [1, "shareImage"],
      [2, "content"],
    ]);
  });

  it("flags A/B variants and orders published before draft, then by title", async () => {
    const html = `<img src="https://a.test/photo.jpg">`;
    const out = await usage([
      page(1, { title: "Zèbre", status: "draft", builder: { html, css: "" } }),
      page(2, { title: "Brouillon B", status: "draft", experimentOf: 9, builder: { html, css: "" } }),
      page(3, { title: "Accueil", builder: { html, css: "" } }),
    ]);
    expect(out.pages.map((p) => p.title)).toEqual(["Accueil", "Brouillon B", "Zèbre"]);
    expect(out.pages.find((p) => p.id === 2)).toMatchObject({ isVariant: true, adminUrl: "/admin/collections/pages/2" });
    expect(out.pages.find((p) => p.id === 3)).toMatchObject({ isVariant: false, domain: "www.example.fr", path: "/p3" });
  });

  it("lists domains using it as default share image or favicon", async () => {
    const out = await usage([], [
      { id: 2, hostname: "a.fr", branding: { defaultOgImage: 7 } },
      { id: 3, hostname: "b.fr", branding: { faviconUrl: "https://a.test/photo-3fa1c09b.jpg" } },
      { id: 4, hostname: "c.fr", branding: { faviconUrl: "https://a.test/big-photo.jpg" } },
    ]);
    expect(out.domains.map((d) => [d.hostname, d.via])).toEqual([
      ["a.fr", "defaultShareImage"],
      ["b.fr", "favicon"],
    ]);
    expect(out.total).toBe(2);
  });
});

describe("GET /api/media/:id/usage", () => {
  const call = (user: unknown, found: unknown) =>
    mediaUsageEndpoint.handler({
      user,
      routeParams: { id: "7" },
      payload: { findByID: vi.fn().mockResolvedValue(found), find: vi.fn().mockResolvedValue({ docs: [] }) },
    } as never) as Promise<Response>;

  it("403 for a non-editor (anonymous or the service account)", async () => {
    expect((await call(null, media)).status).toBe(403);
    expect((await call({ isService: true }, media)).status).toBe(403);
  });

  it("404 for an unknown id", async () => {
    expect((await call({ role: "editor" }, null)).status).toBe(404);
  });

  it("returns the empty shape for an unused image", async () => {
    const res = await call({ role: "editor" }, media);
    expect(await res.json()).toEqual({ pages: [], domains: [], total: 0 });
  });
});
