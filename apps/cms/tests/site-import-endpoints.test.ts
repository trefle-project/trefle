import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { manyEntries, notZip, penpotV1, twoFiles, zipBombEntry } from "@trefle/grapesjs-page-import/penpot/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteImports } from "../src/collections/SiteImports";
import { siteImportAnalyseEndpoint } from "../src/endpoints/siteImportAnalyse";
import { siteImportCancelEndpoint } from "../src/endpoints/siteImportCancel";
import { siteImportStartEndpoint } from "../src/endpoints/siteImportStart";
import { SITE_IMPORT_ERROR_MESSAGES, TOO_MANY_BOARDS } from "../src/lib/import/site-errors";
import { removeSiteFile, siteFilePath, writeSiteFile } from "../src/lib/import/site-files";

// Own files directory: the sweep below removes every file it doesn't know.
vi.hoisted(() => {
  process.env.SITE_IMPORT_FILES_DIR = `${process.env.TMPDIR ?? "/tmp"}/trefle-site-imports-endpoints-${process.pid}`;
});

/**
 * 015-penpot-site-import (T022, contracts/site-import-api.md) — analyse,
 * start and cancel endpoints, and the collection's REST access.
 */

// Multipart parsing is Payload's (addDataAndFileToRequest); the tests hand the parsed parts over directly.
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addDataAndFileToRequest: vi.fn(async (req: { __file?: unknown; file?: unknown }) => {
    req.file = req.__file;
  }),
}));

const BLOG = readFileSync(
  fileURLToPath(new URL("../../../packages/grapesjs-page-import/tests/fixtures/blog-mini.penpot", import.meta.url)),
);

const admin = { id: 1, role: "admin", isActive: true };
const editor = { id: 2, role: "editor", isActive: true };
const otherEditor = { id: 5, role: "editor", isActive: true };
const viewer = { id: 6, role: "viewer", isActive: true };

const DOMAIN = { id: 3, hostname: "client-site.example", isActive: true, defaultLanguage: 1 };
const ANALYSED_PAGES = [
  {
    id: "page-1",
    name: "Site",
    boards: [
      { id: "b-home", name: "Accueil", width: 1440, height: 900, proposedPath: "/" },
      { id: "b-post", name: "Article", width: 1440, height: 900, proposedPath: "/article" },
    ],
  },
];

type Opts = {
  domain?: Record<string, unknown> | null;
  published?: { path: string }[];
  siteImport?: Record<string, unknown> | null;
  language?: Record<string, unknown> | null;
};

function makePayload(opts: Opts = {}) {
  const domain = opts.domain === undefined ? DOMAIN : opts.domain;
  const language = opts.language === undefined ? { id: 1, isActive: true } : opts.language;
  return {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
      if (collection === "domains") return domain && domain.id === id ? domain : null;
      if (collection === "languages") return language && language.id === id ? language : null;
      if (collection === "site-imports") return opts.siteImport ?? null;
      throw new Error(`unexpected findByID ${collection}`);
    }),
    find: vi.fn(async () => ({ docs: opts.published ?? [] })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 4242, ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...opts.siteImport, ...data })),
    jobs: {
      queue: vi.fn(async () => ({ id: 900 })),
      runByID: vi.fn(async () => undefined),
    },
  };
}

const analyseReq = (
  user: unknown,
  { domain = "3", file, size, payload = makePayload() }: { domain?: string | null; file?: { data: Buffer; name: string }; size?: number; payload?: unknown } = {},
) =>
  ({
    user,
    payload,
    i18n: { language: "fr" },
    url: `http://localhost:3000/api/site-imports/analyse${domain === null ? "" : `?domain=${domain}`}`,
    headers: new Headers(size != null ? { "content-length": String(size) } : {}),
    __file: file,
  }) as never;

const penpotFile = (bytes: Uint8Array, name = "Blog mini.penpot") => ({ data: Buffer.from(bytes), name });

