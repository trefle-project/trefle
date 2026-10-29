import { NextResponse } from "next/server";

import { verifyEdgeSignature } from "./tokens";

/**
 * 020-edge-html-cache, contracts/edge-ingest.md — the checks every batch from
 * the edge Worker goes through: `X-Trefle-Signature` (hex HMAC-SHA256 of the
 * raw body with EDGE_SECRET) → 401, `at` more than 5 minutes off → 400.
 * Returns the parsed body, or the response to send back.
 */
const MAX_AGE_MS = 5 * 60_000;

export async function readEdgeBatch<T extends object>(req: Request): Promise<{ body: T } | { response: NextResponse }> {
  const raw = await req.text();
  if (!verifyEdgeSignature(raw, req.headers.get("x-trefle-signature") ?? "")) {
    return { response: NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 }) };
  }
  let body: T & { at?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return { response: NextResponse.json({ ok: false, error: "bad body" }, { status: 400 }) };
  }
  const at = Date.parse(body.at ?? "");
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) {
    return { response: NextResponse.json({ ok: false, error: "stale" }, { status: 400 }) };
  }
  return { body };
}
