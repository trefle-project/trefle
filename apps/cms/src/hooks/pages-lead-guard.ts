import type { CollectionBeforeDeleteHook } from "payload";
import { APIError } from "payload";

/**
 * Pre-existing bug found while verifying 005-content-language-tagging's
 * User Story 3 (not itself a language-tagging concern): `leads.page` is
 * `required: true` (`page_id NOT NULL` at the DB level) while its foreign
 * key was generated `ON DELETE SET NULL` — deleting a page that still has
 * leads pointing at it always failed with a raw Postgres NOT NULL
 * violation, contradicting `Leads.ts`'s own header comment ("page may point
 * at a since-deleted page (orphan)").
 *
 * Resolved the way the operator chose: a page stays undeletable for as
 * long as any lead still references it — deletable again once none do
 * (leads are erased-in-place, not hard-deleted, per the DSR/retention
 * flow, so this becomes true once every lead tied to the page has aged out
 * or been erased, not by deleting leads to "unblock" a page). Same
 * `find` + `APIError` shape as this file's sibling,
 * `pages-confirmation-guard.ts`'s `confirmationGuardOnDelete`, for the
 * analogous problem.
 */
export const leadReferenceGuardOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const res = await req.payload.find({
    collection: "leads",
    where: { page: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (res.totalDocs > 0) {
    throw new APIError(
      `Cannot delete: ${res.totalDocs} lead(s) still reference this page. It can be deleted once none do.`,
      400,
      undefined,
      true,
    );
  }
};
