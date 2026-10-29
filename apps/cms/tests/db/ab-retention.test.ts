import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runRetentionSweep } from "../../src/lib/retention";
import { scratchSchema } from "./scratch-schema";

/**
 * 018-ab-significance (FR-007, SC-005, T013) — exposures and attributions of
 * a test ended more than 30 days ago are deleted; a test ended 29 days ago
 * and a running test keep theirs.
 */
let db: Awaited<ReturnType<typeof scratchSchema>>;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

beforeAll(async () => {
  db = await scratchSchema(async (schema, query) => {
    await query(`CREATE TABLE ${schema}.pages (id integer PRIMARY KEY)`);
    await query(`CREATE TABLE ${schema}.experiments (id serial PRIMARY KEY, growthbook_experiment_key varchar, status varchar, ended_at timestamptz, analysis jsonb)`);
    await query(`CREATE TABLE ${schema}.ab_exposures (id serial PRIMARY KEY, visitor_id varchar, experiment_key varchar)`);
    await query(`CREATE TABLE ${schema}.ab_conversions (id serial PRIMARY KEY, visitor_id varchar, experiment_key varchar)`);
  });
  await db.query(
    `INSERT INTO experiments (growthbook_experiment_key, status, ended_at, analysis) VALUES
     ('old', 'concluded', $1, '{"totalUsers": 2}'), ('recent', 'concluded', $2, NULL), ('live', 'running', NULL, NULL)`,
    [daysAgo(31), daysAgo(29)],
  );
  for (const key of ["old", "recent", "live"]) {
    await db.query("INSERT INTO ab_exposures (visitor_id, experiment_key) VALUES ('a', $1), ('b', $1)", [key]);
    await db.query("INSERT INTO ab_conversions (visitor_id, experiment_key) VALUES ('a', $1)", [key]);
  }
});
afterAll(async () => db?.drop());

describe("retention sweep — A/B data (018)", () => {
  it("deletes only the rows of tests ended more than 30 days ago, keeps their analysis", async () => {
    const payload = {
      ...(db.payload as object),
      find: async () => ({ docs: [], hasNextPage: false }),
      delete: async () => ({ docs: [] }),
    };
    const result = await runRetentionSweep(payload as never, { olderThan: new Date(0) });
    expect(result).toMatchObject({ abExposuresDeleted: 2, abConversionsDeleted: 1 });
    const keys = async (table: string) => (await db.query(`SELECT DISTINCT experiment_key FROM ${table} ORDER BY 1`)).rows.map((r) => r.experiment_key);
    expect(await keys("ab_exposures")).toEqual(["live", "recent"]);
    expect(await keys("ab_conversions")).toEqual(["live", "recent"]);
    expect((await db.query("SELECT analysis FROM experiments WHERE growthbook_experiment_key = 'old'")).rows[0].analysis).toEqual({ totalUsers: 2 });
  });
});
