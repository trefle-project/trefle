import type { Endpoint } from "payload";

import { isAdmin, isAdminOrEditor } from "../access";
import { adminText } from "../i18n";
import { penpotImportEnabled } from "./siteImportAnalyse";

/**
 * POST /api/site-imports/:id/cancel (015-penpot-site-import) — asks the job
 * to stop; it reaches `cancelled` at its next checkpoint with no page, no
 * Media and no file left (FR-019). Only the creator or an Administrator;
 * an import that is not queued or running answers 409.
 */
export const siteImportCancelEndpoint: Endpoint = {
  path: "/:id/cancel",
  method: "post",
  handler: async (req) => {
    if (!penpotImportEnabled()) return new Response(null, { status: 404 });
    if (!isAdminOrEditor({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id)) return new Response(null, { status: 404 });
    const doc = await req.payload.findByID({ collection: "site-imports", id, depth: 0, overrideAccess: true }).catch(() => null);
    if (!doc) return new Response(null, { status: 404 });
    const creator = typeof doc.createdBy === "object" ? doc.createdBy.id : doc.createdBy;
    if (creator !== req.user.id && !isAdmin({ req } as never)) return new Response(null, { status: 403 });
    if (doc.status !== "queued" && doc.status !== "running") {
      return Response.json({ errors: [{ code: "already-finished", message: adminText(req.i18n?.language)("imports.notRunning") }] }, { status: 409 });
    }
    if (!doc.cancelRequested) {
      await req.payload.update({ collection: "site-imports", id, data: { cancelRequested: true }, depth: 0, overrideAccess: true });
    }
    return Response.json({ id, status: doc.status, cancelRequested: true }, { status: 202 });
  },
};
