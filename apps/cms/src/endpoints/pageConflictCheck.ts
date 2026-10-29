import type { Endpoint } from "payload";

import { isAdminOrEditor } from "../access";

/**
 * GET /api/pages/conflict-check (004-page-types, FR-014..FR-016,
 * contracts/page-conflict-check.md) — advisory, point-in-time lookup for the
 * creation wizard: does ANY page (draft or published) already use this
 * (domain, path)? Deliberately broader than pages-publish-guard.ts's own
 * clash check, which only considers published pages — that check remains
 * the actual enforcement mechanism, unchanged from 001; this endpoint only
 * saves the editor from filling in the rest of the form before finding out.
 *
 * Registered as a COLLECTION-level endpoint on `Pages.ts` (`path:
 * "/conflict-check"`, relative — Payload strips the `/pages` prefix before
 * matching within a collection's own endpoints), not a top-level one: any
 * `/api/pages/*` request is routed by matching against `pages`'s own
 * `endpoints` array only (`handleEndpoints.js` never falls back to the
 * global `config.endpoints` once the first path segment matches a
 * collection slug), so a top-level registration here would be silently
 * shadowed by the collection's built-in `GET /:id` route ("conflict-check"
 * parsed as an id). Listed before Payload pushes its default CRUD endpoints
 * onto the same array, so it's matched first.
 *
 * Staff only (admin or editor) — reuses the same active-human check as the
 * rest of the admin API (`isAdminOrEditor`), not the narrower service-or-
 * admin pattern `pagePreview.ts`/`pageView.ts` use for renderer callers.
 */
export const pageConflictCheckEndpoint: Endpoint = {
  path: "/conflict-check",
  method: "get",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });

    const q = req.query as Record<string, string | undefined>;
    const domain = q.domain;
    const path = q.path;
    if (!domain || !path) {
      return Response.json({ error: "domain and path are required" }, { status: 400 });
    }

    const clash = await req.payload.find({
      collection: "pages",
      where: { and: [{ domain: { equals: domain } }, { path: { equals: path } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const match = clash.docs[0] as { id?: string | number; title?: string } | undefined;
    if (!match) return Response.json({ conflict: false });
    return Response.json({ conflict: true, pageId: match.id, pageTitle: match.title });
  },
};
