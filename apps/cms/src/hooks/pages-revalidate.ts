import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";

import { revalidateTags } from "./revalidate";

const idOf = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === "object" ? String((v as { id?: unknown }).id) : String(v);

/**
 * T035 (contracts/revalidation.md) — invalidate the renderer's cache when a
 * page's *published* state or *published* content changes. Draft-only saves
 * emit nothing.
 */
export const pageRevalidate: CollectionAfterChangeHook = ({ doc, previousDoc }) => {
  const wasPublished = previousDoc?.status === "published";
  const isPublished = doc?.status === "published";
  if (!wasPublished && !isPublished) return doc; // draft ↔ draft

  const reason = !wasPublished && isPublished
    ? "page-published"
    : wasPublished && !isPublished
      ? "page-unpublished"
      : "page-changed";

  const tags = new Set<string>(["page-list", `page:${doc.id}`]);
  for (const d of [idOf(doc.domain), idOf(previousDoc?.domain)]) if (d) tags.add(`domain:${d}`);

  void revalidateTags({ reason, tags: [...tags] });
  return doc;
};

export const pageRevalidateOnDelete: CollectionAfterDeleteHook = ({ doc }) => {
  if (doc?.status !== "published") return doc;
  const tags = new Set<string>(["page-list", `page:${doc.id}`]);
  const d = idOf(doc.domain);
  if (d) tags.add(`domain:${d}`);
  void revalidateTags({ reason: "page-unpublished", tags: [...tags] });
  return doc;
};
