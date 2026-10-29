import type { CollectionBeforeDeleteHook } from "payload";
import { APIError } from "payload";

/**
 * 006-double-optin-email, US1 (research.md §9) — `pages.optInEmail` is
 * optional/nullable, so nothing at the database level would break if this
 * were skipped (unlike 005's `languages` guard), but silently nulling a
 * page's selected opt-in email out from under an editor is the exact
 * problem `pages-confirmation-guard.ts`'s `confirmationGuardOnDelete`
 * already exists to prevent for `confirmationPage` — same shape, reused.
 */
export const preventDeleteIfReferenced: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const res = await req.payload.find({
    collection: "pages",
    where: { optInEmail: { equals: id } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  });
  if (res.totalDocs === 0) return;

  const names = (res.docs as { id: string | number; title?: string }[]).map((p) => p.title ?? `#${p.id}`).join(", ");
  throw new APIError(
    `Cannot delete: ${res.totalDocs} page(s) still use this as their opt-in confirmation email (${names}). Change their selection first.`,
    400,
    undefined,
    true,
  );
};
