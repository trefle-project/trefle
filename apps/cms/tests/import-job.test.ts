import type { ImportIR } from "@trefle/grapesjs-page-import/ir";
import type { PageExtract } from "@trefle/grapesjs-page-import/serialize";
import type { Browser } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { removeOrphanSavedFiles, runPageImport, sweepStaleImports, type ImportDeps } from "../src/jobs/pageImport";
import { SAVED_FILES_DIR, savedFilePath } from "../src/lib/import/saved-file";
import { ImportError } from "../src/lib/import/errors";
import { reportLine } from "../src/lib/import/report-text";

/** A report line as its French text (023: Trefle's lines are keyed). */
const fr = (line: Parameters<typeof reportLine>[0]) => reportLine(line, "fr");

/**
 * 012-url-page-import (T029, data-model.md state machine) — the job with a
 * fake render, conversion and device check over an in-memory Payload.
 */
const box = { x: 0, y: 0, width: 100, height: 20 };
const EXTRACT: PageExtract = {
  url: "https://exemple.fr/",
  viewport: { width: 1440, height: 900 },
  texts: [
    { id: "t1", tag: "h1", html: "Bienvenue", box, style: {} },
    { id: "t2", tag: "p", html: "Du texte.", box, style: {} },
  ],
  images: [
    { id: "i1", kind: "img", candidates: ["https://exemple.fr/a.jpg"], alt: "Un potager", box },
    { id: "i2", kind: "img", candidates: ["https://exemple.fr/b.jpg"], alt: null, box },
  ],
  forms: [],
  unsupported: [],
  fonts: [],
};
const IR: ImportIR = {
  sourceHadMobileLayout: false,
  simplified: [],
  omitted: [],
  sections: [
    {
      source: "Héros",
      rows: [
        {
          kind: "blocks",
          blocks: [
            { kind: "hero", heading: "t1", headingLevel: 1, text: ["t2"] },
            { kind: "image", image: "i1" },
            { kind: "image", image: "i2" },
          ],
        },
      ],
    },
  ],
};

type Doc = Record<string, unknown> & { id: number };

function setup(importOver: Record<string, unknown> = {}, options: { failCreate?: boolean } = {}) {
  const imports = new Map<number, Doc>([
    [
      7,
      {
        id: 7,
        status: "queued",
        cancelRequested: false,
        sourceUrl: "https://exemple.fr/",
        pageType: "free",
        title: "Import test",
        language: 1,
        createdBy: 3,
        ...importOver,
      },
    ],
  ]);
  const pages: Doc[] = [];
  const media = new Map<number, Doc>();
  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
      if (collection === "page-imports") return { ...imports.get(id)! };
      if (collection === "users") return { id, role: "editor", isActive: true };
      throw new Error(`unexpected findByID ${collection}`);
    }),
    update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
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
        const doc = { id, url: `/api/media/file/m${id}.webp`, ...data };
        media.set(id, doc);
        return doc;
      }
      expect(collection).toBe("pages");
      if (options.failCreate) throw new Error("validation failed");
      const page = { id: 100 + pages.length, ...data };
      pages.push(page);
      return page;
    }),
    delete: vi.fn(async ({ collection, where }: { collection: string; where: { importedBy: { equals: number } } }) => {
      expect(collection).toBe("media");
      for (const [id, doc] of media) if (doc.importedBy === where.importedBy.equals) media.delete(id);
      return { docs: [], errors: [] };
    }),
    findGlobal: vi.fn(async () => ({ importUsdToEurRate: 0.9, importMonthlyCapEur: 0.01 })),
    find: vi.fn(async () => {
      throw new Error("the job must not query imports (no budget reads)");
    }),
  };
  const close = vi.fn(async () => undefined);
  let clock = 1_000_000;
  const deps: Partial<ImportDeps> = {
    connect: async () => ({ close }) as unknown as Browser,
    render: vi.fn(async () => ({ finalUrl: "https://exemple.fr/accueil", extract: EXTRACT, tiles: [], truncated: false, embedded: new Map() })),
    convert: vi.fn(async () => ({ ir: IR, costUsd: 5, aiModel: "claude-opus-5" })),
    // Stores one Media per ref through the job's own createMedia, like the real step.
    images: vi.fn<ImportDeps["images"]>(async ({ refs, createMedia, onCreated }) => {
      const out: Awaited<ReturnType<ImportDeps["images"]>> = { media: {}, failures: [] };
      for (const ref of refs) {
        const alt = ref === "i1" ? "Un potager" : "";
        const doc = await createMedia({ data: Buffer.from(ref), name: `${ref}.webp`, alt, altPending: alt === "" });
        onCreated(doc.id);
        out.media[ref] = { url: doc.url, alt, altPending: alt === "" };
      }
      return out;
    }),
    check: vi.fn(async () => [{ device: "mobilePortrait" as const, kind: "small-text" as const, where: "hero", detail: "12px" }]),
    now: () => clock,
    pollMs: 60_000,
  };
  return {
    payload,
    imports,
    pages,
    media,
    deps,
    close,
    advance: (ms: number) => {
      clock += ms;
    },
    doc: () => imports.get(7)!,
  };
}

