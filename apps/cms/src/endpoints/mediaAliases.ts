import type { Endpoint } from "payload";

import { isStaffOrService } from "../access";
import { buildAliasMap } from "../hooks/media-aliases";

/**
 * GET /api/media/aliases (017-edge-protection, contracts/media-aliases.md) —
 * old media key → current key. Read by the renderer (service account) and by
 * the page editor, which applies it when a page opens so a replaced image
 * shows its new file there too. Only file names: any active staff member may
 * read it.
 */

export const mediaAliasesEndpoint: Endpoint = {
  path: "/aliases",
  method: "get",
  handler: async (req) => {
    if (!isStaffOrService({ req } as Parameters<typeof isStaffOrService>[0])) return new Response(null, { status: 403 });
    const found = await req.payload.find({
      collection: "media",
      where: { "previousFilenames.filename": { exists: true } },
      select: { filename: true, previousFilenames: true },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    // A current key can only be "current" if we know every current key, not
    // just those of documents with aliases: check the candidates against them.
    const aliases = buildAliasMap(found.docs);
    const olds = Object.keys(aliases);
    if (olds.length > 0) {
      const clashes = await req.payload.find({
        collection: "media",
        where: { filename: { in: olds } },
        select: { filename: true },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });
      for (const c of clashes.docs) if (c.filename) delete aliases[c.filename];
    }
    return Response.json({ aliases, generatedAt: new Date().toISOString() });
  },
};
