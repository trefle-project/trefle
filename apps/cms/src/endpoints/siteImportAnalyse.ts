import { PenpotFileError, readPenpotFile } from "@trefle/grapesjs-page-import/penpot";
import { addDataAndFileToRequest, type Endpoint } from "payload";

import { isAdminOrEditor } from "../access";
import { adminText } from "../i18n";
import { SITE_IMPORT_ERROR_MESSAGES, siteImportErrorMessage, type SiteImportErrorCode } from "../lib/import/site-errors";
import { writeSiteFile } from "../lib/import/site-files";
import { log } from "../lib/log";

/**
 * POST /api/site-imports/analyse?domain=<id> (015-penpot-site-import,
 * contracts/site-import-api.md, research P12). Multipart, one part: `file`.
 *
 * The domain comes first (FR-001): it is checked from the query string
 * before the body is read. Then the file is checked (size, zip limits,
 * Penpot 2), its pages and boards are listed with proposed addresses, the
 * addresses already published on the domain are marked, and the file waits
 * on disk for the start request.
 */
// 017-edge-protection (research R13) — 95 MB, under Cloudflare's 100 MB
// request-body cap with room for the multipart envelope.
export const MAX_PENPOT_FILE_BYTES = 95 * 1024 * 1024;
const MULTIPART_SLACK = 64 * 1024;
const MAX_THUMBNAIL_BYTES = 200 * 1024;

export const penpotImportEnabled = () => process.env.PENPOT_IMPORT === "on";

/** Refusals in the member's language (023). */
const failIn = (lang: unknown) => (status: number, code: SiteImportErrorCode, message: string = siteImportErrorMessage(code, lang)) =>
  Response.json({ errors: [{ code, message }] }, { status });

/** Keeps a file name displayable: no path, no control characters, ≤ 200 chars (as 013). */
const cleanFileName = (name: string) =>
  [...(name.split(/[\\/]/).pop() ?? "")]
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(-200) || "fichier.penpot";

const pngDataUrl = (bytes: Uint8Array | undefined) =>
  bytes && bytes.length <= MAX_THUMBNAIL_BYTES ? `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` : undefined;

export const siteImportAnalyseEndpoint: Endpoint = {
  path: "/analyse",
  method: "post",
  handler: async (req) => {
    if (!penpotImportEnabled()) return new Response(null, { status: 404 });
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const fail = failIn(req.i18n?.language);
    const t = adminText(req.i18n?.language);

    // 1. The domain, before anything else (FR-001).
    const url = new URL(req.url ?? "http://x/", "http://x/");
    const domainId = Number(url.searchParams.get("domain"));
    const domain = Number.isInteger(domainId)
      ? await req.payload.findByID({ collection: "domains", id: domainId, depth: 0, overrideAccess: true }).catch(() => null)
      : null;
    if (!domain || !domain.isActive) return fail(400, "invalid-input", t("imports.chooseDomainFirst"));

    // 2. Size, before reading the body.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PENPOT_FILE_BYTES + MULTIPART_SLACK) return fail(413, "file-too-large");
    await addDataAndFileToRequest(req);
    const file = req.file;
    if (!file?.data?.length) return fail(400, "invalid-input", t("imports.choosePenpotFile"));
    if (file.data.length > MAX_PENPOT_FILE_BYTES) return fail(413, "file-too-large");

    // 3. The file itself.
    let penpot: ReturnType<typeof readPenpotFile>;
    try {
      penpot = readPenpotFile(new Uint8Array(file.data));
    } catch (e) {
      if (e instanceof PenpotFileError) return fail(e.code === "file-too-large" ? 413 : 400, e.code);
      throw e;
    }

    // 4. Addresses already published on this domain (information only, FR-005).
    const published = await req.payload.find({
      collection: "pages",
      where: { and: [{ domain: { equals: domainId } }, { status: { equals: "published" } }] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { path: true },
    });
    const publishedPaths = [...new Set(published.docs.map((p) => (p as { path?: string | null }).path).filter((p): p is string => Boolean(p)))].sort();
    const taken = new Set(publishedPaths);

    const pages = penpot.pages.map((p) => ({
      id: p.id,
      name: p.name,
      boards: p.boards.map((b) => {
        const thumbnail = pngDataUrl(penpot.thumbnail(p.id, b.id));
        return { ...b, published: taken.has(b.proposedPath), ...(thumbnail ? { thumbnail } : {}) };
      }),
    }));

    const doc = await req.payload.create({
      collection: "site-imports",
      overrideAccess: true,
      depth: 0,
      data: {
        status: "analysed",
        fileName: cleanFileName(file.name ?? "fichier.penpot"),
        penpotFileName: penpot.name,
        penpotPages: pages,
        domain: domainId,
        createdBy: req.user.id,
      },
    });
    try {
      await writeSiteFile(doc.id, new Uint8Array(file.data));
    } catch (e) {
      log.error("site_import_file_write_failed", { siteImportId: doc.id, errorName: e instanceof Error ? e.name : "Error" });
      await req.payload.update({
        collection: "site-imports",
        id: doc.id,
        overrideAccess: true,
        depth: 0,
        data: { status: "failed", errorCode: "internal", errorMessage: SITE_IMPORT_ERROR_MESSAGES.internal },
      });
      return fail(500, "internal");
    }

    return Response.json(
      {
        id: doc.id,
        domain: { id: domain.id, hostname: domain.hostname, defaultLanguage: domain.defaultLanguage ?? null },
        publishedPaths,
        penpotFileName: penpot.name,
        pages,
      },
      { status: 201 },
    );
  },
};
