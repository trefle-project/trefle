import {
  boardNeeds,
  convertBoard,
  MAX_PAGE_BYTES,
  meaningfulName,
  readPenpotFile,
  slug,
  type BoardNeeds,
  type ConvertResult,
  type PenpotFile,
  type StoredImage,
} from "@trefle/grapesjs-page-import/penpot";
import type { DeviceCheck } from "@trefle/grapesjs-page-import/serialize";
import type { Payload, TaskConfig } from "payload";
import type { Browser } from "playwright-core";

import { sendToErrorSink } from "../hooks/after-error";
import type { Domain } from "../payload-types";
import { FONT_WEIGHTS, FontError, resolveGoogleFamily, type DomainFontRow, type FontRequest } from "../lib/fonts";
import { deviceCheck } from "../lib/import/device-check";
import { normalise } from "../lib/import/images";
import { connectBrowser } from "../lib/import/render";
import { SITE_IMPORT_ERROR_MESSAGES, SiteImportError, pageTooLargeMessage, type SiteImportErrorCode } from "../lib/import/site-errors";
import { listSiteFiles, readSiteFile, removeSiteFile } from "../lib/import/site-files";
import { log } from "../lib/log";

/**
 * The site import job (015-penpot-site-import, research P15, data-model.md):
 * parse → fonts → images → build → check → save, moving one `site-imports`
 * document from `queued` to `completed`, `failed` or `cancelled`. Modelled on
 * 012's `runPageImport` (same checkpoint/step/poll pattern).
 *
 * - Between steps (and every `pollMs` during one) it looks at
 *   `cancelRequested` and at the 6-minute deadline.
 * - No AI and no budget: a site import costs nothing (FR-023).
 * - Pages are created as the importing user (`overrideAccess: false`), one
 *   per ticked board, only once every board is built and checked. A failure
 *   or a cancel deletes the pages and Media this import created (FR-019).
 * - The fonts step is the only change outside the import's own pages and
 *   Media: it adds the Google families the boards use to the domain's fonts
 *   (additions only), through the domain hook that downloads them.
 * - The uploaded file is deleted whatever happens (FR-022).
 */

export type SiteImportDeps = {
  connect: () => Promise<Browser>;
  check: (browser: Browser, html: string, css: string) => Promise<DeviceCheck[]>;
  /** Checks a Google family/weights request (throws FontError); the domain hook then downloads it. */
  resolveFont: (request: FontRequest) => Promise<unknown>;
  normalise: (input: Buffer, displayWidth: number) => Promise<Buffer>;
  /** Above this a page can't be saved by the editor (research P3); tests lower it. */
  maxPageBytes: number;
  now: () => number;
  deadlineMs: number;
  pollMs: number;
};

export const SITE_IMPORT_DEADLINE_MS = 6 * 60_000;

const defaultDeps: SiteImportDeps = {
  connect: connectBrowser,
  check: deviceCheck,
  resolveFont: (request) => resolveGoogleFamily(request),
  normalise,
  maxPageBytes: MAX_PAGE_BYTES,
  now: Date.now,
  deadlineMs: SITE_IMPORT_DEADLINE_MS,
  pollMs: 2_000,
};

type Ref = number | { id: number } | null | undefined;
type BoardRow = { id?: string; boardId: string; name: string; path: string; page?: Ref; report?: unknown };
type SiteImportDoc = {
  id: number;
  status: string;
  cancelRequested?: boolean | null;
  fileName: string;
  penpotPage?: { pageId?: string | null; name?: string | null } | null;
  domain: Ref;
  language: Ref;
  boards?: BoardRow[] | null;
  createdBy: Ref;
  startedAt?: string | null;
};

const idOf = (v: Ref) => (v && typeof v === "object" ? v.id : (v ?? undefined));

class Cancelled extends Error {}