describe("runPageImport — happy path", () => {
  it("creates the draft page as the importer, stores report and cost, completes", async () => {
    const t = setup();
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.pages).toHaveLength(1);
    expect(t.pages[0]).toMatchObject({ title: "Import test", pageType: "free", status: "draft", importedFrom: 7, language: 1 });
    expect((t.pages[0]!.builder as { html: string }).html).toContain("Bienvenue");
    expect(t.doc()).toMatchObject({
      status: "completed",
      progress: 100,
      page: 100,
      finalUrl: "https://exemple.fr/accueil",
      costUsd: 5,
      costEur: 4.5,
      aiModel: "claude-opus-5",
    });
    expect((t.doc().report as { deviceChecks: unknown[] }).deviceChecks).toHaveLength(1);
    expect(t.doc().finishedAt).toBeTruthy();
    expect(t.close).toHaveBeenCalled();
  });

  it.each([
    [undefined, "fr"],
    ["fr", "fr"],
    ["en", "en"],
  ] as const)("asks the AI for its lines in the launcher's language (stored %s) and records it on the report (T053)", async (stored, lang) => {
    const t = setup(stored ? { reportLanguage: stored } : {});
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.deps.convert).toHaveBeenCalledWith(expect.objectContaining({ reportLanguage: lang }));
    expect((t.doc().report as { language: string }).language).toBe(lang);
  });

  it("completes and records the full cost even past every budget (never reads budgets)", async () => {
    const t = setup();
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe("completed");
    expect(t.doc().costEur).toBe(4.5);
    expect(t.payload.find).not.toHaveBeenCalled();
  });

  it("does nothing for an import that is not queued any more", async () => {
    const t = setup({ status: "running" });
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.payload.update).not.toHaveBeenCalled();
    expect(t.deps.render).not.toHaveBeenCalled();
  });
});

