import { CRAWLER_UA_RE } from "@trefle/shared";

import type { AbDecision } from "./ab";
import { hmacHex } from "./sign";

/**
 * 020-edge-html-cache, contracts/edge-worker.md §3 step 5 and §7, amended by
 * 018 — exposures for the A/B analysis, written by the edge, one per view of
 * a page under test (research R15: cookieless, `visitorId` holds the view
 * number). `EXPOSURES=off` turns the measurement off.
 */
export interface Exposure {
  visitorId: string;
  experimentKey: string;
  variantId: string;
  domainId: string;
  at: string;
}

export interface ExposuresEnv {
  EXPOSURES: string;
  EXPOSURES_QUEUE: Queue<Exposure>;
  EDGE_SECRET: string;
  ORIGIN_INGEST_URL: string;
}

/**
 * 018 contracts/edge-worker.md §3 (research R15) — one exposure per view of a
 * page under test, numbered with the view number this response's form token
 * carries, so a lead sent from this view is attributed to it. Declared
 * crawlers are not counted. Never throws.
 */
export function maybeSendExposure(env: ExposuresEnv, ctx: ExecutionContext, request: Request, decision: AbDecision, viewNumber: string): void {
  if (env.EXPOSURES !== "on" || !decision.experimentKey) return;
  if (CRAWLER_UA_RE.test(request.headers.get("user-agent") ?? "")) return;
  const exposure: Exposure = {
    visitorId: viewNumber,
    experimentKey: decision.experimentKey,
    variantId: decision.variantId,
    domainId: decision.domainId,
    at: new Date().toISOString(),
  };
  ctx.waitUntil(env.EXPOSURES_QUEUE.send(exposure).catch(() => {}));
}

/** Contract §7: one signed POST per batch; ack on 2xx, retry the batch otherwise (then the dead-letter queue). */
export async function consumeExposures(batch: MessageBatch<Exposure>, env: ExposuresEnv): Promise<void> {
  try {
    const body = JSON.stringify({ at: new Date().toISOString(), exposures: batch.messages.map((m) => m.body) });
    const res = await fetch(new URL("/api/edge/exposures", env.ORIGIN_INGEST_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "trefle-edge-queue", "x-trefle-signature": await hmacHex(env.EDGE_SECRET, body) },
      body,
    });
    if (res.ok) batch.ackAll();
    else {
      console.error("exposures: origin refused", res.status);
      batch.retryAll();
    }
  } catch (err) {
    console.error("exposures: post failed", err instanceof Error ? err.message : String(err));
    batch.retryAll();
  }
}
