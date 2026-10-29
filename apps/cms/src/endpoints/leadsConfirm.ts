import type { Endpoint } from "payload";
import { markAttributedLeadConfirmed } from "../lib/ab-tests";
import { readJson } from "../lib/req";
import { isStaffOrService } from "../access";

/**
 * POST /api/leads-confirm (006-double-optin-email, FR-009/FR-010/FR-011) —
 * `{ leadId }`. Sets the lead's `optInConfirmedAt` if unset. Idempotent,
 * non-enumerating (always `{ ok: true }`, even for an unknown lead) — same
 * shape as `consentWithdraw.ts`'s `consent-withdraw` endpoint for the
 * analogous problem. Called by the renderer's `/confirm` handler with the
 * service API key, once it has already verified the token itself; also
 * usable by staff.
 */
export const leadsConfirmEndpoint: Endpoint = {
  path: "/leads-confirm",
  method: "post",
  handler: async (req) => {
    if (!isStaffOrService({ req } as never)) return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
    const body = await readJson<{ leadId?: string | number }>(req);
    if (!body?.leadId) return Response.json({ ok: false, code: "bad_request" }, { status: 400 });

    const id = typeof body.leadId === "number" ? body.leadId : Number(body.leadId);
    const lead = (await req.payload
      .findByID({ collection: "leads", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as { id: string | number; optInConfirmedAt?: string | null } | null;
    // Idempotent + non-enumerating: always answer 200 even if the lead is gone.
    if (!lead) return Response.json({ ok: true });

    if (!lead.optInConfirmedAt) {
      const at = new Date().toISOString();
      await req.payload.update({
        collection: "leads",
        id: lead.id,
        data: { optInConfirmedAt: at },
        overrideAccess: true,
      });
      // 018-ab-significance, FR-017 — « Lead confirmé » in the A/B analysis.
      await markAttributedLeadConfirmed(req.payload, lead.id, at);
    }
    return Response.json({ ok: true });
  },
};
