import type { Endpoint } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { isViewNumber } from "@trefle/shared";

import { runningTestsByKey } from "../lib/ab-tests";
import { drizzleOf } from "../lib/page-stats";
import { readJson } from "../lib/req";
import { isService } from "../access";

/**
 * POST /api/ab-exposure-batch — 018-ab-significance,
 * contracts/exposure-intake.md. First exposures to running A/B tests, queued
 * by the edge Worker and forwarded by the renderer (`/api/edge/exposures`).
 * Service caller only. (Not `/ab-exposures/batch`: under the collection's own
 * slug, Payload reads `batch` as a document id and answers 404.)
 *
 * An item that does not match a running test (unknown or concluded key, a
 * page that is not one of its arms, another domain, a bad id or time) is
 * dropped and counted, never failing the batch: the queue would retry it
 * forever. Kept items go in one insert; the unique (visitor, test) index
 * keeps the first exposure and makes a re-sent batch harmless.
 */
const MAX_ITEMS = 100;
const FUTURE_SLACK_MS = 5 * 60_000;

type Item = { visitorId?: unknown; experimentKey?: unknown; variantId?: unknown; domainId?: unknown; at?: unknown };

export const abExposuresBatchEndpoint: Endpoint = {
  path: "/ab-exposure-batch",
  method: "post",
  handler: async (req) => {
    if (!isService({ req } as never)) return new Response(null, { status: 403 });
    const items = (await readJson<{ exposures?: unknown }>(req))?.exposures;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
      return Response.json({ error: "bad body" }, { status: 400 });
    }

    const tests = await runningTestsByKey(req.payload);
    const now = Date.now();
    const kept: { visitorId: string; key: string; variant: number; domain: number; at: string }[] = [];
    for (const item of items as Item[]) {
      const test = typeof item?.experimentKey === "string" ? tests.get(item.experimentKey) : undefined;
      const variant = Number(item?.variantId);
      const domain = Number(item?.domainId);
      const at = typeof item?.at === "string" ? Date.parse(item.at) : NaN;
      if (
        !test ||
        !isViewNumber(item.visitorId) ||
        !test.arms.has(variant) ||
        domain !== test.domainId ||
        !Number.isFinite(at) ||
        at > now + FUTURE_SLACK_MS
      ) {
        continue;
      }
      kept.push({ visitorId: item.visitorId, key: item.experimentKey as string, variant, domain, at: new Date(at).toISOString() });
    }

    let accepted = 0;
    if (kept.length) {
      const values = kept.map((e) => sql`(${e.visitorId}, ${e.key}, ${e.variant}, ${e.domain}, ${e.at}, now(), now())`);
      const { rows } = await drizzleOf(req.payload).execute(sql`
        INSERT INTO ab_exposures (visitor_id, experiment_key, variant_id, domain_id, exposed_at, updated_at, created_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (visitor_id, experiment_key) DO NOTHING
        RETURNING id`);
      accepted = rows.length;
    }
    return Response.json({ accepted, ignored: items.length - accepted });
  },
};
