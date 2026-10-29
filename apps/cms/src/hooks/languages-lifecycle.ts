import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from "payload";
import { APIError } from "payload";

/**
 * 005-content-language-tagging, US1 (FR-004/FR-004a, research.md §6) — two
 * guards on `languages`:
 *  - deactivating (isActive: true -> false) is rejected if it would leave
 *    zero active languages;
 *  - deleting is rejected if any `pages.language` or `domains.defaultLanguage`
 *    still points at it — same `find` + `APIError` shape as
 *    `pages-confirmation-guard.ts`'s existing delete guard for the analogous
 *    problem. `leads.language` is deliberately NOT checked here: it's a
 *    denormalized text copy of the code, not a live relationship, so
 *    deleting a `languages` row can never corrupt an already-captured lead.
 */
export const preventLastActiveDeactivation: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const wasActive = originalDoc?.isActive === true;
  const stillActive = data?.isActive ?? originalDoc?.isActive;
  if (!wasActive || stillActive !== false || !originalDoc?.id) return data;

  const others = await req.payload.find({
    collection: "languages",
    where: { and: [{ isActive: { equals: true } }, { id: { not_equals: originalDoc.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (others.totalDocs === 0) {
    throw new APIError("Cannot deactivate: at least one active language must remain.", 400, undefined, true);
  }
  return data;
};

async function referencingDocs(
  req: PayloadRequest,
  languageId: string | number,
): Promise<{ pages: { id: string | number; title?: string }[]; domains: { id: string | number; hostname?: string }[] }> {
  const [pages, domains] = await Promise.all([
    req.payload.find({
      collection: "pages",
      where: { language: { equals: languageId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    }),
    req.payload.find({
      collection: "domains",
      where: { defaultLanguage: { equals: languageId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    }),
  ]);
  return {
    pages: pages.docs as { id: string | number; title?: string }[],
    domains: domains.docs as { id: string | number; hostname?: string }[],
  };
}

export const preventDeleteIfReferenced: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { pages, domains } = await referencingDocs(req, id);
  if (pages.length === 0 && domains.length === 0) return;

  const parts: string[] = [];
  if (pages.length > 0) parts.push(`${pages.length} page(s) (${pages.map((p) => p.title ?? `#${p.id}`).join(", ")})`);
  if (domains.length > 0) parts.push(`${domains.length} domain(s) (${domains.map((d) => d.hostname ?? `#${d.id}`).join(", ")})`);
  throw new APIError(`Cannot delete: still used by ${parts.join(" and ")}. Change their language first.`, 400, undefined, true);
};
