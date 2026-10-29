import type { Endpoint } from "payload";

import { isService } from "../access";
import { type LegalKind, archiveVersion, loadLegalInputs, renderLegalPage } from "../lib/legal/build";

/**
 * GET /api/legal/:kind?domain=<id>&lang=<code> — 021-legal-pages
 * (contracts/legal-api.md). A domain's privacy policy (`privacy`) or legal
 * notice (`notice`) for the renderer: HTML, version and the date that version
 * was first published (archived on first build), language, title, and the
 * domain's own address for that page when it has one. Service account only.
 */
const KINDS = new Set<LegalKind>(["privacy", "notice"]);

export const legalPageEndpoint: Endpoint = {
  path: "/legal/:kind",
  method: "get",
  handler: async (req) => {
    if (!isService({ req } as never)) return new Response(null, { status: 403 });
    const kind = String(req.routeParams?.kind ?? "") as LegalKind;
    const url = new URL(req.url ?? "http://cms/");
    const domainId = url.searchParams.get("domain");
    if (!KINDS.has(kind) || !domainId || !/^\d+$/.test(domainId)) return Response.json({ error: "bad request" }, { status: 400 });

    const loaded = await loadLegalInputs(req.payload, domainId);
    if (!loaded) return Response.json({ error: "not found" }, { status: 404 });
    const page = renderLegalPage(loaded.inputs, kind, url.searchParams.get("lang"));
    const versionDate = page.html ? await archiveVersion(req.payload, domainId, loaded.inputs.domain.hostname, kind, page) : null;
    const ownUrl = (kind === "privacy" ? loaded.domain.ownPrivacyPolicyUrl : loaded.domain.ownLegalNoticeUrl) as string | null | undefined;
    return Response.json({ ...page, versionDate, ownUrl: ownUrl || null });
  },
};
