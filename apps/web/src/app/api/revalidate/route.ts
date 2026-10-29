import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { edgeTagsFor, revalidateSchema } from "@trefle/shared";

import { queueEdgePurge } from "../../../lib/edge-purge";
import { log } from "../../../lib/log";
import { verifyRevalidateSignature } from "../../../lib/tokens";

/**
 * POST /api/revalidate (T048) — see contracts/revalidation.md.
 * Called by the CMS on publish events with an HMAC-signed body.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-revalidate-signature") ?? "";
  if (!verifyRevalidateSignature(raw, sig)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const parsed = revalidateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  const { tags, at } = parsed.data;
  if (Date.now() - new Date(at).getTime() > 5 * 60_000) {
    return NextResponse.json({ ok: false, error: "stale" }, { status: 400 });
  }

  // `expire: 0`: the next render waits for fresh data instead of being served
  // the stale copy while it reloads ("max", stale-while-revalidate).
  // 017-edge-protection needed it for the media alias map (a stale map renders
  // a deleted image). 020-edge-html-cache needs it for every tag: the request
  // right after the edge purge below is the edge refilling its copy, and with
  // "max" it got the previous version and kept it for a day — every publish
  // showed up one version late (found on the test host, quickstart V7).
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  log.info("revalidated", { tags, reason: parsed.data.reason });
  // 020-edge-html-cache (contracts/purge.md) — then the edge copies. Queued, not
  // awaited: the CMS gets its answer as before. After the loop above, so a page
  // re-rendered for the edge already reads the fresh data (media aliases first).
  queueEdgePurge(edgeTagsFor(tags));
  return NextResponse.json({ ok: true, revalidated: tags });
}
