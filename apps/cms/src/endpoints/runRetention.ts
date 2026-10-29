import type { Endpoint } from "payload";

import { readJson } from "../lib/req";
import { runRetentionSweep } from "../lib/retention";
import { isAdmin } from "../access";

/**
 * POST /api/run-retention (T074) — Administrator only. Runs the retention sweep
 * now. Optional `{ nowMinusDays }` overrides the cutoff for testing/ops (erase
 * everything older than N days instead of the configured months).
 */
export const runRetentionEndpoint: Endpoint = {
  path: "/run-retention",
  method: "post",
  handler: async (req) => {
    if (!isAdmin({ req } as never)) return Response.json({ ok: false, code: "forbidden" }, { status: 403 });
    const body = await readJson<{ nowMinusDays?: number }>(req);
    const olderThan =
      body?.nowMinusDays != null ? new Date(Date.now() - body.nowMinusDays * 86_400_000) : undefined;
    const result = await runRetentionSweep(req.payload, { olderThan });
    return Response.json({ ok: true, ...result });
  },
};
