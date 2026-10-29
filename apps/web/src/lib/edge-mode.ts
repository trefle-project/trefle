import { headers } from "next/headers";
import { EDGE_HEADER, EDGE_RENDER_HEADER } from "@trefle/shared";

/**
 * 020-edge-html-cache, contracts/origin-edge-mode.md — a request carrying
 * `EDGE_SECRET` in `X-Trefle-Edge` comes from the edge Worker and is rendered
 * in edge mode (placeholders instead of per-visit values). Anything else, or
 * `EDGE_SECRET` unset, is legacy mode: today's behaviour.
 *
 * Plain-JS constant-time compare: middleware runs on the edge runtime, where
 * `node:crypto` is not available.
 */
export function isEdgeRequest(requestHeaders: Headers): boolean {
  const secret = process.env.EDGE_SECRET;
  const sent = requestHeaders.get(EDGE_HEADER);
  if (!secret || !sent || sent.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ sent.charCodeAt(i);
  return diff === 0;
}

/** In a render: did middleware switch this request to edge mode? */
export async function isEdgeRender(): Promise<boolean> {
  return (await headers()).get(EDGE_RENDER_HEADER) === "1";
}
