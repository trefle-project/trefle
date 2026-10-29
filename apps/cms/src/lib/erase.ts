import type { Payload } from "payload";

import { forgetLeadAttribution } from "./ab-tests";

/**
 * Erase-in-place a single lead's personal data + its consent record's personal
 * evidence (FR-026/027, FR-031/031a). Shared by DSR erasure (T063) and the
 * retention sweep (T074). Keeps the rows for statistics / non-personal proof;
 * stamps `erasedAt`. Idempotent — a lead already `erasedAt` is skipped.
 *
 * Returns whether the lead was actually scrubbed by this call.
 */
export async function eraseLeadPersonalData(
  payload: Payload,
  leadId: string | number,
): Promise<boolean> {
  const lead = (await payload
    .findByID({ collection: "leads", id: leadId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: string | number; erasedAt?: string | null; consentRecord?: string | number | null } | null;
  if (!lead || lead.erasedAt) return false;

  await payload.update({
    collection: "leads",
    id: lead.id,
    overrideAccess: true,
    data: {
      email: null,
      fieldValues: null,
      metadata: { pageUrl: null, referrer: null, utm: null, userAgent: null },
      erasedAt: new Date().toISOString(),
    },
  });
  // 018-ab-significance, FR-008 — the lead's A/B attribution goes with it.
  await forgetLeadAttribution(payload, lead.id);

  // scrub every consent record tied to this lead (usually one)
  const consents = await payload.find({
    collection: "consent-records",
    where: { lead: { equals: lead.id } },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  });
  for (const c of consents.docs as { id: string | number }[]) {
    await payload.update({
      collection: "consent-records",
      id: c.id,
      overrideAccess: true,
      data: { email: null, ipAddress: null, userAgent: null },
    });
  }
  return true;
}
