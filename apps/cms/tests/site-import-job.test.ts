import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readPenpotFile } from "@trefle/grapesjs-page-import/penpot";
import type { Browser } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { importStamp, runSiteImport, sweepStaleSiteImports, type SiteImportDeps } from "../src/jobs/siteImport";
import { FontError } from "../src/lib/fonts";
import { SITE_IMPORT_ERROR_MESSAGES } from "../src/lib/import/site-errors";
import { removeSiteFile, siteFilePath, writeSiteFile } from "../src/lib/import/site-files";
import { reportLine } from "../src/lib/import/report-text";

/** A report line as its French text (023: Trefle's lines are keyed). */
const fr = (line: Parameters<typeof reportLine>[0]) => reportLine(line, "fr");

// Own files directory: the sweep below removes every file it doesn't know.
vi.hoisted(() => {
  process.env.SITE_IMPORT_FILES_DIR = `${process.env.TMPDIR ?? "/tmp"}/trefle-site-imports-job-${process.pid}`;
});

/**
 * 015-penpot-site-import (T025, T027, T044, T046) — the site import job with
 * a fake browser, device check, font resolver and image encoder over an
 * in-memory Payload, on the `agence-mini.penpot` fixture (2 boards, 2 real
 * images, Montserrat 400/600/900).
 */
const AGENCE = readFileSync(
  fileURLToPath(new URL("../../../packages/grapesjs-page-import/tests/fixtures/agence-mini.penpot", import.meta.url)),
);
const FILE = readPenpotFile(new Uint8Array(AGENCE));
const SITE = FILE.pages.find((p) => p.boards.length)!;
const [CONTACT, LEGAL] = SITE.boards as [(typeof SITE.boards)[0], (typeof SITE.boards)[0]];

// 18h26 in Paris (UTC+2 in October).
const STARTED_AT = "2026-10-06T16:26:30.000Z";

type Doc = Record<string, unknown> & { id: number };
const idsOf = (where: unknown): number[] => (where as { id: { in: number[] } }).id.in;

function setup(
  over: Record<string, unknown> = {},
  opts: { failPageCreateAt?: number; domainFonts?: unknown[]; existingPages?: Doc[] } = {},
) {
  const imports = new Map<number, Doc>();
  const addImport = (id: number, more: Record<string, unknown> = {}) =>
    imports.set(id, {
      id,
      status: "queued",
      cancelRequested: false,
      fileName: "agence.penpot",
      penpotPage: { pageId: SITE.id, name: SITE.name },
      domain: 3,
      language: 1,
      createdBy: 3,
      startedAt: STARTED_AT,
      boards: [
        { id: "row-1", boardId: CONTACT.id, name: CONTACT.name, path: "/" },
        { id: "row-2", boardId: LEGAL.id, name: LEGAL.name, path: "/mentions-legales" },
      ],
      ...over,
      ...more,
    });
  addImport(42);
  const domain: Doc = { id: 3, hostname: "exemple.fr", isActive: true, fonts: opts.domainFonts ?? [] };
  const pages: Doc[] = [...(opts.existingPages ?? [])];
  const media = new Map<number, Doc>();
  const updates: { id: number; data: Record<string, unknown> }[] = [];
  let pageCreates = 0;

  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
      if (collection === "site-imports") return structuredClone(imports.get(id)!);
      if (collection === "users") return { id, role: "editor", isActive: true };
      if (collection === "domains") return structuredClone(domain);
      throw new Error(`unexpected findByID ${collection}`);
    }),
    update: vi.fn(async ({ collection, id, data, overrideAccess }: { collection: string; id: number; data: Record<string, unknown>; overrideAccess: boolean }) => {
      expect(overrideAccess).toBe(true);
      if (collection === "domains") {
        Object.assign(domain, data);
        return domain;
      }
      expect(collection).toBe("site-imports");
      updates.push({ id, data });
      const next = { ...imports.get(id)!, ...data };
      imports.set(id, next);
      return next;
    }),
    create: vi.fn(async ({ collection, data, user, overrideAccess, file }: { collection: string; data: Record<string, unknown>; user: unknown; overrideAccess: boolean; file?: { mimetype: string } }) => {
      expect(overrideAccess).toBe(false);
      expect(user).toMatchObject({ id: 3 });
      if (collection === "media") {
        expect(file?.mimetype).toBe("image/webp");
        const id = 500 + media.size;
        const doc = { id, url: `http://assets/m${id}.webp`, ...data };
        media.set(id, doc);
        return doc;
      }
      expect(collection).toBe("pages");
      pageCreates += 1;
      if (opts.failPageCreateAt === pageCreates) throw new Error("validation failed");
      const page = { id: 100 + pages.length, ...data };
      pages.push(page);
      return page;
    }),
    delete: vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
      const ids = idsOf(where);
      if (collection === "media") for (const id of ids) media.delete(id);
      else if (collection === "pages") for (const id of ids) pages.splice(pages.findIndex((p) => p.id === id), 1);
      else throw new Error(`unexpected delete ${collection}`);
      return { docs: [], errors: [] };
    }),
    find: vi.fn(async () => {
      throw new Error("the job must not query (no budget reads, no page-imports)");
    }),
  };

  const close = vi.fn(async () => undefined);
  let clock = 1_000_000;
  const check = vi.fn<SiteImportDeps["check"]>(async () => [{ device: "mobile", width: 360, problems: [] }] as never);
  const deps: Partial<SiteImportDeps> = {
    connect: async () => ({ close }) as unknown as Browser,
    check,
    resolveFont: vi.fn(async () => []),
    normalise: vi.fn(async () => Buffer.from("webp")),
    now: () => clock,
    deadlineMs: 60_000,
    pollMs: 60_000,
  };
  const tick = (ms: number) => {
    clock += ms;
  };
  const doc = (id = 42) => imports.get(id)!;
  const steps = () => updates.filter((u) => u.data.step).map((u) => [u.data.step, u.data.progress]);
  return { payload, deps, imports, addImport, domain, pages, media, updates, close, check, tick, doc, steps };
}

