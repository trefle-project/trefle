import { mkdir, writeFile } from "node:fs/promises";

import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from "payload";

import { isAdminOrEditor } from "../access";
import { adminLanguageOf, adminText } from "../i18n";
import { budgetStatus, resetDay } from "../lib/import/budget";
import { IMPORT_ERROR_MESSAGES, ImportError, importErrorMessage } from "../lib/import/errors";
import { MAX_SAVED_FILE_BYTES, SAVED_FILES_DIR, readSavedFile, savedFilePath } from "../lib/import/saved-file";
import { assertPublicHttpUrl } from "../lib/import/url-guard";
import { log } from "../lib/log";

/**
 * POST /api/page-imports/start (012-url-page-import, contracts/import-api.md)
 * — validates the wizard's answers and the URL (never fetches the page, only
 * resolves its host), checks the budgets (user first, then workspace),
 * creates the `page-imports` document and starts the job without waiting
 * for it (`runByID`, not awaited; the `imports` autoRun is the safety net).
 *
 * 013-saved-page-import (contracts/start-file.md): the same endpoint takes a
 * page saved from the editor's browser as `multipart/form-data` (`_payload`
 * with the wizard fields, `file`). The file is checked, recorded as the
 * import's source and kept in the cms temp directory until the import ends.
 */
type StartBody = {
  url?: unknown;
  pageType?: unknown;
  title?: unknown;
  domain?: unknown;
  path?: unknown;
  language?: unknown;
};

const PAGE_TYPES = ["subscription", "free", "confirmation"] as const;


/** Multipart overhead allowed on top of the file itself. */
const MULTIPART_SLACK = 1024 * 1024;

/** Keeps a file name displayable: no path, no control characters, ≤ 200 chars. */
const cleanFileName = (name: string) =>
  [...(name.split(/[\\/]/).pop() ?? "")]
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(-200) || "page.html";

const fail = (status: number, code: string, message: string) =>
  Response.json({ errors: [{ code, message }] }, { status });

const optionalId = (v: unknown): number | undefined | null => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const pageImportStartEndpoint: Endpoint = {
  path: "/start",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const user = req.user as unknown as { id: number; importMonthlyBudgetEur?: number | null };
    const lang = req.i18n?.language;
    const t = adminText(lang);

    const budget = await budgetStatus(req.payload, user);
    if (!budget.enabled) return fail(409, "feature-disabled", t("imports.featureOff"));

    // 013: a saved page comes as multipart; the wizard fields are the same.
    const isFile = (req.headers?.get?.("content-type") ?? "").includes("multipart/form-data");
    if (isFile && Number(req.headers.get("content-length") ?? 0) > MAX_SAVED_FILE_BYTES + MULTIPART_SLACK) {
      return fail(413, "file-too-large", t("imports.fileTooLarge"));
    }
    let file: { name: string; data: Buffer } | undefined;
    let body: StartBody;
    if (isFile) {
      await addDataAndFileToRequest(req as PayloadRequest);
      body = (req.data ?? {}) as StartBody;
      file = req.file ? { name: req.file.name, data: req.file.data } : undefined;
    } else {
      body = ((await req.json?.().catch(() => null)) ?? {}) as StartBody;
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const pageType = PAGE_TYPES.find((t) => t === body.pageType);
    const language = optionalId(body.language);
    const domain = optionalId(body.domain);
    const rawPath = typeof body.path === "string" ? body.path.trim() : "";
    if (!title) return fail(400, "invalid-input", t("imports.titleRequired"));
    if (!pageType) return fail(400, "invalid-input", t("imports.typeRequired"));
    if (!language) return fail(400, "invalid-input", t("imports.languageRequired"));
    if (domain === null) return fail(400, "invalid-input", t("imports.unknownDomain"));
    let sourceUrl: string;
    if (isFile) {
      if (!file) return fail(400, "missing-file", t("imports.chooseFile"));
      if (file.data.length > MAX_SAVED_FILE_BYTES) return fail(413, "file-too-large", t("imports.fileTooLarge"));
      const saved = await readSavedFile(file.data, file.name);
      if (saved === "unsupported") return fail(400, "unsupported-file", t("imports.fileUnsupported"));
      sourceUrl = saved.originalUrl ?? "";
    } else {
      if (typeof body.url !== "string" || !body.url.trim()) {
        return fail(400, "invalid-url", importErrorMessage("invalid-url", lang));
      }
      try {
        sourceUrl = (await assertPublicHttpUrl(body.url)).href;
      } catch (e) {
        const code = e instanceof ImportError ? e.code : "invalid-url";
        return fail(400, code, importErrorMessage(code, lang));
      }
    }

    if (budget.blockedBy === "user") {
      return fail(
        409,
        "user-budget-exhausted",
        t("imports.userBudgetOut", { date: resetDay(lang) }),
      );
    }
    if (budget.blockedBy === "workspace") {
      return fail(
        409,
        "budget-exhausted",
        t("imports.workspaceBudgetOut", { date: resetDay(lang) }),
      );
    }

    const doc = await req.payload.create({
      collection: "page-imports",
      overrideAccess: true,
      depth: 0,
      data: {
        sourceKind: isFile ? "file" : "url",
        sourceUrl,
        ...(isFile && file ? { sourceFileName: cleanFileName(file.name) } : {}),
        pageType,
        title,
        domain,
        path: domain && rawPath ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : undefined,
        language,
        reportLanguage: adminLanguageOf(lang),
        status: "queued",
        startedAt: new Date().toISOString(),
        createdBy: user.id,
      },
    });

    if (isFile && file) {
      // Written before the job is queued; removed by the job (or the sweep) when the import ends.
      try {
        await mkdir(SAVED_FILES_DIR, { recursive: true, mode: 0o700 });
        await writeFile(savedFilePath(doc.id), file.data, { mode: 0o600 });
      } catch (e) {
        log.error("page_import_file_write_failed", { importId: doc.id, errorName: e instanceof Error ? e.name : "Error" });
        await req.payload.update({
          collection: "page-imports",
          id: doc.id,
          overrideAccess: true,
          data: { status: "failed", errorCode: "internal", errorMessage: IMPORT_ERROR_MESSAGES.internal, finishedAt: new Date().toISOString() },
        });
        return fail(500, "internal", importErrorMessage("internal", lang));
      }
    }

    const job = await req.payload.jobs.queue({ task: "page-import", input: { importId: doc.id }, queue: "imports" });
    void req.payload.jobs.runByID({ id: job.id }).catch((e) => {
      log.error("page_import_run_failed", { importId: doc.id, errorName: e instanceof Error ? e.name : "Error" });
    });

    return Response.json({ id: doc.id, status: doc.status }, { status: 202 });
  },
};