/** « 2026-10-06_18h26 » in Europe/Paris: the page names of one import (research P15). */
export function importStamp(at: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}h${parts.minute}`;
}

export async function runSiteImport(payload: Payload, siteImportId: number, overrides: Partial<SiteImportDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  const read = () =>
    payload.findByID({ collection: "site-imports", id: siteImportId, depth: 0, overrideAccess: true }) as unknown as Promise<SiteImportDoc>;
  const update = (data: Record<string, unknown>) =>
    payload.update({ collection: "site-imports", id: siteImportId, data, depth: 0, overrideAccess: true });
  const finishedAt = () => new Date(deps.now()).toISOString();

  const doc = await read().catch(() => null);
  // Already picked up (autoRun safety net after runByID) or finished: nothing to do.
  if (!doc || doc.status !== "queued") return;
  if (doc.cancelRequested) {
    await removeSiteFile(siteImportId);
    await update({ status: "cancelled", penpotPages: null, finishedAt: finishedAt() });
    return;
  }

  const started = deps.now();
  const controller = new AbortController();
  const { signal } = controller;
  const checkpoint = async () => {
    if (deps.now() - started > deps.deadlineMs) controller.abort("timeout");
    else if ((await read()).cancelRequested) controller.abort("cancel");
    if (signal.aborted) throw signal.reason === "cancel" ? new Cancelled() : new SiteImportError("timeout");
  };
  const step = async (name: string, progress: number) => {
    await checkpoint();
    await update({ step: name, progress });
  };
  const poll = setInterval(() => {
    void checkpoint().catch(() => undefined);
  }, deps.pollMs);

  const createdMedia: number[] = [];
  const createdPages: number[] = [];
  let browser: Browser | null = null;
  try {
    await update({ status: "running", step: "parse", progress: 5 });
    const bytes = await readSiteFile(siteImportId);
    if (!bytes) throw new SiteImportError("expired");
    const file = readPenpotFile(new Uint8Array(bytes));
    const pageId = doc.penpotPage?.pageId ?? "";
    const rows = doc.boards ?? [];
    if (!rows.length || !file.pages.some((p) => p.id === pageId)) throw new SiteImportError("invalid-input");
    const needs = boardNeeds(
      file,
      pageId,
      rows.map((r) => r.boardId),
    );
    const importer = await payload.findByID({ collection: "users", id: idOf(doc.createdBy)!, depth: 0, overrideAccess: true });

    await step("fonts", 15);
    const fonts = await addDomainFonts(payload, idOf(doc.domain)!, needs, deps.resolveFont);

    await step("images", 25);
    const images: Record<string, StoredImage | null> = {};
    for (const [i, need] of needs.images.entries()) {
      if (i > 0) await checkpoint();
      images[need.mediaId] = await storeImage(file, need, deps.normalise, async ({ data, name, alt, altPending }) => {
        const media = await payload.create({
          collection: "media",
          user: importer,
          overrideAccess: false,
          depth: 0,
          data: { alt, altPending },
          file: { data, name, mimetype: "image/webp", size: data.length },
        });
        createdMedia.push(media.id);
        return media.url ?? "";
      });
    }
    if (createdMedia.length) await update({ media: createdMedia });

    await step("build", 55);
    const ctx = {
      paths: Object.fromEntries(rows.map((r) => [r.boardId, r.path])),
      images,
      fonts: fonts.families,
      fileName: doc.fileName,
    };
    const built: ConvertResult[] = [];
    for (const row of rows) {
      const out = convertBoard(file, pageId, row.boardId, ctx);
      if (out.bytes > deps.maxPageBytes) throw new SiteImportError("page-too-large", pageTooLargeMessage(row.name));
      if (fonts.added.length) {
        out.report.simplified.push({ what: { key: "imports.report.fontsAdded" }, how: fonts.added.join(", ") });
      }
      built.push(out);
    }

    await step("check", 65);
    browser = await deps.connect();
    for (const [i, out] of built.entries()) {
      if (i > 0) await step("check", 65 + Math.round((25 * i) / built.length));
      out.report.deviceChecks = await deps.check(browser, out.html, out.css);
    }

    await step("save", 90);
    const stamp = importStamp(doc.startedAt ? Date.parse(doc.startedAt) : started);
    for (const [i, row] of rows.entries()) {
      const out = built[i]!;
      const page = await payload.create({
        collection: "pages",
        user: importer,
        overrideAccess: false,
        depth: 0,
        data: {
          title: `${row.name}_${stamp}`,
          pageType: "free",
          domain: idOf(doc.domain),
          path: row.path,
          language: idOf(doc.language)!,
          status: "draft",
          builder: { projectData: out.projectData, html: out.html, css: out.css },
          seo: { metaTitle: row.name },
          siteImport: siteImportId,
        },
      });
      createdPages.push(page.id);
    }
    // The last chance to cancel: after this the pages are the import's result.
    await checkpoint();
    await update({
      status: "completed",
      step: "save",
      progress: 100,
      boards: rows.map((r, i) => ({ ...r, page: createdPages[i], report: built[i]!.report })),
      penpotPages: null,
      finishedAt: finishedAt(),
    });
  } catch (e) {
    const cancelled = e instanceof Cancelled || signal.reason === "cancel";
    await deleteCreated(payload, createdPages, createdMedia).catch(() => undefined);
    if (cancelled) {
      await update({ status: "cancelled", penpotPages: null, finishedAt: finishedAt() }).catch(() => undefined);
    } else {
      const code: SiteImportErrorCode =
        signal.reason === "timeout" ? "timeout" : e instanceof SiteImportError ? e.code : "internal";
      const message = e instanceof SiteImportError ? e.userMessage : SITE_IMPORT_ERROR_MESSAGES[code];
      await update({
        status: "failed",
        errorCode: code,
        errorMessage: message,
        penpotPages: null,
        finishedAt: finishedAt(),
      }).catch(() => undefined);
      // Unexpected errors keep their message (Payload validation names the
      // field, never the file's content) so they can be diagnosed from logs.
      const detail =
        code === "internal" && e instanceof Error
          ? {
              errorMessage: e.message.slice(0, 300),
              fields: (e as { data?: { errors?: { path?: string; message?: string }[] } }).data?.errors
                ?.map((x) => `${x.path}: ${x.message}`)
                .slice(0, 5),
            }
          : {};
      log.error("site_import_failed", { siteImportId, code, errorName: e instanceof Error ? e.name : "Error", ...detail });
      sendToErrorSink({
        app: "cms",
        release: process.env.RELEASE ?? "dev",
        name: "SiteImportFailed",
        siteImportId,
        code,
        at: finishedAt(),
      });
    }
  } finally {
    clearInterval(poll);
    await browser?.close().catch(() => undefined);
    await removeSiteFile(siteImportId);
  }
}

/** One Penpot image → one Media item (WebP ≤ 500 KB), or null when it can't be stored (placeholder + report). */
async function storeImage(
  file: PenpotFile,
  need: BoardNeeds["images"][number],
  normaliseImage: SiteImportDeps["normalise"],
  create: (media: { data: Buffer; name: string; alt: string; altPending: boolean }) => Promise<string>,
): Promise<StoredImage | null> {
  const entry = file.media(need.mediaId);
  if (!entry?.bytes?.length) return null;
  let data: Buffer;
  try {
    data = await normaliseImage(Buffer.from(entry.bytes), need.displayWidth);
  } catch {
    return null;
  }
  // The layer's name when it says something, never a file name (012 FR-013).
  const alt = meaningfulName(need.name) ?? "";
  const url = await create({ data, name: `${slug(alt || "image") || "image"}.webp`, alt, altPending: !alt });
  return { url, alt, altPending: !alt };
}

/**
 * The fonts step (research P8, T044): adds the Google families, weights and
 * italics the boards use to the domain's « Polices du domaine », never
 * removing or reducing a row. A family or weight Google doesn't know is left
 * out (the converter substitutes it); Google unreachable fails the import
 * before anything is created. Returns the families the pages may use.
 */
export async function addDomainFonts(
  payload: Payload,
  domainId: number,
  needs: BoardNeeds,
  resolveFont: SiteImportDeps["resolveFont"],
): Promise<{ families: Set<string>; added: string[] }> {
  const domain = (await payload.findByID({ collection: "domains", id: domainId, depth: 0, overrideAccess: true })) as {
    fonts?: DomainFontRow[] | null;
  };
  const rows: DomainFontRow[] = (domain.fonts ?? []).map((r) => ({
    ...r,
    files: (r.files ?? []).map((f) => (typeof f === "object" ? f.id : f)),
  }));
  const byFamily = new Map(rows.filter((r) => r.family).map((r) => [r.family!.trim().toLowerCase(), r]));

  const wanted = new Map<string, { family: string; weights: Set<number>; italic: boolean }>();
  for (const f of needs.fonts) {
    if (!f.googleFamily) continue;
    const weight = (FONT_WEIGHTS as readonly number[]).includes(f.weight) ? f.weight : 400;
    const key = f.googleFamily.toLowerCase();
    const w = wanted.get(key) ?? { family: f.googleFamily, weights: new Set<number>(), italic: false };
    w.weights.add(weight);
    w.italic ||= f.style === "italic";
    wanted.set(key, w);
  }

  const families = new Set(rows.map((r) => r.family!.trim()).filter(Boolean));
  const added: string[] = [];
  let changed = false;
  for (const [key, w] of wanted) {
    const row = byFamily.get(key);
    const have = new Set((row?.weights ?? []).map(Number));
    const missing = [...w.weights].filter((x) => !have.has(x));
    const italic = Boolean(row?.italic) || w.italic;
    if (row && !missing.length && italic === Boolean(row.italic)) {
      families.add(w.family);
      continue;
    }
    let weights = [...new Set([...have, ...w.weights])].sort((a, b) => a - b);
    try {
      await resolveFont({ family: w.family, weights, italic });
    } catch (e) {
      if (!(e instanceof FontError) || e.kind === "network") throw new SiteImportError("fonts-unavailable");
      if (e.kind === "family") {
        if (row) families.add(w.family);
        continue;
      }
      // Some weights don't exist for this family: keep the others.
      weights = weights.filter((x) => have.has(x) || !e.weights.includes(x));
      if (weights.length === have.size && italic === Boolean(row?.italic)) {
        if (row) families.add(w.family);
        continue;
      }
    }
    if (row) {
      row.weights = weights.map(String);
      row.italic = italic;
    } else {
      rows.push({ family: w.family, weights: weights.map(String), italic });
    }
    families.add(w.family);
    added.push(w.family);
    changed = true;
  }

  if (changed) {
    try {
      await payload.update({
        collection: "domains",
        id: domainId,
        data: { fonts: rows as NonNullable<Domain["fonts"]> },
        depth: 0,
        overrideAccess: true,
      });
    } catch (e) {
      // The hook re-resolves what was just checked: a refusal now means Google stopped answering.
      if ((e as { name?: string }).name === "ValidationError") throw new SiteImportError("fonts-unavailable");
      throw e;
    }
  }
  return { families, added };
}

/** Removes the pages and Media an unfinished import created (FR-019). */
async function deleteCreated(payload: Payload, pages: number[], media: number[]): Promise<void> {
  if (pages.length) {
    await payload.delete({ collection: "pages", where: { id: { in: pages } }, overrideAccess: true, depth: 0 });
  }
  if (media.length) {
    // 017 — the import's own pages, deleted just above: skip the used-image guard.
    await payload.delete({ collection: "media", where: { id: { in: media } }, overrideAccess: true, depth: 0, context: { allowUsedMediaDelete: true } });
  }
}

/** A `running` site import older than this crashed with its process (deadline 6 min + margin). */
export const SITE_STALE_RUNNING_MS = 8 * 60_000;
/** A `queued` site import nobody picked up for this long is failed too. */
export const SITE_STALE_QUEUED_MS = 10 * 60_000;
/** An analysis nobody started within this time is abandoned and its file removed (research P12). */
export const SITE_ANALYSIS_TTL_MS = 60 * 60_000;

/**
 * Site imports left behind (T027): `running`/`queued` by a lost process →
 * `failed` (`timeout`) with their pages and Media removed; `analysed` for
 * over an hour → `abandoned`; files on disk with no live import → removed.
 */
export async function sweepStaleSiteImports(payload: Payload, now: number = Date.now()): Promise<number> {
  const before = (ms: number) => new Date(now - ms).toISOString();
  const stale = await payload.find({
    collection: "site-imports",
    where: {
      or: [
        { and: [{ status: { equals: "running" } }, { startedAt: { less_than: before(SITE_STALE_RUNNING_MS) } }] },
        { and: [{ status: { equals: "queued" } }, { startedAt: { less_than: before(SITE_STALE_QUEUED_MS) } }] },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true, media: true },
  });
  for (const d of stale.docs) {
    const pages = await payload.find({
      collection: "pages",
      where: { siteImport: { equals: d.id } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { path: true },
    });
    const media = ((d as { media?: Ref[] | null }).media ?? []).map(idOf).filter((x): x is number => typeof x === "number");
    await deleteCreated(
      payload,
      pages.docs.map((p) => p.id),
      media,
    );
    await removeSiteFile(d.id);
    await payload.update({
      collection: "site-imports",
      id: d.id,
      overrideAccess: true,
      depth: 0,
      data: {
        status: "failed",
        errorCode: "timeout",
        errorMessage: SITE_IMPORT_ERROR_MESSAGES.timeout,
        penpotPages: null,
        finishedAt: new Date(now).toISOString(),
      },
    });
  }

  const abandoned = await payload.find({
    collection: "site-imports",
    where: { and: [{ status: { equals: "analysed" } }, { createdAt: { less_than: before(SITE_ANALYSIS_TTL_MS) } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true },
  });
  for (const d of abandoned.docs) {
    await removeSiteFile(d.id);
    await payload.update({
      collection: "site-imports",
      id: d.id,
      overrideAccess: true,
      depth: 0,
      data: { status: "abandoned", penpotPages: null, finishedAt: new Date(now).toISOString() },
    });
  }

  await removeOrphanSiteFiles(payload);
  return stale.docs.length + abandoned.docs.length;
}

/** Uploaded `.penpot` files whose import is over (or gone). */
export async function removeOrphanSiteFiles(payload: Payload): Promise<number> {
  const ids = await listSiteFiles();
  if (!ids.length) return 0;
  const live = await payload.find({
    collection: "site-imports",
    where: { and: [{ id: { in: ids } }, { status: { in: ["analysed", "queued", "running"] } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true },
  });
  const keep = new Set(live.docs.map((d) => d.id));
  let removed = 0;
  for (const id of ids) {
    if (keep.has(id)) continue;
    await removeSiteFile(id);
    removed += 1;
  }
  return removed;
}

export const siteImportTask: TaskConfig<"site-import"> = {
  slug: "site-import",
  label: "Import de site Penpot",
  inputSchema: [{ name: "siteImportId", type: "number", required: true }],
  // A failed import is final (the editor retries from the wizard): no retries.
  retries: 0,
  handler: async ({ input, req }) => {
    await runSiteImport(req.payload, input.siteImportId);
    return { output: {} };
  },
};
