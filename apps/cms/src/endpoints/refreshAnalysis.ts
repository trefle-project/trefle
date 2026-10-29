import type { Endpoint } from "payload";

import { isAdminOrEditor } from "../access";
import { adminText } from "../i18n";
import { analysisEnabled, refreshAnalysis } from "../lib/growthbook";

/**
 * POST /api/experiments/:id/refresh-analysis — 018-ab-significance (FR-012,
 * contracts/analysis.md). The test screen's « Rafraîchir »: a fresh
 * GrowthBook analysis of one test, now (up to ~2 minutes). Members with the
 * second factor only, like every other admin endpoint.
 */
export const refreshAnalysisEndpoint: Endpoint = {
  path: "/:id/refresh-analysis",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });
    if (!analysisEnabled()) return Response.json({ ok: false, error: adminText(req.i18n?.language)("settings.analysisOff") }, { status: 409 });
    const id = req.routeParams?.id;
    const experiment = await req.payload
      .findByID({ collection: "experiments", id: String(id), depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!experiment) return Response.json({ ok: false }, { status: 404 });
    const result = await refreshAnalysis(req.payload, experiment as never);
    // The button shows `error` as is: in the member's language (023).
    const t = adminText(req.i18n?.language);
    if (result.waiting) result.error = t("ab.firstDataIn", { min: result.waitMinutes ?? 60 });
    else if (result.error) result.error = t("ab.analysisUnavailable");
    // Waiting for a first analysis is not an error (202): the button says when.
    return Response.json(result, { status: result.ok ? 200 : result.waiting ? 202 : 502 });
  },
};
