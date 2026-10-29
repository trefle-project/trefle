import { existsSync } from "node:fs";

import type { Endpoint } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { validatePagePath } from "../hooks/pages-path-validate";
import { adminText } from "../i18n";
import { MAX_BOARDS_PER_IMPORT, siteImportErrorMessage } from "../lib/import/site-errors";
import { siteFilePath } from "../lib/import/site-files";
import { penpotImportEnabled } from "./siteImportAnalyse";

/**
 * POST /api/site-imports/:id/start (015-penpot-site-import,
 * contracts/site-import-api.md): the chosen Penpot page, language and ticked
 * boards with their addresses. The domain was fixed at analysis and cannot
 * change here. Validated, stored, then the `site-import` job is queued and
 * started without waiting (012 pattern).
 */
type Body = { penpotPageId?: unknown; language?: unknown; boards?: unknown };
type AnalysedPage = { id: string; name: string; boards: { id: string; name: string }[] };

const invalid = (message: string) => Response.json({ errors: [{ code: "invalid-input", message }] }, { status: 400 });

export const siteImportStartEndpoint: Endpoint = {
  path: "/:id/start",
  method: "post",
  handler: async (req) => {
    if (!penpotImportEnabled()) return new Response(null, { status: 404 });
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const lang = req.i18n?.language;
    const t = adminText(lang);
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id)) return new Response(null, { status: 404 });

    const doc = await req.payload.findByID({ collection: "site-imports", id, depth: 0, overrideAccess: true }).catch(() => null);
    if (!doc) return new Response(null, { status: 404 });
    const creator = typeof doc.createdBy === "object" ? doc.createdBy.id : doc.createdBy;
    if (creator !== req.user.id && !isAdmin({ req } as never)) return new Response(null, { status: 403 });
    if (doc.status !== "analysed") {
      return Response.json({ errors: [{ code: "already-started", message: t("imports.alreadyStarted") }] }, { status: 409 });
    }
    if (!existsSync(siteFilePath(id))) {
      return Response.json({ errors: [{ code: "expired", message: siteImportErrorMessage("expired", lang) }] }, { status: 410 });
    }

    const body = ((await req.json?.().catch(() => null)) ?? {}) as Body;
    const pages = (doc.penpotPages ?? []) as AnalysedPage[];
    const page = pages.find((p) => p.id === body.penpotPageId);
    if (!page) return invalid(t("imports.choosePenpotPage"));

    const rows = Array.isArray(body.boards) ? (body.boards as { id?: unknown; path?: unknown }[]) : [];
    if (!rows.length) return invalid(t("imports.tickOneBoard"));
    if (rows.length > MAX_BOARDS_PER_IMPORT) return invalid(t("imports.tooManyBoards"));
    const seen = new Set<string>();
    const paths = new Map<string, string>();
    const boards: { boardId: string; name: string; path: string }[] = [];
    for (const row of rows) {
      const b = page.boards.find((x) => x.id === row.id);
      if (!b || seen.has(b.id)) return invalid(t("imports.unknownBoard"));
      seen.add(b.id);
      const raw = typeof row.path === "string" ? row.path.trim() : "";
      const path = raw.startsWith("/") ? raw : `/${raw}`;
      if (/[\s?#]/.test(path)) return invalid(t("imports.boardAddressProblem", { name: b.name, problem: t("imports.pathChars") }));
      const ok = validatePagePath(path);
      if (ok !== true) return invalid(t("imports.boardAddressProblem", { name: b.name, problem: ok }));
      if (paths.has(path)) return invalid(t("imports.samePath", { a: b.name, b: paths.get(path) ?? "", path }));
      paths.set(path, b.name);
      boards.push({ boardId: b.id, name: b.name, path });
    }

    const domainId = typeof doc.domain === "object" ? doc.domain?.id : doc.domain;
    const domain = domainId ? await req.payload.findByID({ collection: "domains", id: domainId, depth: 0, overrideAccess: true }).catch(() => null) : null;
    if (!domain?.isActive) {
      return Response.json({ errors: [{ code: "invalid-input", message: t("imports.domainInactive") }] }, { status: 409 });
    }
    const languageId = Number(body.language);
    const language = Number.isInteger(languageId)
      ? await req.payload.findByID({ collection: "languages", id: languageId, depth: 0, overrideAccess: true }).catch(() => null)
      : null;
    if (!language?.isActive) return invalid(t("imports.chooseActiveLanguage"));

    await req.payload.update({
      collection: "site-imports",
      id,
      overrideAccess: true,
      depth: 0,
      data: {
        status: "queued",
        penpotPage: { pageId: page.id, name: page.name },
        language: languageId,
        boards,
        startedAt: new Date().toISOString(),
      },
    });
    const job = await req.payload.jobs.queue({ task: "site-import", input: { siteImportId: id }, queue: "imports" });
    void req.payload.jobs.runByID({ id: job.id }).catch(() => undefined);
    return Response.json({ id, status: "queued" }, { status: 202 });
  },
};