const run = async (t: ReturnType<typeof setup>, id = 42, extra: Partial<SiteImportDeps> = {}) => {
  await writeSiteFile(id, AGENCE);
  await runSiteImport(t.payload as never, id, { ...t.deps, ...extra });
};

afterEach(async () => {
  await removeSiteFile(42);
  await removeSiteFile(43);
});

describe("runSiteImport", () => {
  it("creates one draft per board, in order, as the importer, and completes", async () => {
    const t = setup();
    await run(t);
    expect(t.steps().map(([s]) => s)).toEqual(["parse", "fonts", "images", "build", "check", "check", "save", "save"]);
    const progress = t.steps().map(([, p]) => p as number);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);

    expect(t.pages).toHaveLength(2);
    expect(t.pages[0]).toMatchObject({
      title: `Contact_2026-10-06_18h26`,
      pageType: "free",
      status: "draft",
      domain: 3,
      path: "/",
      language: 1,
      seo: { metaTitle: "Contact" },
      siteImport: 42,
    });
    expect(t.pages[1]).toMatchObject({ title: "Mentions légales_2026-10-06_18h26", path: "/mentions-legales" });
    const builder = t.pages[0]!.builder as { html: string; css: string; projectData: unknown };
    expect(builder.html.length).toBeGreaterThan(100);
    expect(builder.projectData).toBeTruthy();

    const done = t.doc();
    expect(done).toMatchObject({ status: "completed", progress: 100, penpotPages: null });
    const boards = done.boards as { boardId: string; page: number; report: { deviceChecks: unknown[]; finalUrl: string } }[];
    expect(boards.map((b) => b.page)).toEqual([100, 101]);
    expect(boards[0]!.report.finalUrl).toBe("agence.penpot");
    expect(boards[0]!.report.deviceChecks).toHaveLength(1);
    expect(t.check).toHaveBeenCalledTimes(2);
    expect(t.close).toHaveBeenCalled();
    expect(existsSync(siteFilePath(42))).toBe(false);
  });

  it("stores each distinct image once as a WebP Media item and uses its URL", async () => {
    const t = setup();
    await run(t);
    expect(t.media.size).toBe(2);
    expect(t.doc().media).toEqual([500, 501]);
    const all = t.pages.map((p) => JSON.stringify(p.builder)).join("");
    expect(all).toContain("http://assets/m500.webp");
    for (const m of t.media.values()) expect(typeof m.altPending).toBe("boolean");
  });

  it("puts the placeholder and reports an image it cannot encode", async () => {
    const t = setup();
    await run(t, 42, { normalise: async () => Promise.reject(new Error("too-large")) });
    expect(t.media.size).toBe(0);
    expect(t.doc().status).toBe("completed");
    const reports = (t.doc().boards as { report: { failedImages: unknown[] } }[]).map((b) => b.report);
    expect(reports.flatMap((r) => r.failedImages).length).toBeGreaterThan(0);
  });

  it("adds the boards' Google fonts to the domain (additions only) and reports it", async () => {
    const t = setup({}, { domainFonts: [{ id: "r1", family: "EB Garamond", weights: ["400"], italic: false, files: [9] }] });
    await run(t);
    expect(t.domain.fonts).toEqual([
      { id: "r1", family: "EB Garamond", weights: ["400"], italic: false, files: [9] },
      { family: "Montserrat", weights: ["400", "600", "900"], italic: false },
    ]);
    const report = (t.doc().boards as { report: { simplified: { what: string; how: string }[]; fontSubstitutions: string[] } }[])[0]!.report;
    expect(report.simplified.map((x) => ({ what: fr(x.what), how: fr(x.how) }))).toContainEqual({ what: "Polices ajoutées au domaine", how: "Montserrat" });
    expect(report.fontSubstitutions).not.toContain("Montserrat");
    const css = (t.pages[0]!.builder as { css: string }).css;
    expect(css).toContain('"Montserrat"');
    expect(css).not.toMatch(/@font-face|fonts\.gstatic|url\([^)]*woff/);
  });

  it("leaves the domain alone when it already has the fonts", async () => {
    const t = setup({}, { domainFonts: [{ id: "r1", family: "Montserrat", weights: ["400", "600", "900"], italic: false, files: [1] }] });
    await run(t);
    expect(t.payload.update.mock.calls.some(([a]) => a.collection === "domains")).toBe(false);
    const report = (t.doc().boards as { report: { simplified: { what: string }[] } }[])[0]!.report;
    expect(report.simplified.some((s) => s.what === "Polices ajoutées au domaine")).toBe(false);
  });

  it("substitutes a family Google doesn't know instead of adding it", async () => {
    const t = setup();
    await run(t, 42, { resolveFont: async ({ family }) => Promise.reject(new FontError("family", family)) });
    expect(t.payload.update.mock.calls.some(([a]) => a.collection === "domains")).toBe(false);
    expect(t.doc().status).toBe("completed");
    const report = (t.doc().boards as { report: { fontSubstitutions: string[] } }[])[0]!.report;
    expect(report.fontSubstitutions).toContain("Montserrat");
  });

  it("fails with fonts-unavailable before creating anything when Google can't be reached", async () => {
    const t = setup();
    await run(t, 42, { resolveFont: async ({ family }) => Promise.reject(new FontError("network", family)) });
    expect(t.doc()).toMatchObject({
      status: "failed",
      errorCode: "fonts-unavailable",
      errorMessage: SITE_IMPORT_ERROR_MESSAGES["fonts-unavailable"],
      penpotPages: null,
    });
    expect(t.media.size).toBe(0);
    expect(t.pages).toHaveLength(0);
    expect(existsSync(siteFilePath(42))).toBe(false);
  });

  it("fails with page-too-large naming the board, and removes what it created", async () => {
    const t = setup();
    await run(t, 42, { maxPageBytes: 10 });
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "page-too-large" });
    expect(t.doc().errorMessage).toBe("La page « Contact » est trop détaillée pour l'éditeur. Simplifiez-la dans Penpot ou décochez-la.");
    expect(t.media.size).toBe(0);
    expect(t.pages).toHaveLength(0);
  });

  it("deletes the pages already saved when a later save fails", async () => {
    const t = setup({}, { failPageCreateAt: 2 });
    await run(t);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "internal", errorMessage: SITE_IMPORT_ERROR_MESSAGES.internal });
    expect(t.pages).toHaveLength(0);
    expect(t.media.size).toBe(0);
    expect((t.doc().boards as { page?: unknown }[]).every((b) => !b.page)).toBe(true);
    expect(existsSync(siteFilePath(42))).toBe(false);
  });

  it("stops at the next checkpoint when cancelled, leaving nothing behind", async () => {
    const t = setup();
    t.check.mockImplementation(async () => {
      t.imports.set(42, { ...t.doc(), cancelRequested: true });
      return [];
    });
    await run(t);
    expect(t.doc()).toMatchObject({ status: "cancelled", penpotPages: null });
    expect(t.pages).toHaveLength(0);
    expect(t.media.size).toBe(0);
    expect(existsSync(siteFilePath(42))).toBe(false);
  });

  it("is cancelled straight away when cancel came before the job started", async () => {
    const t = setup({ cancelRequested: true });
    await run(t);
    expect(t.doc().status).toBe("cancelled");
    expect(existsSync(siteFilePath(42))).toBe(false);
  });

  it("fails with timeout past the deadline", async () => {
    const t = setup();
    t.check.mockImplementation(async () => {
      t.tick(61_000);
      return [];
    });
    await run(t);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "timeout", errorMessage: SITE_IMPORT_ERROR_MESSAGES.timeout });
    expect(t.pages).toHaveLength(0);
  });

  it("does nothing for an import that is not queued", async () => {
    const t = setup({ status: "running" });
    await run(t);
    expect(t.payload.update).not.toHaveBeenCalled();
  });

  it("fails as expired when the file is gone", async () => {
    const t = setup();
    await runSiteImport(t.payload as never, 42, t.deps);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "expired" });
  });
});

