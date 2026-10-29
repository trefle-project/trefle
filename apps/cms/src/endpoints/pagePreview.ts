import type { Endpoint } from "payload";
import { readJson } from "../lib/req";
import { isServiceOrAdmin } from "../access";

/**
 * POST /api/page-preview (T049a) — returns a page at ANY status for the
 * renderer's authenticated preview route. Service/admin only; never cached.
 */
export const pagePreviewEndpoint: Endpoint = {
  path: "/page-preview",
  method: "post",
  handler: async (req) => {
    if (!isServiceOrAdmin({ req } as never)) return new Response(null, { status: 403 });
    const body = await readJson<{ pageId?: string | number }>(req);
    if (!body?.pageId) return Response.json({ error: "pageId required" }, { status: 400 });
    const id = typeof body.pageId === "number" ? body.pageId : Number(body.pageId);
    const page = await req.payload
      .findByID({ collection: "pages", id, depth: 1, overrideAccess: true })
      .catch(() => null);
    if (!page) return new Response(null, { status: 404 });
    return Response.json(page);
  },
};
