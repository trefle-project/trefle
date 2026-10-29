import { NextResponse } from "next/server";

import { readEdgeBatch } from "../../../../lib/edge-ingest";
import { log } from "../../../../lib/log";
import { postPageViewBatch } from "../../../../lib/payload-client";

/**
 * POST /api/edge/views — 020-edge-html-cache, contracts/edge-ingest.md.
 * The edge Worker's per-minute page-view windows, signed with EDGE_SECRET,
 * forwarded to the CMS's idempotent batch intake. Never routed through the
 * Worker (`/api/` paths have a no-Worker route).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const batch = await readEdgeBatch<{ windows?: unknown }>(req);
  if ("response" in batch) return batch.response;
  const { windows } = batch.body;
  if (!Array.isArray(windows)) return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });

  const status = await postPageViewBatch(windows).catch(() => 0);
  if (status < 200 || status >= 300) {
    log.error("edge views not recorded", { status, windows: windows.length });
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
