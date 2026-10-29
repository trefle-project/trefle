import type { Endpoint } from "payload";

import { isService } from "../access";

/**
 * GET /api/lead-language/:id — 023-admin-i18n (US6, research R9). The
 * language code of the page a lead came from, so the renderer's e-mail link
 * pages (/confirm, /unsubscribe) speak it. Nothing else about the lead leaves
 * the CMS. `{ language: null }` when the lead or its language code is gone: the renderer then falls back to the domain's default.
 * Service account only.
 */
export const leadLanguageEndpoint: Endpoint = {
  path: "/lead-language/:id",
  method: "get",
  handler: async (req) => {
    if (!isService({ req } as never)) return new Response(null, { status: 403 });
    const id = String(req.routeParams?.id ?? "");
    if (!/^\d+$/.test(id)) return Response.json({ error: "bad request" }, { status: 400 });

    // The page's language code as it was when the lead came in (005, copied by leadIntake.ts).
    const lead = (await req.payload
      .findByID({ collection: "leads", id: Number(id), depth: 0, select: { language: true }, overrideAccess: true })
      .catch(() => null)) as { language?: string | null } | null;
    return Response.json({ language: lead?.language || null });
  },
};
