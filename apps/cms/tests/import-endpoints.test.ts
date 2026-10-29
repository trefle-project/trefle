import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageImports } from "../src/collections/PageImports";
import { pageImportBudgetEndpoint } from "../src/endpoints/pageImportBudget";
import { pageImportCancelEndpoint } from "../src/endpoints/pageImportCancel";
import { pageImportStartEndpoint } from "../src/endpoints/pageImportStart";

/**
 * 012-url-page-import (T030, contracts/import-api.md) — start, cancel and
 * budget endpoints, and the collection's REST access.
 */
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    const table: Record<string, string[]> = { "exemple.fr": ["93.184.216.34"], cms: ["172.18.0.5"] };
    if (!table[host]) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return table[host]!.map((address) => ({ address, family: 4 }));
  }),
}));

// Multipart parsing is Payload's (addDataAndFileToRequest); the tests hand the
// parsed parts over directly.
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addDataAndFileToRequest: vi.fn(async (req: { __data?: unknown; __file?: unknown; data?: unknown; file?: unknown }) => {
    req.data = req.__data;
    req.file = req.__file;
  }),
}));

const admin = { id: 1, role: "admin", isActive: true };
const editor = { id: 2, role: "editor", isActive: true };
const otherEditor = { id: 5, role: "editor", isActive: true };

type Imp = { costEur: number; createdBy: number; startedAt: string };

function makePayload(opts: { imports?: Imp[]; settings?: Record<string, unknown>; importDoc?: Record<string, unknown> } = {}) {
  return {
    find: vi.fn(async ({ where }: { where: { and?: Record<string, { equals?: unknown }>[] } }) => {
      const byUser = where.and?.find((c) => "createdBy" in c)?.createdBy?.equals;
      return { docs: (opts.imports ?? []).filter((d) => byUser == null || d.createdBy === byUser) };
    }),
    findGlobal: vi.fn(async () => ({ importMonthlyCapEur: 20, importDefaultUserBudgetEur: 10, ...opts.settings })),
    findByID: vi.fn(async () => opts.importDoc ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 42, ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...opts.importDoc, ...data })),
    jobs: {
      queue: vi.fn(async () => ({ id: 900 })),
      runByID: vi.fn(async () => undefined),
    },
  };
}

const startReq = (user: unknown, body: unknown, payload = makePayload(), language = "fr") =>
  ({ user, payload, json: async () => body, i18n: { language } }) as never;

const VALID = { url: "https://exemple.fr/offre", pageType: "subscription", title: "Offre", language: 1, domain: 3, path: "offre" };

const errorOf = async (res: Response) => ((await res.json()) as { errors: { code: string; message: string }[] }).errors[0]!;

