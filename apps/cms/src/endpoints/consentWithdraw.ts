import type { Endpoint } from "payload";
import { forgetLeadAttribution } from "../lib/ab-tests";
import { readJson } from "../lib/req";
import { isStaffOrService } from "../access";

/**
 * POST /api/consent-withdraw (T061, FR-019) — `{ leadId }`.
 * Sets the lead's consent status to `withdrawn` and stamps the linked consent
 * record's `withdrawnAt` (if unset). Idempotent. Called by the renderer's
 * `/unsubscribe` handler with the service API key; also usable by staff.
 */
export const consentWithdrawEndpoint: Endpoint = {
  path: "/consent-withdraw",
  method: "post",
  handler: async (req) => {
    if (!isStaffOrService({ req } as never)) return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
    const body = await readJson<{ leadId?: string | number }>(req);
    if (!body?.leadId) return Response.json({ ok: false, code: "bad_request" }, { status: 400 });

    const id = typeof body.leadId === "number" ? body.leadId : Number(body.leadId);
    const lead = (await req.payload
      .findByID({ collection: "leads", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as { id: string | number; consentStatus?: string; consentRecord?: string | number | null } | null;
    // Idempotent + non-enumerating: always answer 200 even if the lead is gone.
    if (!lead) return Response.json({ ok: true });

    if (lead.consentStatus !== "withdrawn") {
      await req.payload.update({
        collection: "leads",
        id: lead.id,
        data: { consentStatus: "withdrawn" },
        overrideAccess: true,
      });
    }
    // 018-ab-significance, FR-008 — no A/B attribution survives a withdrawal.
    await forgetLeadAttribution(req.payload, lead.id);
    if (lead.consentRecord) {
      const recId = typeof lead.consentRecord === "object" ? (lead.consentRecord as { id: string | number }).id : lead.consentRecord;
      const rec = (await req.payload
        .findByID({ collection: "consent-records", id: recId, depth: 0, overrideAccess: true })
        .catch(() => null)) as { withdrawnAt?: string | null } | null;
      if (rec && !rec.withdrawnAt) {
        await req.payload.update({
          collection: "consent-records",
          id: recId,
          data: { withdrawnAt: new Date().toISOString() },
          overrideAccess: true,
        });
      }
    }
    return Response.json({ ok: true });
  },
};
