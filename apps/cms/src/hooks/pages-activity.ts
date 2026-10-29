import type { CollectionAfterChangeHook } from "payload";

import { writeActivity } from "../lib/activity";

type Snippet = { code?: string | null; consent?: string | null } | null | undefined;
type CustomCode =
  | {
      head?: Snippet;
      bodyEnd?: Snippet;
      blocks?: ({ codeId?: string } & NonNullable<Snippet>)[] | null;
    }
  | null
  | undefined;

// Absent code ≡ empty, absent consent ≡ "consent" (the field's default), row ids ignored.
const norm = (s: Snippet) => JSON.stringify([s?.code ?? "", s?.consent ?? "consent"]);
const normBlocks = (c: CustomCode) =>
  JSON.stringify((c?.blocks ?? []).map((b) => [b.codeId ?? "", norm(b)]));

/** 014-custom-code-editing, FR-023 — which parts of a page's admin code changed. */
export function changedCodeParts(before: CustomCode, after: CustomCode): ("head" | "bodyEnd" | "blocks")[] {
  const parts: ("head" | "bodyEnd" | "blocks")[] = [];
  if (norm(before?.head) !== norm(after?.head)) parts.push("head");
  if (norm(before?.bodyEnd) !== norm(after?.bodyEnd)) parts.push("bodyEnd");
  if (normBlocks(before) !== normBlocks(after)) parts.push("blocks");
  return parts;
}

/**
 * T036 (US1 scenario 8) — record who published / unpublished / changed a page.
 * 014-custom-code-editing (FR-023) — plus who changed its scripts or code
 * blocks, as its own entry. Only an admin can change that code (field
 * access), so only an admin's save is compared: it can't misattribute.
 */
export const pageActivity: CollectionAfterChangeHook = ({ doc, previousDoc, req, operation }) => {
  const meta = { path: doc.path, domainId: typeof doc.domain === "object" ? doc.domain?.id : doc.domain };

  const wasPublished = previousDoc?.status === "published";
  const isPublished = doc?.status === "published";

  let type: "page-published" | "page-unpublished" | "page-content-changed" | null = null;
  if (!wasPublished && isPublished) type = "page-published";
  else if (wasPublished && !isPublished) type = "page-unpublished";
  else if (operation === "update" && isPublished) type = "page-content-changed";
  if (type) {
    void writeActivity(req.payload, {
      type,
      actor: req.user?.id ?? null,
      targetType: "page",
      targetId: String(doc.id),
      meta,
      req,
    });
  }

  const user = req.user as { role?: string } | null | undefined;
  if (user?.role === "admin") {
    const parts = changedCodeParts(operation === "create" ? undefined : previousDoc?.customCode, doc?.customCode);
    if (parts.length) {
      void writeActivity(req.payload, {
        type: "page-code-changed",
        actor: req.user?.id ?? null,
        targetType: "page",
        targetId: String(doc.id),
        meta: { ...meta, parts },
        req,
      });
    }
  }
  return doc;
};
