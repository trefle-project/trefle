import type { Endpoint } from "payload";
import { readJson } from "../lib/req";

import { writeActivity } from "../lib/activity";
import { isAdminOrEditor } from "../access";

/**
 * POST /api/dsr-export (T062, FR-025) — `{ email }` → machine-readable JSON of
 * ALL data held for that email across every page (leads + consent records,
 * including on since-deleted pages). Admin + Editor. Records an activity entry
 * (FR-034b — exporting lead data).
 */
export const dsrExportEndpoint: Endpoint = {
  path: "/dsr-export",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return Response.json({ error: "forbidden" }, { status: 403 });
    const body = await readJson<{ email?: string }>(req);
    const email = body?.email?.trim().toLowerCase();
    if (!email) return Response.json({ error: "email required" }, { status: 400 });

    const [leads, consents] = await Promise.all([
      req.payload.find({ collection: "leads", where: { email: { equals: email } }, depth: 0, limit: 1000, overrideAccess: true }),
      req.payload.find({ collection: "consent-records", where: { email: { equals: email } }, depth: 0, limit: 1000, overrideAccess: true }),
    ]);

    void writeActivity(req.payload, {
      type: "dsr-completed",
      actor: req.user?.id ?? null,
      targetType: "export",
      targetId: `access export (${leads.totalDocs} leads)`,
      meta: { kind: "access-export", leads: leads.totalDocs, consentRecords: consents.totalDocs },
      req,
    });

    return Response.json({
      email,
      generatedAt: new Date().toISOString(),
      leads: leads.docs,
      consentRecords: consents.docs,
    });
  },
};
