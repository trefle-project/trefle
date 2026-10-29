import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";

import { writeActivity } from "../lib/activity";

/**
 * T082 (US5, FR-034b) — record membership changes in the non-personal audit
 * trail: `member-invited` on create, `member-role-changed` when role or active
 * state changes, `member-removed` on delete. The service account is skipped —
 * it is infrastructure, not a workspace member.
 */
export const usersActivity: CollectionAfterChangeHook = ({ data, doc, previousDoc, operation, req }) => {
  if (doc?.isService) return doc;
  const actor = req.user?.id ?? null;

  // 019-admin-access — payload-totp's setup endpoint is the only writer of a
  // non-empty `totpSecret` (the field is closed to the API). Resets clear it
  // and log `totp-reset` themselves (lib/totp-reset.ts).
  if (operation === "update" && typeof data?.totpSecret === "string" && data.totpSecret !== "") {
    void writeActivity(req.payload, {
      type: "totp-enrolled",
      actor: doc.id,
      targetType: "user",
      targetId: String(doc.id),
      req,
    });
    return doc;
  }

  if (operation === "create") {
    void writeActivity(req.payload, {
      type: "member-invited",
      actor,
      targetType: "user",
      targetId: String(doc.id),
      meta: { role: doc.role },
      req,
    });
    return doc;
  }

  const roleChanged = Boolean(previousDoc) && previousDoc.role !== doc.role;
  const activeChanged =
    Boolean(previousDoc) && (previousDoc.isActive !== false) !== (doc.isActive !== false);
  if (roleChanged || activeChanged) {
    void writeActivity(req.payload, {
      type: "member-role-changed",
      actor,
      targetType: "user",
      targetId: String(doc.id),
      meta: {
        ...(roleChanged ? { role: doc.role, previousRole: previousDoc.role } : {}),
        ...(activeChanged ? { isActive: doc.isActive !== false } : {}),
      },
      req,
    });
  }
  return doc;
};

export const usersActivityOnDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  if (doc?.isService) return doc;
  void writeActivity(req.payload, {
    type: "member-removed",
    actor: req.user?.id ?? null,
    targetType: "user",
    targetId: String(doc?.id ?? ""),
    meta: { role: doc?.role },
    req,
  });
  return doc;
};