describe("re-import (User Story 3)", () => {
  it("creates new pages and never touches existing ones, even in the same minute", async () => {
    const existing: Doc = { id: 7, title: "Contact_2026-10-01_09h00", path: "/", status: "published", builder: { html: "<p>old</p>" } };
    const t = setup({}, { existingPages: [existing] });
    const before = structuredClone(existing);
    t.addImport(43);
    await run(t, 42);
    await run(t, 43);
    expect(t.doc(42).status).toBe("completed");
    expect(t.doc(43).status).toBe("completed");
    expect(t.pages).toHaveLength(5);
    expect(t.pages[0]).toEqual(before);
    const created = t.pages.slice(1);
    expect(new Set(created.map((p) => p.id)).size).toBe(4);
    expect(created.filter((p) => p.title === "Contact_2026-10-06_18h26")).toHaveLength(2);
    const pagesOf = (id: number) => (t.doc(id).boards as { page: number }[]).map((b) => b.page);
    expect(pagesOf(42)).toEqual([101, 102]);
    expect(pagesOf(43)).toEqual([103, 104]);
    // The job only ever writes pages through create.
    expect(t.payload.update.mock.calls.some(([a]) => a.collection === "pages")).toBe(false);
  });
});

describe("importStamp", () => {
  it("formats the import time in Europe/Paris, summer and winter", () => {
    expect(importStamp(Date.parse("2026-10-06T16:26:30Z"))).toBe("2026-10-06_18h26");
    expect(importStamp(Date.parse("2026-12-31T23:05:00Z"))).toBe("2027-01-01_00h05");
  });
});

