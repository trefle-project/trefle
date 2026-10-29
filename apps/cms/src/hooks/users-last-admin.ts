import { APIError } from "payload";
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, Payload } from "payload";

/**
 * T081 (US5-4 / US5-5, FR-034a) — the workspace must always keep at least one
 * active Administrator. These guards reject any update that would demote or
 * deactivate the last one, and any delete that would remove it.
 *
 * "Active Administrator" = `role === 'admin' && isActive !== false`.
 */

async function otherActiveAdminCount(payload: Payload, excludeId: string | number): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: "users",
    overrideAccess: true,
    where: {
      and: [
        { role: { equals: "admin" } },
        { isActive: { equals: true } },
        { id: { not_equals: excludeId } },
      ],
    },
  });
  return totalDocs;
}

const LAST_ADMIN_MESSAGE =
  "This is the last active Administrator. Promote another member to Administrator first.";

export const lastAdminGuardBeforeChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation !== "update" || !originalDoc) return data;

  const wasActiveAdmin = originalDoc.role === "admin" && originalDoc.isActive !== false;
  if (!wasActiveAdmin) return data;

  // Tolerate both partial and merged `data` shapes.
  const nextRole = data.role ?? originalDoc.role;
  const nextActive = data.isActive ?? originalDoc.isActive ?? true;
  const staysActiveAdmin = nextRole === "admin" && nextActive !== false;
  if (staysActiveAdmin) return data;

  if ((await otherActiveAdminCount(req.payload, originalDoc.id)) === 0) {
    throw new APIError(LAST_ADMIN_MESSAGE, 400);
  }
  return data;
};

export const lastAdminGuardBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const doc = await req.payload
    .findByID({ collection: "users", id, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!doc || doc.role !== "admin" || doc.isActive === false) return;

  if ((await otherActiveAdminCount(req.payload, id)) === 0) {
    throw new APIError(
      "This is the last active Administrator and cannot be removed. Promote another member first.",
      400,
    );
  }
};