beforeEach(() => {
  vi.stubEnv("IMPORT_AI_MODE", "fixture");
  vi.stubEnv("DEPLOY_ENV", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/page-imports/start", () => {
  it("queues the import, starts the job without waiting, answers 202", async () => {
    const payload = makePayload();
    const res = await pageImportStartEndpoint.handler(startReq(editor, VALID, payload));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: 42, status: "queued" });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "page-imports",
        overrideAccess: true,
        data: expect.objectContaining({
          sourceUrl: "https://exemple.fr/offre",
          pageType: "subscription",
          title: "Offre",
          domain: 3,
          path: "/offre",
          language: 1,
          status: "queued",
          createdBy: 2,
        }),
      }),
    );
    expect(payload.jobs.queue).toHaveBeenCalledWith({ task: "page-import", input: { importId: 42 }, queue: "imports" });
    expect(payload.jobs.runByID).toHaveBeenCalledWith({ id: 900 });
  });

  it.each([
    ["fr", "fr"],
    ["en", "en"],
    ["", "en"],
  ])("stores the launcher's admin language (%j) as the report language: %s (T053)", async (language, stored) => {
    const payload = makePayload();
    await pageImportStartEndpoint.handler(startReq(editor, VALID, payload, language));
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reportLanguage: stored }) }));
  });

  it.each([
    [{ ...VALID, url: "ftp://exemple.fr/" }, "invalid-url"],
    [{ ...VALID, url: "https://exemple.fr:8443/" }, "invalid-url"],
    [{ ...VALID, url: "http://cms/" }, "private-address"],
    [{ ...VALID, url: "http://169.254.169.254/" }, "private-address"],
    [{ ...VALID, url: "https://nexiste-pas.example/" }, "unresolvable"],
    [{ ...VALID, title: " " }, "invalid-input"],
    [{ ...VALID, pageType: "landing" }, "invalid-input"],
    [{ ...VALID, language: undefined }, "invalid-input"],
  ])("refuses %j with 400 %s and creates nothing", async (body, code) => {
    const payload = makePayload();
    const res = await pageImportStartEndpoint.handler(startReq(editor, body, payload));
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe(code);
    expect(err.message.length).toBeGreaterThan(10);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses in the member's language", async () => {
    const res = await pageImportStartEndpoint.handler(startReq(editor, { ...VALID, title: " " }, makePayload(), "en"));
    expect((await errorOf(res)).message).toBe("Enter the page's title.");
    const url = await pageImportStartEndpoint.handler(startReq(editor, { ...VALID, url: "ftp://exemple.fr/" }, makePayload(), "en"));
    expect((await errorOf(url)).message).toBe("This is not a valid web address (it must start with https:// or http://).");
  });

  it("answers 409 user-budget-exhausted while another user can still start", async () => {
    const imports = [{ costEur: 10, createdBy: 2, startedAt: new Date().toISOString() }];
    const blocked = await pageImportStartEndpoint.handler(startReq(editor, VALID, makePayload({ imports })));
    expect(blocked.status).toBe(409);
    const err = await errorOf(blocked);
    expect(err.code).toBe("user-budget-exhausted");
    expect(err.message).toMatch(/^Votre budget mensuel d'import est épuisé\. Vous pourrez de nouveau importer le 1er [a-zéû]+/);

    const other = await pageImportStartEndpoint.handler(startReq(otherEditor, VALID, makePayload({ imports })));
    expect(other.status).toBe(202);
  });

  it("answers 409 budget-exhausted when the workspace cap is reached", async () => {
    const imports = [{ costEur: 20, createdBy: 9, startedAt: new Date().toISOString() }];
    const res = await pageImportStartEndpoint.handler(startReq(editor, VALID, makePayload({ imports })));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("budget-exhausted");
  });

  it("answers 409 feature-disabled first when the feature is off (cap 0, or nothing configured)", async () => {
    const capZero = await pageImportStartEndpoint.handler(startReq(editor, { url: "nope" }, makePayload({ settings: { importMonthlyCapEur: 0 } })));
    expect(capZero.status).toBe(409);
    expect((await errorOf(capZero)).code).toBe("feature-disabled");

    vi.stubEnv("IMPORT_AI_MODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const off = await pageImportStartEndpoint.handler(startReq(editor, VALID));
    expect((await errorOf(off)).code).toBe("feature-disabled");
  });

  it("refuses non-staff with 403", async () => {
    for (const user of [null, { id: 9, isService: true }, { id: 8, role: "editor", isActive: false }]) {
      expect((await pageImportStartEndpoint.handler(startReq(user, VALID))).status).toBe(403);
    }
  });
});