describe("runPageImport — images (User Story 2)", () => {
  it("stores placed images as the importer's Media, uses their URLs, links them to the import", async () => {
    const t = setup();
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.deps.images).toHaveBeenCalledWith(expect.objectContaining({ refs: ["i1", "i2"] }));
    expect(t.doc()).toMatchObject({ status: "completed", media: [500, 501] });
    for (const m of t.media.values()) expect(m.importedBy).toBe(7);
    expect(t.media.get(501)).toMatchObject({ alt: "", altPending: true });
    const html = (t.pages[0]!.builder as { html: string }).html;
    expect(html).toContain('src="/api/media/file/m500.webp" alt="Un potager"');
    expect(html).toContain('src="/api/media/file/m501.webp" alt=""');
    expect((t.doc().report as { actionsBeforePublish: Parameters<typeof fr>[0][] }).actionsBeforePublish.map(fr)).toContain(
      "Décrire l'image marquée « À décrire » dans la médiathèque",
    );
  });

  it("reports the images step's failures", async () => {
    const t = setup();
    (t.deps.images as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      media: {},
      failures: [{ sourceUrl: "https://exemple.fr/a.jpg", reason: "unreachable" }],
    });
    await runPageImport(t.payload as never, 7, t.deps);
    expect((t.doc().report as { failedImages: unknown[] }).failedImages).toEqual([
      { sourceUrl: "https://exemple.fr/a.jpg", reason: "unreachable" },
    ]);
  });

  it.each([
    ["a failure at build/check", (t: ReturnType<typeof setup>) => (t.deps.check as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom")), "failed"],
    ["a failure at save", (t: ReturnType<typeof setup>) => (t.payload.create as ReturnType<typeof vi.fn>).mockImplementation(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (collection === "pages") throw new Error("validation failed");
      const doc = { id: 600 + t.media.size, url: "/x.webp", ...data };
      t.media.set(doc.id, doc);
      return doc;
    }), "failed"],
    ["a cancel after the images step", (t: ReturnType<typeof setup>) => (t.deps.check as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      t.imports.set(7, { ...t.imports.get(7)!, cancelRequested: true });
      return [];
    }), "cancelled"],
  ] as const)("%s deletes every Media the import created", async (_, arrange, status) => {
    const t = setup();
    arrange(t);
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe(status);
    expect(t.media.size).toBe(0);
    expect(t.pages).toHaveLength(0);
  });

  it("skips the images step when the IR places no image", async () => {
    const t = setup();
    (t.deps.convert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ir: { ...IR, sections: [{ source: "Héros", rows: [{ kind: "blocks", blocks: [{ kind: "hero", heading: "t1", headingLevel: 1 }] }] }] },
      costUsd: 5,
      aiModel: "claude-opus-5",
    });
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.deps.images).not.toHaveBeenCalled();
    expect(t.doc().status).toBe("completed");
  });
});

describe("runPageImport — lead form (User Story 4)", () => {
  const withForm = (t: ReturnType<typeof setup>) => {
    const extract: PageExtract = {
      ...EXTRACT,
      forms: [
        {
          id: "f1",
          box,
          submitLabel: "Je m'inscris",
          fields: [
            { name: "email", label: "Votre email", type: "email", required: true },
            { name: "prenom", label: "Votre prénom", type: "text", required: false },
            { name: "cv", label: "CV", type: "file", required: false },
          ],
        },
      ],
    };
    (t.deps.render as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ finalUrl: "https://exemple.fr/", extract, tiles: [], truncated: false, embedded: new Map() });
    const ir: ImportIR = {
      ...IR,
      sections: [...IR.sections, { source: "Inscription", rows: [{ kind: "blocks", blocks: [{ kind: "lead-form", form: "f1" }] }] }],
    };
    (t.deps.convert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ir, costUsd: 5, aiModel: "claude-opus-5" });
    t.payload.findGlobal.mockResolvedValue({
      importUsdToEurRate: 0.9,
      defaultConsentPurposeText: "J'accepte d'être recontacté(e).",
      defaultPrivacyNoticeUrl: "/privacy",
      defaultPrivacyNoticeVersion: "2026-01",
    } as never);
  };

  it("a subscription page gets the lead-form block and its form fields pre-filled from the source form", async () => {
    const t = setup({ pageType: "subscription" });
    withForm(t);
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe("completed");
    const page = t.pages[0]!;
    expect((page.builder as { html: string }).html).toContain('<div data-block="lead-form" id="form"></div>');
    expect(page.form).toMatchObject({
      fields: [
        { name: "email", label: "Votre email", type: "email", required: true },
        { name: "prenom", label: "Votre prénom", type: "text", required: false },
      ],
      submitLabel: "Je m'inscris",
      consentPurposeText: "J'accepte d'être recontacté(e).",
      privacyNoticeUrl: "/privacy",
      privacyNoticeVersion: "2026-01",
    });
    const report = t.doc().report as { formFieldsUnmapped: string[]; actionsBeforePublish: string[] };
    expect(report.formFieldsUnmapped?.map(fr)).toEqual(["CV (file)"]);
    expect(report.actionsBeforePublish.map(fr)).toContain("Rédiger le message affiché après l'envoi du formulaire");
  });

  it("a free page gets neither the block nor form settings", async () => {
    const t = setup({ pageType: "free" });
    withForm(t);
    await runPageImport(t.payload as never, 7, t.deps);
    const page = t.pages[0]!;
    expect((page.builder as { html: string }).html).not.toContain("lead-form");
    expect(page.form).toBeUndefined();
  });
});