describe("sweepStaleSiteImports", () => {
  const NOW = Date.parse("2026-10-06T12:00:00Z");
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

  function sweepSetup(docs: Doc[], pagesBySiteImport: Record<number, number[]> = {}) {
    const imports = new Map(docs.map((d) => [d.id, d]));
    const deleted: { collection: string; ids: number[] }[] = [];
    const matches = (d: Doc, cond: Record<string, Record<string, unknown>>): boolean => {
      const [[field, op]] = Object.entries(cond) as [[string, Record<string, unknown>]];
      const v = d[field];
      if ("equals" in op) return v === op.equals;
      if ("less_than" in op) return typeof v === "string" && v < String(op.less_than);
      if ("in" in op) return (op.in as unknown[]).includes(v);
      throw new Error("unexpected operator");
    };
    const evalWhere = (d: Doc, w: Record<string, unknown>): boolean => {
      if (w.and) return (w.and as Record<string, unknown>[]).every((x) => evalWhere(d, x));
      if (w.or) return (w.or as Record<string, unknown>[]).some((x) => evalWhere(d, x));
      return matches(d, w as never);
    };
    const payload = {
      find: vi.fn(async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
        if (collection === "pages") {
          const id = (where.siteImport as { equals: number }).equals;
          return { docs: (pagesBySiteImport[id] ?? []).map((p) => ({ id: p })) };
        }
        return { docs: [...imports.values()].filter((d) => evalWhere(d, where)) };
      }),
      update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
        imports.set(id, { ...imports.get(id)!, ...data });
      }),
      delete: vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
        deleted.push({ collection, ids: idsOf(where) });
      }),
    };
    return { payload, imports, deleted };
  }

  it("fails stale running/queued imports with their pages and Media, abandons old analyses, removes orphan files", async () => {
    const s = sweepSetup([
      { id: 61, status: "running", startedAt: ago(9), media: [800] },
      { id: 62, status: "running", startedAt: ago(3) },
      { id: 63, status: "queued", startedAt: ago(11) },
      { id: 64, status: "analysed", createdAt: ago(61) },
      { id: 65, status: "analysed", createdAt: ago(10) },
      { id: 66, status: "completed", startedAt: ago(100) },
    ], { 61: [300, 301] });
    for (const id of [61, 64, 65, 66, 67]) await writeSiteFile(id, new Uint8Array([1]));

    const n = await sweepStaleSiteImports(s.payload as never, NOW);

    expect(n).toBe(3);
    expect(s.imports.get(61)).toMatchObject({ status: "failed", errorCode: "timeout", penpotPages: null });
    expect(s.imports.get(62)!.status).toBe("running");
    expect(s.imports.get(63)).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect(s.imports.get(64)).toMatchObject({ status: "abandoned", penpotPages: null });
    expect(s.imports.get(65)!.status).toBe("analysed");
    expect(s.deleted).toContainEqual({ collection: "pages", ids: [300, 301] });
    expect(s.deleted).toContainEqual({ collection: "media", ids: [800] });
    // Files: 65 (live analysis) stays; 61, 64 (swept), 66 (finished) and 67 (unknown) go.
    expect(existsSync(siteFilePath(65))).toBe(true);
    for (const id of [61, 64, 66, 67]) expect(existsSync(siteFilePath(id))).toBe(false);
    await removeSiteFile(65);
  });
});
