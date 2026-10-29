import type { Endpoint } from "payload";

import { isAdmin } from "../access";

/**
 * GET /api/domains/:id/font-usage (015-penpot-site-import, FR-028): for each
 * family of the domain's fonts, how many of the domain's pages name it in
 * their CSS — shown on each « Polices du domaine » row before removing one.
 */
export const domainFontUsageEndpoint: Endpoint = {
  path: "/:id/font-usage",
  method: "get",
  handler: async (req) => {
    if (!req.user || !isAdmin({ req } as never)) return new Response(null, { status: 403 });
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id)) return new Response(null, { status: 404 });
    const domain = await req.payload
      .findByID({ collection: "domains", id, depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!domain) return new Response(null, { status: 404 });
    const families = ((domain as { fonts?: { family?: string }[] }).fonts ?? [])
      .map((f) => f.family)
      .filter((f): f is string => Boolean(f));
    const pages = await req.payload.find({
      collection: "pages",
      where: { domain: { equals: id } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { builder: { css: true } },
    });
    const usage: Record<string, number> = Object.fromEntries(families.map((f) => [f, 0]));
    for (const p of pages.docs as { builder?: { css?: string | null } }[]) {
      const css = p.builder?.css ?? "";
      for (const f of families)
        if (css.includes(`"${f}"`) || css.includes(`'${f}'`) || css.includes(`font-family:${f}`))
          usage[f]!++;
    }
    return Response.json(usage);
  },
};
