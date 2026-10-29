import { placedImageRefs, prominentForm, serializeImport, type DeviceCheck } from "@trefle/grapesjs-page-import/serialize";
import type { Payload, TaskConfig } from "payload";
import type { Browser } from "playwright-core";

import { GJS_BLOCKS } from "../fields/grapesjs/blocks";
import { sendToErrorSink } from "../hooks/after-error";
import { convertPage, type Convert } from "../lib/import/convert";
import { deviceCheck } from "../lib/import/device-check";
import { mapForm, type FormDefaults, type PageForm } from "../lib/import/form-mapping";
import { importImages, type ImagesInput, type ImagesResult } from "../lib/import/images";
import { IMPORT_ERROR_MESSAGES, ImportError, importErrorCode, type AiSpend, type ImportErrorCode } from "../lib/import/errors";
import { readdir, readFile, rm } from "node:fs/promises";

import { connectBrowser, renderSavedFile, renderSource, type RenderResult } from "../lib/import/render";
import { SAVED_FILES_DIR, readSavedFile, savedFilePath, type SavedFile } from "../lib/import/saved-file";
import { log } from "../lib/log";
import { sweepStaleSiteImports } from "./siteImport";

/**
 * The page import job (012-url-page-import, research R1/R8/R12, data-model.md
 * state machine): render → convert → images → build → check → save, moving one `page-imports` document from `queued` to `completed`,
 * `failed` or `cancelled`.
 *
 * - Between steps (and every `pollMs` during one) it looks at
 *   `cancelRequested` and at the 4-minute deadline (FR-021); either aborts
 *   the running step through its AbortSignal.
 * - It never reads budgets and never stops for budget reasons (FR-027c); the
 *   cost is recorded as soon as the conversion returns, whatever happens next
 *   — including a conversion that fails after the model answered.
 * - The draft page is created as the importing user (`overrideAccess:
 *   false`), so access rules, hooks and the activity log behave exactly as
 *   for a page made by hand.
 * - Any failure: `failed` + errorCode + French message, no page; the error
 *   goes to the error sink with the import id only (no source content).
 * - Media created by the images step belong to the importer and point back
 *   at the import (`importedBy`); a failed or cancelled import deletes them
 *   all, and the stale-import sweep does the same for a lost process.
 */

export type ImportDeps = {
  connect: () => Promise<Browser>;
  render: (browser: Browser, url: string, signal: AbortSignal) => Promise<RenderResult>;
  /** 013: display a page saved from the editor's browser. */
  renderFile: (browser: Browser, file: SavedFile, signal: AbortSignal) => Promise<RenderResult>;
  convert: Convert;
  images: (input: ImagesInput) => Promise<ImagesResult>;
  check: (browser: Browser, html: string, css: string) => Promise<DeviceCheck[]>;
  now: () => number;
  deadlineMs: number;
  pollMs: number;
};

export const IMPORT_DEADLINE_MS = 4 * 60_000;

const defaultDeps: ImportDeps = {
  connect: connectBrowser,
  render: renderSource,
  renderFile: renderSavedFile,
  convert: convertPage,
  images: importImages,
  check: deviceCheck,
  now: Date.now,
  deadlineMs: IMPORT_DEADLINE_MS,
  pollMs: 2_000,
};

type ImportDoc = {
  id: number;
  status: string;
  cancelRequested?: boolean | null;
  sourceKind?: "url" | "file" | null;
  sourceUrl?: string | null;
  sourceFileName?: string | null;
  pageType: "subscription" | "free" | "confirmation";
  title: string;
  domain?: number | { id: number } | null;
  path?: string | null;
  language?: number | { id: number } | null;
  reportLanguage?: "fr" | "en" | null;
  createdBy: number | { id: number };
};

const idOf = (v: number | { id: number } | null | undefined) => (v && typeof v === "object" ? v.id : v ?? undefined);

class Cancelled extends Error {}

