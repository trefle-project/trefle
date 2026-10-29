import type { Endpoint } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { adminText } from "../i18n";

/**
 * POST /api/page-imports/:id/cancel (012-url-page-import,
 * contracts/import-api.md) — asks the job to stop: it reaches `cancelled` at
 * its next checkpoint, with no page and no leftover media. Idempotent. Only
 * the import's creator or an Administrator may cancel; a finished import
 * answers 409.
 */
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export const pageImportCancelEndpoint: Endpoint = {
  path: "/:id/cancel",
  method: "post",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id)) return new Response(null, { status: 404 });

    const doc = await req.payload
      .findByID({ collection: "page-imports", id, depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!doc) return new Response(null, { status: 404 });

    const creator = typeof doc.createdBy === "object" ? doc.createdBy.id : doc.createdBy;
    if (creator !== req.user.id && !isAdmin({ req } as never)) return new Response(null, { status: 403 });

    if (TERMINAL.has(doc.status)) {
      return Response.json(
        { errors: [{ code: "already-finished", message: adminText(req.i18n?.language)("imports.alreadyFinished") }] },
        { status: 409 },
      );
    }
    if (!doc.cancelRequested) {
      await req.payload.update({
        collection: "page-imports",
        id,
        data: { cancelRequested: true },
        depth: 0,
        overrideAccess: true,
      });
    }
    return Response.json({ id, status: doc.status, cancelRequested: true });
  },
};
