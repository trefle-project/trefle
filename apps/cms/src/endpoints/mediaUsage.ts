import type { Endpoint } from "payload";

import { isAdminOrEditor } from "../access";
import { findMediaUsage } from "../lib/media-usage";

/**
 * GET /api/media/:id/usage (017-edge-protection, contracts/media-usage.md) —
 * the pages and domains using a media item. Admin or editor only.
 */
export const mediaUsageEndpoint: Endpoint = {
  path: "/:id/usage",
  method: "get",
  handler: async (req) => {
    if (!(await isAdminOrEditor({ req } as never))) return new Response(null, { status: 403 });
    const id = req.routeParams?.id as string | undefined;
    const media = id
      ? await req.payload
          .findByID({ collection: "media", id, depth: 0, overrideAccess: true, disableErrors: true })
          .catch(() => null)
      : null;
    if (!media) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(await findMediaUsage(req.payload, media));
  },
};