export async function runPageImport(payload: Payload, importId: number, overrides: Partial<ImportDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  const read = () =>
    payload.findByID({ collection: "page-imports", id: importId, depth: 0, overrideAccess: true }) as unknown as Promise<ImportDoc>;
  const update = (data: Record<string, unknown>) =>
    payload.update({ collection: "page-imports", id: importId, data, depth: 0, overrideAccess: true });
  const finishedAt = () => new Date(deps.now()).toISOString();
  const costFields = async ({ costUsd, aiModel }: AiSpend) => {
    const settings = (await payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true })) as {
      importUsdToEurRate?: number | null;
    };
    const rate = settings.importUsdToEurRate ?? 0.92;
    return { costUsd: round4(costUsd), costEur: round4(costUsd * rate), aiModel };
  };

  const doc = await read().catch(() => null);
  // Already picked up (autoRun safety net after runByID) or finished: nothing to do.
  if (!doc || doc.status !== "queued") return;
  if (doc.cancelRequested) {
    await update({ status: "cancelled", finishedAt: finishedAt() });
    return;
  }

  const started = deps.now();
  const controller = new AbortController();
  const { signal } = controller;
  const checkpoint = async () => {
    if (deps.now() - started > deps.deadlineMs) controller.abort("timeout");
    else if ((await read()).cancelRequested) controller.abort("cancel");
    if (signal.aborted) throw signal.reason === "cancel" ? new Cancelled() : new ImportError("timeout");
  };
  const step = async (name: string, progress: number, extra: Record<string, unknown> = {}) => {
    await checkpoint();
    await update({ step: name, progress, ...extra });
  };
  const poll = setInterval(() => {
    void checkpoint().catch(() => undefined);
  }, deps.pollMs);

  let browser: Browser | null = null;
  try {
    await update({ status: "running", step: "render", progress: 5 });
    browser = await deps.connect();
    // 013: a page saved from the editor's browser is displayed from its file.
    let saved: SavedFile | null = null;
    if (doc.sourceKind === "file") {
      const bytes = await readFile(savedFilePath(importId)).catch(() => null);
      const read = bytes ? await readSavedFile(bytes, doc.sourceFileName ?? "page.html") : "unsupported";
      if (read === "unsupported") throw new ImportError("not-html", "saved file unreadable");
      saved = read;
    }
    const rendered = saved ? await deps.renderFile(browser, saved, signal) : await deps.render(browser, doc.sourceUrl ?? "", signal);

    await step("convert", 35, { finalUrl: rendered.finalUrl });
    const reportLanguage = doc.reportLanguage === "en" ? "en" : "fr";
    const converted = await deps.convert({ extract: rendered.extract, tiles: rendered.tiles, signal, reportLanguage });
    // Recorded now: this money is spent even if a later step fails.
    await update(await costFields(converted));

    const importer = await payload.findByID({ collection: "users", id: idOf(doc.createdBy)!, depth: 0, overrideAccess: true });

    await step("images", 45);
    const created: number[] = [];
    const refs = placedImageRefs(converted.ir, rendered.extract);
    const images = refs.length
      ? await deps.images({
          refs,
          extract: rendered.extract,
          embedded: rendered.embedded,
          savedResources: saved?.resources,
          signal,
          onCreated: (id) => created.push(id),
          createMedia: async ({ data, name, alt, altPending }) => {
            const media = await payload.create({
              collection: "media",
              user: importer,
              overrideAccess: false,
              depth: 0,
              data: { alt, altPending, importedBy: importId },
              file: { data, name, mimetype: "image/webp", size: data.length },
            });
            return { id: media.id, url: media.url ?? "" };
          },
        })
      : { media: {}, failures: [] };
    if (created.length) await update({ media: created });

    await step("build", 60);
    const out = serializeImport(converted.ir, rendered.extract, {
      pageType: doc.pageType,
      blocks: GJS_BLOCKS,
      finalUrl: rendered.finalUrl,
      media: images.media,
      failedImages: images.failures,
    });
    if (rendered.truncated) {
      out.report.simplified.push({ what: { key: "imports.report.pageEnd" }, how: { key: "imports.report.pageEndHow" } });
    }

    // Subscription page: the source form pre-fills the page's form settings
    // (FR-016) — the one the lead-form block stands for, or, when the
    // conversion placed none, the most prominent one for when the editor adds it.
    let form: PageForm | undefined;
    if (doc.pageType === "subscription") {
      const source = out.leadForm
        ? rendered.extract.forms.find((f) => f.id === out.leadForm)
        : prominentForm(rendered.extract.forms);
      if (source) {
        const defaults = (await payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true })) as FormDefaults;
        const mapped = mapForm(source, defaults);
        form = mapped.form;
        out.report.formFieldsUnmapped = mapped.unmapped;
        out.report.simplified.push(...mapped.simplified);
        out.report.actionsBeforePublish.push(...mapped.actions);
      }
    }

    await step("check", 75);
    out.report.deviceChecks = await deps.check(browser, out.html, out.css);

    await step("save", 90);
    const page = await payload.create({
      collection: "pages",
      user: importer,
      overrideAccess: false,
      depth: 0,
      data: {
        title: doc.title,
        pageType: doc.pageType,
        domain: idOf(doc.domain),
        path: doc.path || undefined,
        language: idOf(doc.language)!,
        status: "draft",
        builder: { projectData: out.projectData, html: out.html, css: out.css },
        ...(form ? { form } : {}),
        importedFrom: importId,
      },
    });
    await update({
      status: "completed",
      step: "save",
      progress: 100,
      page: page.id,
      report: { ...out.report, language: reportLanguage },
      finishedAt: finishedAt(),
    });
  } catch (e) {
    const cancelled = e instanceof Cancelled || signal.reason === "cancel";
    await deleteImportedMedia(payload, importId).catch(() => undefined);
    if (cancelled) {
      await update({ status: "cancelled", finishedAt: finishedAt() }).catch(() => undefined);
    } else {
      const code: ImportErrorCode = signal.reason === "timeout" ? "timeout" : importErrorCode(e);
      // A conversion that answered unusably (refused, truncated, invalid) was still paid for.
      const spent = e instanceof ImportError && e.spent ? await costFields(e.spent).catch(() => ({})) : {};
      await update({
        ...spent,
        status: "failed",
        errorCode: code,
        errorMessage: IMPORT_ERROR_MESSAGES[code],
        finishedAt: finishedAt(),
      }).catch(() => undefined);
      // Unexpected errors keep their message (Payload validation names the
      // field, never the page's content) so they can be diagnosed from logs.
      const detail =
        (code === "internal" || code === "ai-invalid") && e instanceof Error
          ? {
              errorMessage: e.message.slice(0, 300),
              fields: (e as { data?: { errors?: { path?: string; message?: string }[] } }).data?.errors
                ?.map((x) => `${x.path}: ${x.message}`)
                .slice(0, 5),
            }
          : {};
      log.error("page_import_failed", { importId, code, errorName: e instanceof Error ? e.name : "Error", ...detail });
      sendToErrorSink({
        app: "cms",
        release: process.env.RELEASE ?? "dev",
        name: "PageImportFailed",
        importId,
        code,
        at: finishedAt(),
      });
    }
  } finally {
    clearInterval(poll);
    await browser?.close().catch(() => undefined);
    // The uploaded file lives only as long as its import (013 FR-009).
    if (doc.sourceKind === "file") await rm(savedFilePath(importId), { force: true }).catch(() => undefined);
  }
}

