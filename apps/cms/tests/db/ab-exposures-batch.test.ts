import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { abExposuresBatchEndpoint } from "../../src/endpoints/abExposuresBatch";
import { scratchSchema } from "./scratch-schema";

/**
 * 018-ab-significance (contracts/exposure-intake.md, T009) — first exposures
 * from the edge: one row per visitor and running test, first variant wins,
 * anything that does not match a running test is dropped, never failing the
 * batch.
 */
let db: Awaited<ReturnType<typeof scratchSchema>>;

const V1 = "AbC-_09xYz1";
const V2 = "ZyX_-87wVu2";
const KEY = "page-12-1760000000000";
const AT = "2026-10-19T10:00:00.000Z";
const item = (over: Record<string, unknown> = {}) => ({ visitorId: V1, experimentKey: KEY, variantId: "57", domainId: "3", at: AT, ...over });

const post = async (exposures: unknown, user: object = { isService: true }) => {
  const res = await abExposuresBatchEndpoint.handler({ user, payload: db.payload, json: async () => ({ exposures }) } as never);
  return { status: res.status, body: res.status === 200 ? await res.json() : undefined };
};
const rows = async () =>
  (await db.query("SELECT visitor_id, experiment_key, variant_id, domain_id FROM ab_exposures ORDER BY id")).rows;

beforeAll(async () => {
  db = await scratchSchema(async (schema, query) => {
    await query(`CREATE TABLE ${schema}.pages (id integer PRIMARY KEY, domain_id integer, experiment_of_id integer)`);
    await query(`CREATE TABLE ${schema}.experiments (id serial PRIMARY KEY, growthbook_experiment_key varchar, control_page_id integer, status varchar)`);
    await query(`CREATE TABLE ${schema}.ab_exposures (LIKE public.ab_exposures INCLUDING ALL)`);
  });
  // Running test on control 12 (domain 3) with variant 57; page 80 is a
  // variant of a concluded test; page 90 is on domain 4.
  await db.query("INSERT INTO pages (id, domain_id, experiment_of_id) VALUES (12, 3, NULL), (57, 3, 12), (70, 3, NULL), (80, 3, 70), (90, 4, NULL)");
  await db.query(`INSERT INTO experiments (growthbook_experiment_key, control_page_id, status) VALUES ('${KEY}', 12, 'running'), ('page-70-1', 70, 'concluded')`);
});
afterAll(async () => db?.drop());
beforeEach(async () => {
  await db.query("DELETE FROM ab_exposures");
});

describe("POST /api/ab-exposure-batch", () => {
  it("stores a first exposure", async () => {
    expect(await post([item()])).toEqual({ status: 200, body: { accepted: 1, ignored: 0 } });
    expect(await rows()).toEqual([{ visitor_id: V1, experiment_key: KEY, variant_id: 57, domain_id: 3 }]);
  });

  it("the same batch twice stores it once", async () => {
    await post([item(), item({ visitorId: V2, variantId: "12" })]);
    expect((await post([item(), item({ visitorId: V2, variantId: "12" })])).body).toEqual({ accepted: 0, ignored: 2 });
    expect(await rows()).toHaveLength(2);
  });

  it("keeps the first variant a visitor saw", async () => {
    await post([item({ variantId: "57" })]);
    await post([item({ variantId: "12" })]);
    expect((await rows()).map((r) => r.variant_id)).toEqual([57]);
  });

  it("drops what does not match a running test, without failing the batch", async () => {
    const res = await post([
      item({ experimentKey: "page-70-1", variantId: "80" }), // concluded test
      item({ experimentKey: "page-unknown" }), // unknown test
      item({ variantId: "90" }), // not an arm of the test
      item({ domainId: "4" }), // another domain
      item({ visitorId: "11111111-1111-4111-8111-111111111111" }), // not a view number
      item({ at: "yesterday-ish" }),
      item({ at: "2099-01-01T00:00:00.000Z" }), // in the future
      item({ visitorId: V2 }), // the only good one
    ]);
    expect(res).toEqual({ status: 200, body: { accepted: 1, ignored: 7 } });
    expect((await rows()).map((r) => r.visitor_id)).toEqual([V2]);
  });

  it("400 on an empty, missing or oversized batch", async () => {
    expect((await post([])).status).toBe(400);
    expect((await post(undefined)).status).toBe(400);
    expect((await post(Array.from({ length: 101 }, () => item()))).status).toBe(400);
  });

  it("403 for anyone but the service account", async () => {
    expect((await post([item()], { role: "admin", isActive: true })).status).toBe(403);
    expect((await post([item()], { role: "editor", isActive: true })).status).toBe(403);
  });
});
