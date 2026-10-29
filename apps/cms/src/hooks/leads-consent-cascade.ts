import type { CollectionBeforeDeleteHook } from "payload";

/**
 * Root cause (found via manual local testing of the confirmation-page
 * redirect flow, unrelated to that feature itself): `consent-records.lead`
 * is `required: true` (NOT NULL at the DB level) but its FK was generated
 * `ON DELETE SET NULL` (20260909_125135_phase3_us1.ts) — deleting a lead
 * that still has a consent record always failed with a raw Postgres NOT
 * NULL violation, surfaced to the caller as an opaque 500. Every lead
 * created via `leadIntake.ts` gets a consent record unconditionally, so
 * this broke `DELETE /api/leads/:id` for 100% of real leads.
 *
 * Resolved the other way from `pages-lead-guard.ts`'s analogous problem —
 * there, deletion is blocked until nothing references the target; here the
 * operator chose to keep `leads` hard-deletable and cascade the delete to
 * its consent record(s) instead. Trade-off this accepts: `consent-records`
 * otherwise disallows delete entirely (`access.delete: () => false`,
 * "immutable consent evidence") — hard-deleting a lead now also erases its
 * consent evidence, for anyone who can delete leads (`isAdmin`). This
 * differs from DSR/retention erasure (`lib/erase.ts`), which nulls the
 * personal fields in place and keeps both rows as non-personal proof; a
 * hard delete here removes the consent record entirely rather than
 * anonymising it. Deliberate: the operator wants hard-delete usable (e.g.
 * to clean up test/bad data) without it perpetually 500ing.
 */
export const cascadeConsentRecordsOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const consents = await req.payload.find({
    collection: "consent-records",
    where: { lead: { equals: id } },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  });
  for (const c of consents.docs as { id: string | number }[]) {
    await req.payload.delete({ collection: "consent-records", id: c.id, overrideAccess: true });
  }
};
