import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from "payload";
import { APIError } from "payload";

/**
 * 003-post-launch-improvements — spec.md edge case: "Deleting or unpublishing
 * a page that is currently set as another page's confirmation page must not
 * silently break that page's publish state — the editor must be told."
 *
 * The referring page's own publish state never actually breaks (FR-013's
 * fallback already handles a missing/unresolvable confirmationPage
 * gracefully — the generic message is shown instead), but the editor
 * changing THIS page has no way to know their edit quietly degraded another
 * page's confirmation experience unless we tell them at the moment they act.
 * A server log alone doesn't reach the editor in the admin UI, so — like
 * publishGuard — this blocks with a clear, actionable message rather than
 * silently allowing it; the editor can pick a different confirmation page on
 * the referring page(s) first, then proceed.
 */
async function referencingPages(
  req: PayloadRequest,
  pageId: string | number,
): Promise<{ id: string | number; title?: string }[]> {
  const res = await req.payload.find({
    collection: "pages",
    where: { confirmationPage: { equals: pageId } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as { id: string | number; title?: string }[];
}

function refMessage(action: "delete" | "unpublish", refs: { id: string | number; title?: string }[]): string {
  const names = refs.map((p) => p.title ?? `#${p.id}`).join(", ");
  return `Cannot ${action}: ${refs.length} page(s) use this as their confirmation page (${names}). Change their confirmation page first.`;
}

export const confirmationGuardOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const refs = await referencingPages(req, id);
  if (refs.length > 0) throw new APIError(refMessage("delete", refs), 400, undefined, true);
};

export const confirmationGuardOnUnpublish: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const nextStatus = data?.status ?? originalDoc?.status;
  const wasPublished = originalDoc?.status === "published";
  if (!wasPublished || nextStatus === "published" || !originalDoc?.id) return data;

  const refs = await referencingPages(req, originalDoc.id);
  if (refs.length > 0) throw new APIError(refMessage("unpublish", refs), 400, undefined, true);
  return data;
};