describe("POST /api/page-imports/:id/cancel", () => {
  const req = (user: unknown, importDoc: Record<string, unknown> | null) => {
    const payload = makePayload({ importDoc: importDoc ?? undefined });
    return { req: { user, payload, routeParams: { id: "42" }, i18n: { language: "fr" } } as never, payload };
  };
  const running = { id: 42, status: "running", createdBy: 2, cancelRequested: false };

  it("lets the creator cancel, idempotently", async () => {
    const { req: r, payload } = req(editor, running);
    const res = await pageImportCancelEndpoint.handler(r);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 42, status: "running", cancelRequested: true });
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ data: { cancelRequested: true } }));

    const again = req(editor, { ...running, cancelRequested: true });
    expect((await pageImportCancelEndpoint.handler(again.req)).status).toBe(200);
    expect(again.payload.update).not.toHaveBeenCalled();
  });

  it("lets an admin cancel someone else's import, not another editor", async () => {
    expect((await pageImportCancelEndpoint.handler(req(admin, running).req)).status).toBe(200);
    expect((await pageImportCancelEndpoint.handler(req(otherEditor, running).req)).status).toBe(403);
  });

  it("answers 409 on a finished import and 404 on an unknown one", async () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      const res = await pageImportCancelEndpoint.handler(req(editor, { ...running, status }).req);
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe("already-finished");
    }
    expect((await pageImportCancelEndpoint.handler(req(editor, null).req)).status).toBe(404);
  });
});

describe("GET /api/page-imports/budget", () => {
  it("returns the workspace and user parts, the flag and the reset date", async () => {
    const payload = makePayload({ imports: [{ costEur: 4.1, createdBy: 2, startedAt: new Date().toISOString() }] });
    const res = await pageImportBudgetEndpoint.handler({ user: editor, payload } as never);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      workspace: { capEur: 20, spentEur: 4.1, remainingEur: 15.9 },
      user: { budgetEur: 10, spentEur: 4.1, remainingEur: 5.9, isDefault: true },
      enabled: true,
      available: true,
      blockedBy: null,
    });
    expect(String(body.resetsAt)).toMatch(/^\d{4}-\d{2}-01T00:00:00\+0[12]:00$/);
  });

  it("reports enabled: false when the cap is 0, and refuses non-staff", async () => {
    const res = await pageImportBudgetEndpoint.handler({ user: editor, payload: makePayload({ settings: { importMonthlyCapEur: 0 } }) } as never);
    expect(((await res.json()) as { enabled: boolean }).enabled).toBe(false);
    expect((await pageImportBudgetEndpoint.handler({ user: null, payload: makePayload() } as never)).status).toBe(403);
  });
});

describe("page-imports REST access", () => {
  const can = (fn: unknown, user: unknown) => (typeof fn === "function" ? fn({ req: { user } }) : fn);
  const field = (name: string) => PageImports.fields.find((f) => "name" in f && f.name === name) as { access?: { update?: unknown; create?: unknown } };

  it("staff read; nobody creates or deletes through REST", () => {
    expect(can(PageImports.access?.read, editor)).toBe(true);
    expect(can(PageImports.access?.read, { id: 9, isService: true })).toBe(false);
    expect(can(PageImports.access?.create, admin)).toBe(false);
    expect(can(PageImports.access?.delete, admin)).toBe(false);
  });

  it("only `reportDismissed` is writable by staff; every other field is locked", () => {
    expect(can(field("reportDismissed").access?.update, editor)).toBe(true);
    expect(can(field("reportDismissed").access?.update, null)).toBe(false);
    for (const name of ["status", "costEur", "createdBy", "page", "report", "cancelRequested"]) {
      expect(can(field(name).access?.update, admin), name).toBe(false);
    }
  });

  it("registers the three endpoints on the collection, before Payload's /:id routes", () => {
    expect(PageImports.endpoints && PageImports.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      "post /start",
      "get /budget",
      "post /:id/cancel",
    ]);
  });
});

