import type { Endpoint } from "payload";
import { readJson } from "../lib/req";

import { writeActivity } from "../lib/activity";
import { eraseLeadPersonalData } from "../lib/erase";
import { isAdmin } from "../access";

/**
 * POST /api/dsr-erase (T063, FR-026/027) — **Administrator only**.
 * `{ email, requestId? }` → erase-in-place every lead for that email across all
 * pages (including orphaned leads whose page was deleted) and each linked
 * consent record's personal fields; stamp `erasedAt`. Completes the request
 * (which clears its `email` via the dsr-complete hook, T064) and appends
 * `dsr-completed` to the activity log.
 */
export const dsrEraseEndpoint: Endpoint = {
  path: "/dsr-erase",
  method: "post",
  handler: async (req) => {
    if (!isAdmin({ req } as never)) return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
    const body = await readJson<{ email?: string; requestId?: string | number }>(req);
    const email = body?.email?.trim().toLowerCase();
    if (!email) return Response.json({ ok: false, code: "bad_request" }, { status: 400 });

    const { payload } = req;
    const matches = await payload.find({
      collection: "leads",
      where: { and: [{ email: { equals: email } }, { erasedAt: { equals: null } }] },
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    });

    let erased = 0;
    for (const lead of matches.docs as { id: string | number }[]) {
      if (await eraseLeadPersonalData(payload, lead.id)) erased += 1;
    }

    if (body?.requestId != null) {
      await payload.update({
        collection: "data-subject-requests",
        id: typeof body.requestId === "number" ? body.requestId : Number(body.requestId),
        data: { status: "completed" },
        overrideAccess: true,
      });
    }

    void writeActivity(payload, {
      type: "dsr-completed",
      actor: req.user?.id ?? null,
      targetType: "erasure",
      targetId: `${erased} leads erased`,
      meta: { kind: "erasure", erased, requestId: body?.requestId ?? null },
      req,
    });

    return Response.json({ ok: true, erased });
  },
};
