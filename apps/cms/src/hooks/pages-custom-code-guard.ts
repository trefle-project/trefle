import type { CollectionBeforeValidateHook } from "payload";
import { APIError } from "payload";

import { codeIdsIn } from "@trefle/shared";

import { adminText } from "../i18n";

/**
 * 014-custom-code-editing, FR-018 (research R6) — a « Code personnalisé »
 * block is a placeholder in the page HTML (`data-code-id`) whose code lives in
 * the admin-only `customCode.blocks`. Field access already keeps editors away
 * from the code itself; this guard refuses the other way in: an editor
 * introducing a code-block reference that isn't already on the page (pasted in
 * the « Code » view, sent to the API, a page duplicate), which would otherwise
 * silently render nothing — or, forged with another page's id, nothing either,
 * since only this page's rows are ever rendered.
 *
 * Editors may still move or delete existing blocks. For an admin save that
 * carries the blocks array, rows no longer referenced are dropped (orphans
 * left by a deleted block).
 */

type Row = { codeId?: string | null };
type User = { role?: string; isActive?: boolean; isService?: boolean } | null | undefined;

const isActiveAdmin = (u: User) => !!u && !u.isService && u.isActive !== false && u.role === "admin";

export const pagesCustomCodeGuard: CollectionBeforeValidateHook = async ({ data, originalDoc, req, operation }) => {
  const html = (data?.builder as { html?: unknown } | undefined)?.html;
  if (!data || typeof html !== "string") return data; // builder not part of this write

  const t = adminText(req.i18n?.language);
  const ids = codeIdsIn(html);
  if (new Set(ids).size !== ids.length) throw new APIError(t("errors.customCodeDuplicate"), 400, undefined, true);

  if (isActiveAdmin(req.user as User)) {
    const customCode = data.customCode as { blocks?: Row[] | null } | undefined;
    if (Array.isArray(customCode?.blocks)) {
      customCode.blocks = customCode.blocks.filter((row) => row?.codeId && ids.includes(row.codeId));
    }
    return data;
  }

  if (!ids.length) return data;
  let stored: string[] = [];
  if (operation === "update" && originalDoc?.id != null) {
    // The editor's own read omits customCode: look it up with full access.
    const current = (await req.payload.findByID({
      collection: "pages",
      id: originalDoc.id,
      depth: 0,
      overrideAccess: true,
      select: { customCode: true },
    })) as { customCode?: { blocks?: Row[] | null } | null };
    stored = (current.customCode?.blocks ?? []).map((r) => r.codeId ?? "").filter(Boolean);
  }
  if (ids.some((id) => !stored.includes(id))) throw new APIError(t("errors.customCodeRefused"), 403, undefined, true);
  return data;
};