describe("runPageImport — saved file (013)", () => {
  const writeSaved = (id: number, html = "<!doctype html><html><body><h1>Bienvenue</h1></body></html>") => {
    mkdirSync(SAVED_FILES_DIR, { recursive: true });
    writeFileSync(savedFilePath(id), html);
  };
  const withRenderFile = (t: ReturnType<typeof setup>) => {
    t.deps.renderFile = vi.fn(async () => ({ finalUrl: "https://exemple.fr/", extract: EXTRACT, tiles: [], truncated: false, embedded: new Map() }));
  };

  it("displays the saved page from its file, not from the network, and removes the file", async () => {
    const t = setup({ sourceKind: "file", sourceFileName: "page.html", sourceUrl: "" });
    withRenderFile(t);
    writeSaved(7);
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe("completed");
    expect(t.deps.renderFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "html" }), expect.anything());
    expect(t.deps.render).not.toHaveBeenCalled();
    expect(existsSync(savedFilePath(7))).toBe(false);
  });

  it.each([
    ["a failure", (t: ReturnType<typeof setup>) => (t.deps.convert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ImportError("ai-invalid")), "failed"],
    ["a cancel", (t: ReturnType<typeof setup>) => (t.deps.convert as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      t.imports.set(7, { ...t.imports.get(7)!, cancelRequested: true });
      return { ir: IR, costUsd: 1, aiModel: "claude-opus-5" };
    }), "cancelled"],
    ["the deadline", (t: ReturnType<typeof setup>) => (t.deps.convert as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      t.advance(5 * 60_000);
      return { ir: IR, costUsd: 1, aiModel: "claude-opus-5" };
    }), "failed"],
  ] as const)("the file is removed after %s too", async (_, arrange, status) => {
    const t = setup({ sourceKind: "file", sourceFileName: "page.html", sourceUrl: "" });
    withRenderFile(t);
    arrange(t);
    writeSaved(7);
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe(status);
    expect(existsSync(savedFilePath(7))).toBe(false);
  });

  it("an unreadable saved file fails the import as not-html", async () => {
    const t = setup({ sourceKind: "file", sourceFileName: "page.html", sourceUrl: "" });
    withRenderFile(t);
    writeSaved(7, "%PDF-1.7 pas une page");
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "not-html" });
    expect(existsSync(savedFilePath(7))).toBe(false);
  });

  it("the sweep removes files whose import is over or gone, and keeps those of running imports", async () => {
    writeSaved(9001);
    writeSaved(9002);
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: 9002, status: "running" }] })),
    };
    const removed = await removeOrphanSavedFiles(payload as never);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(savedFilePath(9001))).toBe(false);
    expect(existsSync(savedFilePath(9002))).toBe(true);
    await removeOrphanSavedFiles({ find: vi.fn(async () => ({ docs: [] })) } as never);
    expect(existsSync(savedFilePath(9002))).toBe(false);
  });
});

