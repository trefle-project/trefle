import type { Endpoint } from "payload";
import { readJson } from "../lib/req";

import { incrementPageStat } from "../lib/page-stats";
import { isServiceOrAdmin } from "../access";

/**
 * POST /api/page-view (T041) — fire-and-forget view counter. Called by the
 * renderer on full server renders only (not ISR cache hits). Failures are
 * swallowed; a bad count must never affect a page render.
 */
export const pageViewEndpoint: Endpoint = {
  path: "/page-view",
  method: "post",
  handler: async (req) => {
    if (!isServiceOrAdmin({ req } as never)) return new Response(null, { status: 403 });
    const body = await readJson<{ pageId?: string }>(req);
    if (body?.pageId) {
      try {
        await incrementPageStat(req.payload, body.pageId, "views");
      } catch {
        /* swallow — best effort */
      }
    }
    return new Response(null, { status: 204 });
  },
};
