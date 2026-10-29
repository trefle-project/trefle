import { NextResponse } from "next/server";

import { readEdgeBatch } from "../../../../lib/edge-ingest";
import { log } from "../../../../lib/log";
import { postAbExposureBatch } from "../../../../lib/payload-client";

/**
 * POST /api/edge/exposures — 020-edge-html-cache (contracts/edge-ingest.md),
 * 018-ab-significance (contracts/exposure-intake.md). First exposures to A/B
 * tests from the edge Worker's queue, signed with EDGE_SECRET, forwarded to
 * the CMS's idempotent intake; its status goes back so the queue retries the
 * whole batch on anything but 2xx.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const batch = await readEdgeBatch<{ exposures?: unknown }>(req);
  if ("response" in batch) return batch.response;
  const { exposures } = batch.body;
  if (!Array.isArray(exposures)) return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });

  const result = await postAbExposureBatch(exposures).catch(() => ({ status: 502, body: null }));
  if (result.status < 200 || result.status >= 300) {
    log.error("edge exposures not recorded", { status: result.status, exposures: exposures.length });
  }
  return NextResponse.json(result.body ?? { ok: false }, { status: result.status });
}