describe("runPageImport — failures", () => {
  it.each([
    ["render", "unreachable"],
    ["render", "private-address"],
    ["convert", "ai-invalid"],
  ] as const)("a %s failure (%s) fails the import with its French message, no page", async (stepName, code) => {
    const t = setup();
    (t.deps[stepName] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ImportError(code));
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.pages).toHaveLength(0);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: code });
    expect(String(t.doc().errorMessage)).toMatch(/[a-zé]/);
    expect(t.close).toHaveBeenCalled();
  });

  it.each(["ai-refused", "ai-invalid"] as const)(
    "a conversion that answered but failed (%s) still records what it cost",
    async (code) => {
      const t = setup();
      (t.deps.convert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ImportError(code, "detail", { costUsd: 2, aiModel: "claude-opus-4-8" }),
      );
      await runPageImport(t.payload as never, 7, t.deps);
      expect(t.pages).toHaveLength(0);
      expect(t.doc()).toMatchObject({ status: "failed", errorCode: code, costUsd: 2, costEur: 1.8, aiModel: "claude-opus-4-8" });
    },
  );

  it("an unexpected error in the device check or at save is `internal`, no page", async () => {
    const a = setup();
    (a.deps.check as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    await runPageImport(a.payload as never, 7, a.deps);
    expect(a.doc()).toMatchObject({ status: "failed", errorCode: "internal" });
    expect(a.doc().costEur).toBe(4.5); // spent before the failure: still recorded

    const b = setup({}, { failCreate: true });
    await runPageImport(b.payload as never, 7, b.deps);
    expect(b.pages).toHaveLength(0);
    expect(b.doc()).toMatchObject({ status: "failed", errorCode: "internal" });
  });
});

describe("runPageImport — cancel and deadline", () => {
  it("a cancel requested before the job starts ends `cancelled` without rendering", async () => {
    const t = setup({ cancelRequested: true });
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe("cancelled");
    expect(t.deps.render).not.toHaveBeenCalled();
  });

  it("a cancel requested during a step ends `cancelled` at the next checkpoint, no page", async () => {
    const t = setup();
    (t.deps.render as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      t.imports.set(7, { ...t.doc(), cancelRequested: true });
      return { finalUrl: "https://exemple.fr/", extract: EXTRACT, tiles: [], truncated: false, embedded: new Map() };
    });
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc().status).toBe("cancelled");
    expect(t.pages).toHaveLength(0);
    expect(t.deps.convert).not.toHaveBeenCalled();
  });

  it("passing the 4-minute deadline fails the import with `timeout`", async () => {
    const t = setup();
    (t.deps.render as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      t.advance(4 * 60_000 + 1);
      return { finalUrl: "https://exemple.fr/", extract: EXTRACT, tiles: [], truncated: false, embedded: new Map() };
    });
    await runPageImport(t.payload as never, 7, t.deps);
    expect(t.doc()).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect(t.pages).toHaveLength(0);
  });
});

describe("sweepStaleImports", () => {
  it("fails running imports older than 5 minutes and queued ones older than 10", async () => {
    const updates: unknown[] = [];
    const payload = {
      find: vi.fn(async ({ where }: { where: unknown }) => {
        if (JSON.stringify(where).includes('"in"')) return { docs: [] }; // orphan saved files (013)
        expect(JSON.stringify(where)).toContain("2026-09-27T11:55:00.000Z"); // now − 5 min
        expect(JSON.stringify(where)).toContain("2026-09-27T11:50:00.000Z"); // now − 10 min
        return { docs: [{ id: 1 }, { id: 2 }] };
      }),
      update: vi.fn(async (args: unknown) => updates.push(args)),
      delete: vi.fn(async () => ({ docs: [], errors: [] })),
    };
    const n = await sweepStaleImports(payload as never, Date.parse("2026-09-27T12:00:00Z"));
    expect(n).toBe(2);
    expect(updates[0]).toMatchObject({ id: 1, data: { status: "failed", errorCode: "timeout" } });
    // Media a lost process created are removed with the import.
    expect(payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: "media", where: { importedBy: { equals: 1 } } }));
    expect(payload.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { importedBy: { equals: 2 } } }));
  });
});