describe("POST /api/page-imports/start — saved file (013, contracts/start-file.md)", () => {
  const MB = 1024 * 1024;
  const FIELDS = { pageType: "subscription", title: "Offre", language: 1, domain: 3, path: "offre" };
  const MHTML = readFileSync(`${process.cwd()}/../web/tests/e2e/fixtures/import-source/saved/fixture.mhtml`);
  const fileReq = (user: unknown, file: { name: string; data: Buffer } | undefined, payload = makePayload(), length?: number) =>
    ({
      user,
      payload,
      i18n: { language: "fr" },
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(length ?? (file?.data.length ?? 0) + 500),
      }),
      __data: FIELDS,
      __file: file ? { ...file, mimetype: "application/octet-stream", size: file.data.length } : undefined,
    }) as never;

  afterEach(() => rmSync(`${tmpdir()}/trefle-page-imports/42`, { force: true }));

  it("over 25 MB (declared length) → 413 file-too-large before reading the body", async () => {
    const payload = makePayload();
    const res = await pageImportStartEndpoint.handler(fileReq(editor, undefined, payload, 26 * MB + 1024 * 1024));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toEqual({
      code: "file-too-large",
      message: "Ce fichier dépasse 25 Mo. Enregistrez la page sans ses vidéos, ou choisissez « Page web, un seul fichier ».",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("no file → 400 missing-file", async () => {
    const res = await pageImportStartEndpoint.handler(fileReq(editor, undefined));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code: "missing-file", message: "Choisissez le fichier de la page enregistrée." });
  });

  it.each([
    ["offre.pdf", Buffer.from("%PDF-1.7")],
    ["offre.html", Buffer.from("%PDF-1.7 renommé")],
    ["offre.mhtml", Buffer.from("PK\u0003\u0004zip")],
  ])("%s that isn't a saved page → 400 unsupported-file", async (name, data) => {
    const payload = makePayload();
    const res = await pageImportStartEndpoint.handler(fileReq(editor, { name, data }, payload));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      code: "unsupported-file",
      message:
        "Ce fichier n'est pas une page web enregistrée. Dans votre navigateur, utilisez « Enregistrer sous… › Page web, un seul fichier » (.mhtml), ou l'extension SingleFile (.html).",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("a saved MHTML → 202: import recorded as a file, declared address kept, temp file written (mode 600), job started", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "import-fixture"); // the fixture's declared address is the test site
    const payload = makePayload();
    const res = await pageImportStartEndpoint.handler(fileReq(editor, { name: "Potager Facile — la newsletter.mhtml", data: MHTML }, payload));
    expect(res.status).toBe(202);
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceKind: "file",
          sourceFileName: "Potager Facile — la newsletter.mhtml",
          sourceUrl: "http://import-fixture/index.html",
          pageType: "subscription",
          createdBy: editor.id,
        }),
      }),
    );
    const path = `${tmpdir()}/trefle-page-imports/42`;
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path).equals(MHTML)).toBe(true);
    expect(payload.jobs.queue).toHaveBeenCalled();
  });

  it("a file name is sanitised and capped at 200 characters", async () => {
    const payload = makePayload();
    const name = `${"a".repeat(300)}\u0000/..\\x.html`;
    await pageImportStartEndpoint.handler(fileReq(editor, { name, data: Buffer.from("<!doctype html><html><body><p>x</p></body></html>") }, payload));
    const data = (payload.create.mock.calls[0]![0] as { data: { sourceFileName: string; sourceUrl: string } }).data;
    expect(data.sourceFileName.length).toBeLessThanOrEqual(200);
    expect([...data.sourceFileName].some((c) => c.charCodeAt(0) < 32)).toBe(false);
    expect(data.sourceFileName).not.toMatch(/[/\\]/);
    expect(data.sourceUrl).toBe("");
  });

  it("access and budgets apply exactly as for an address", async () => {
    expect((await pageImportStartEndpoint.handler(fileReq({ id: 9, role: "viewer", isActive: true }, { name: "p.mhtml", data: MHTML }))).status).toBe(403);
    const exhausted = makePayload({ imports: [{ costEur: 11, createdBy: editor.id, startedAt: new Date().toISOString() }] });
    const res = await pageImportStartEndpoint.handler(fileReq(editor, { name: "p.mhtml", data: MHTML }, exhausted));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("user-budget-exhausted");
  });
});