/** Removes every Media an unfinished import created (data-model.md `media`). */
async function deleteImportedMedia(payload: Payload, importId: number): Promise<void> {
  // 017 — an unfinished import created no page yet: skip the used-image guard.
  await payload.delete({ collection: "media", where: { importedBy: { equals: importId } }, overrideAccess: true, depth: 0, context: { allowUsedMediaDelete: true } });
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** A `running` import older than this crashed with its process: the sweep fails it. */
export const STALE_RUNNING_MS = 5 * 60_000;
/** A `queued` import nobody picked up for this long is failed too. */
export const STALE_QUEUED_MS = 10 * 60_000;

/** Marks imports left `running`/`queued` by a lost process as `failed` (`timeout`). */
export async function sweepStaleImports(payload: Payload, now: number = Date.now()): Promise<number> {
  const stale = await payload.find({
    collection: "page-imports",
    where: {
      or: [
        {
          and: [
            { status: { equals: "running" } },
            { startedAt: { less_than: new Date(now - STALE_RUNNING_MS).toISOString() } },
          ],
        },
        {
          and: [
            { status: { equals: "queued" } },
            { startedAt: { less_than: new Date(now - STALE_QUEUED_MS).toISOString() } },
          ],
        },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true },
  });
  for (const d of stale.docs) {
    await deleteImportedMedia(payload, d.id);
    await rm(savedFilePath(d.id), { force: true }).catch(() => undefined);
    await payload.update({
      collection: "page-imports",
      id: d.id,
      overrideAccess: true,
      depth: 0,
      data: {
        status: "failed",
        errorCode: "timeout",
        errorMessage: IMPORT_ERROR_MESSAGES.timeout,
        finishedAt: new Date(now).toISOString(),
      },
    });
  }
  await removeOrphanSavedFiles(payload);
  return stale.docs.length;
}

/**
 * 013: uploaded saved pages whose import is over (or gone) — e.g. a process
 * that died between writing the file and running the job.
 */
export async function removeOrphanSavedFiles(payload: Payload): Promise<number> {
  const names = await readdir(SAVED_FILES_DIR).catch(() => [] as string[]);
  const ids = names.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return 0;
  const live = await payload.find({
    collection: "page-imports",
    where: { and: [{ id: { in: ids } }, { status: { in: ["queued", "running"] } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true },
  });
  const keep = new Set(live.docs.map((d) => d.id));
  let removed = 0;
  for (const name of names) {
    if (keep.has(Number(name))) continue;
    await rm(savedFilePath(name), { force: true }).catch(() => undefined);
    removed += 1;
  }
  return removed;
}

export const pageImportTask: TaskConfig<"page-import"> = {
  slug: "page-import",
  label: "Import de page",
  inputSchema: [{ name: "importId", type: "number", required: true }],
  // A failed import is final (the editor retries from the wizard): no retries.
  retries: 0,
  handler: async ({ input, req }) => {
    await runPageImport(req.payload, input.importId);
    return { output: {} };
  },
};

export const pageImportSweepTask: TaskConfig<"page-import-sweep"> = {
  slug: "page-import-sweep",
  label: "Imports de pages bloqués",
  schedule: [{ cron: "* * * * *", queue: "imports" }],
  handler: async ({ req }) => {
    const failed = await sweepStaleImports(req.payload);
    // 015-penpot-site-import — the same minute-by-minute sweep for site imports.
    const sites = await sweepStaleSiteImports(req.payload);
    return { output: { failed, sites } };
  },
};