const errorOf = async (res: Response) => ((await res.json()) as { errors: { code: string; message: string }[] }).errors[0]!;

beforeEach(() => {
  vi.stubEnv("PENPOT_IMPORT", "on");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await removeSiteFile(4242);
  await removeSiteFile(42);
});

describe("feature flag and access", () => {
  it("answers 404 on every route when PENPOT_IMPORT is not on", async () => {
    vi.stubEnv("PENPOT_IMPORT", "");
    const payload = makePayload();
    expect((await siteImportAnalyseEndpoint.handler(analyseReq(editor, { payload }))).status).toBe(404);
    const req = { user: editor, payload, routeParams: { id: "42" }, json: async () => ({}) } as never;
    expect((await siteImportStartEndpoint.handler(req)).status).toBe(404);
    expect((await siteImportCancelEndpoint.handler(req)).status).toBe(404);
    expect(payload.findByID).not.toHaveBeenCalled();
  });

  it("answers 403 to anonymous and non-editor users", async () => {
    for (const user of [null, viewer]) {
      expect((await siteImportAnalyseEndpoint.handler(analyseReq(user))).status).toBe(403);
      const req = { user, payload: makePayload(), routeParams: { id: "42" }, json: async () => ({}) } as never;
      expect((await siteImportStartEndpoint.handler(req)).status).toBe(403);
      expect((await siteImportCancelEndpoint.handler(req)).status).toBe(403);
    }
  });

  it("is never created or deleted through the REST API; staff read and update", () => {
    const req = (user: unknown) => ({ req: { user } }) as never;
    expect(SiteImports.access?.create?.(req(admin))).toBe(false);
    expect(SiteImports.access?.delete?.(req(admin))).toBe(false);
    expect(SiteImports.access?.read?.(req(editor))).toBeTruthy();
    expect(SiteImports.access?.read?.(req(viewer))).toBeFalsy();
  });

  it("lists its endpoints before Payload's /:id routes", () => {
    expect(SiteImports.endpoints && SiteImports.endpoints.map((e) => e.path)).toEqual(["/analyse", "/:id/start", "/:id/cancel"]);
  });
});

describe("POST /api/site-imports/analyse", () => {
  it.each([[null], ["abc"], ["99"]])("refuses a missing or unknown domain (%s) before reading the file", async (domain) => {
    const payload = makePayload();
    const res = await siteImportAnalyseEndpoint.handler(analyseReq(editor, { domain, file: penpotFile(BLOG), payload }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code: "invalid-input", message: "Choisissez d'abord le domaine du site." });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses an inactive domain", async () => {
    const payload = makePayload({ domain: { ...DOMAIN, isActive: false } });
    const res = await siteImportAnalyseEndpoint.handler(analyseReq(editor, { file: penpotFile(BLOG), payload }));
    expect(res.status).toBe(400);
  });

  it("answers 413 from content-length alone, before reading the body", async () => {
    const res = await siteImportAnalyseEndpoint.handler(analyseReq(editor, { size: 100 * 1024 * 1024 + 65 * 1024 }));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toEqual({ code: "file-too-large", message: SITE_IMPORT_ERROR_MESSAGES["file-too-large"] });
  });

  it.each([
    ["not-penpot", notZip],
    ["penpot-v1", penpotV1],
    ["penpot-libraries", twoFiles],
    ["file-too-complex", () => zipBombEntry()],
    ["file-too-complex", () => manyEntries()],
  ] as const)("refuses a hostile file with %s and its French message", async (code, make) => {
    const payload = makePayload();
    const res = await siteImportAnalyseEndpoint.handler(analyseReq(editor, { file: penpotFile(make()), payload }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code, message: SITE_IMPORT_ERROR_MESSAGES[code] });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("lists the boards in reading order, marks published addresses, stores the file", async () => {
    const payload = makePayload({ published: [{ path: "/" }, { path: "/contact" }, { path: "/" }] });
    const res = await siteImportAnalyseEndpoint.handler(
      analyseReq(editor, { file: penpotFile(BLOG, "../../etc/Blog mini\u0007.penpot"), payload }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: number;
      domain: unknown;
      publishedPaths: string[];
      penpotFileName: string;
      pages: { name: string; boards: { name: string; proposedPath: string; published: boolean; thumbnail?: string }[] }[];
    };
    expect(body.id).toBe(4242);
    expect(body.domain).toEqual({ id: 3, hostname: "client-site.example", defaultLanguage: 1 });
    expect(body.publishedPaths).toEqual(["/", "/contact"]);
    const site = body.pages.find((p) => p.name === "Site")!;
    expect(site.boards.map((b) => [b.name, b.proposedPath, b.published])).toEqual([
      ["Accueil", "/", true],
      ["Article", "/article", false],
    ]);
    for (const b of site.boards) {
      if (b.thumbnail) {
        expect(b.thumbnail).toMatch(/^data:image\/png;base64,/);
        expect(b.thumbnail.length).toBeLessThan((200 * 1024 * 4) / 3 + 100);
      }
    }
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "site-imports",
        overrideAccess: true,
        data: expect.objectContaining({ status: "analysed", fileName: "Blog mini.penpot", domain: 3, createdBy: 2 }),
      }),
    );
    expect(existsSync(siteFilePath(4242))).toBe(true);
  });
});

const analysedDoc = (over: Record<string, unknown> = {}) => ({
  id: 42,
  status: "analysed",
  domain: 3,
  createdBy: 2,
  penpotPages: ANALYSED_PAGES,
  ...over,
});
const START = {
  penpotPageId: "page-1",
  language: 1,
  boards: [
    { id: "b-home", path: "/" },
    { id: "b-post", path: "article" },
  ],
};
const startReq = (user: unknown, body: unknown, payload: ReturnType<typeof makePayload>, language = "fr") =>
  ({ user, payload, routeParams: { id: "42" }, json: async () => body, i18n: { language } }) as never;

describe("POST /api/site-imports/:id/start", () => {
  beforeEach(async () => {
    await writeSiteFile(42, new Uint8Array([1]));
  });

  it("stores the choices, queues the job, starts it without waiting, answers 202", async () => {
    const payload = makePayload({ siteImport: analysedDoc() });
    const res = await siteImportStartEndpoint.handler(startReq(editor, START, payload));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: 42, status: "queued" });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "site-imports",
        id: 42,
        data: expect.objectContaining({
          status: "queued",
          penpotPage: { pageId: "page-1", name: "Site" },
          language: 1,
          boards: [
            { boardId: "b-home", name: "Accueil", path: "/" },
            { boardId: "b-post", name: "Article", path: "/article" },
          ],
        }),
      }),
    );
    expect(payload.jobs.queue).toHaveBeenCalledWith({ task: "site-import", input: { siteImportId: 42 }, queue: "imports" });
    expect(payload.jobs.runByID).toHaveBeenCalledWith({ id: 900 });
  });

  it("lets an admin start someone else's analysis, not another editor", async () => {
    expect((await siteImportStartEndpoint.handler(startReq(admin, START, makePayload({ siteImport: analysedDoc() })))).status).toBe(202);
    expect((await siteImportStartEndpoint.handler(startReq(otherEditor, START, makePayload({ siteImport: analysedDoc() })))).status).toBe(403);
  });

  it("answers 404 for an unknown import and 409 once started", async () => {
    expect((await siteImportStartEndpoint.handler(startReq(editor, START, makePayload({ siteImport: null })))).status).toBe(404);
    const res = await siteImportStartEndpoint.handler(startReq(editor, START, makePayload({ siteImport: analysedDoc({ status: "running" }) })));
    expect(res.status).toBe(409);
  });

  it("answers 410 expired when the file is gone", async () => {
    await removeSiteFile(42);
    const res = await siteImportStartEndpoint.handler(startReq(editor, START, makePayload({ siteImport: analysedDoc() })));
    expect(res.status).toBe(410);
    expect(await errorOf(res)).toEqual({ code: "expired", message: SITE_IMPORT_ERROR_MESSAGES.expired });
  });

  it.each([
    ["an unknown Penpot page", { ...START, penpotPageId: "nope" }, /page Penpot/],
    ["no board", { ...START, boards: [] }, /au moins un board/],
    ["an unknown board", { ...START, boards: [{ id: "zzz", path: "/x" }] }, /n'existe pas/],
    ["a board twice", { ...START, boards: [START.boards[0], START.boards[0]] }, /n'existe pas/],
    ["two boards on one address", { ...START, boards: [{ id: "b-home", path: "/a" }, { id: "b-post", path: "/a" }] }, /« Article » et « Accueil » ont la même adresse/],
    ["an address with a space", { ...START, boards: [{ id: "b-home", path: "/à propos" }] }, /Adresse de « Accueil » : pas d'espace/],
    ["the reserved /confirmation", { ...START, boards: [{ id: "b-home", path: "/confirmation" }] }, /Adresse de « Accueil »/],
    ["an inactive language", { ...START, language: 99 }, /langue active/],
  ])("refuses %s with 400 invalid-input", async (_label, body, message) => {
    const payload = makePayload({ siteImport: analysedDoc() });
    const res = await siteImportStartEndpoint.handler(startReq(editor, body, payload));
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("invalid-input");
    expect(err.message).toMatch(message);
    expect(payload.jobs.queue).not.toHaveBeenCalled();
  });

  it("refuses in the member's language", async () => {
    const payload = makePayload({ siteImport: analysedDoc() });
    const res = await siteImportStartEndpoint.handler(startReq(editor, { ...START, boards: [{ id: "b-home", path: "/à propos" }] }, payload, "en"));
    expect((await errorOf(res)).message).toBe("Address of “Accueil”: no space, “?” or “#” in an address.");
  });

  it("refuses more than 10 boards with the cap message", async () => {
    const boards = Array.from({ length: 11 }, (_, i) => ({ id: `b-${i}`, name: `B${i}`, width: 1, height: 1, proposedPath: `/b${i}` }));
    const payload = makePayload({ siteImport: analysedDoc({ penpotPages: [{ id: "page-1", name: "Site", boards }] }) });
    const res = await siteImportStartEndpoint.handler(
      startReq(editor, { ...START, boards: boards.map((b) => ({ id: b.id, path: b.proposedPath })) }, payload),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toBe(TOO_MANY_BOARDS);
  });

  it("answers 409 when the domain is no longer active", async () => {
    const payload = makePayload({ siteImport: analysedDoc(), domain: { ...DOMAIN, isActive: false } });
    const res = await siteImportStartEndpoint.handler(startReq(editor, START, payload));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).message).toBe("Ce domaine n'est plus actif.");
  });
});

describe("POST /api/site-imports/:id/cancel", () => {
  const cancelReq = (user: unknown, payload: ReturnType<typeof makePayload>) => ({ user, payload, routeParams: { id: "42" }, i18n: { language: "fr" } }) as never;

  it.each(["queued", "running"])("asks a %s import to stop (202)", async (status) => {
    const payload = makePayload({ siteImport: analysedDoc({ status }) });
    const res = await siteImportCancelEndpoint.handler(cancelReq(editor, payload));
    expect(res.status).toBe(202);
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ id: 42, data: { cancelRequested: true } }));
  });

  it.each(["analysed", "completed", "failed", "cancelled"])("answers 409 for a %s import", async (status) => {
    const payload = makePayload({ siteImport: analysedDoc({ status }) });
    expect((await siteImportCancelEndpoint.handler(cancelReq(editor, payload))).status).toBe(409);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("refuses another editor's import", async () => {
    const payload = makePayload({ siteImport: analysedDoc({ status: "running" }) });
    expect((await siteImportCancelEndpoint.handler(cancelReq(otherEditor, payload))).status).toBe(403);
  });
});
