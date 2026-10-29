import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 018-ab-significance (research R4, T008) — GrowthBook's role reads the two
 * A/B tables and nothing else. Checked on the real schema (migrations
 * applied), privileges only: no data is read or written.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(join(__dirname, "../../.env.local"), "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not set (environment or apps/cms/.env.local)");
  return line.slice("DATABASE_URL=".length).trim();
}

let client: pg.Client;
const can = async (table: string, privilege = "SELECT") =>
  (await client.query("SELECT has_table_privilege('growthbook_reader', $1, $2) AS ok", [`public.${table}`, privilege])).rows[0].ok as boolean;

beforeAll(async () => {
  client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
});
afterAll(async () => client?.end());

describe("growthbook_reader", () => {
  it("exists", async () => {
    expect((await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'growthbook_reader'")).rowCount).toBe(1);
  });

  it("can read the A/B exposures and attributed leads", async () => {
    expect(await can("ab_exposures")).toBe(true);
    expect(await can("ab_conversions")).toBe(true);
  });

  it("cannot write them", async () => {
    for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
      expect(await can("ab_exposures", privilege)).toBe(false);
      expect(await can("ab_conversions", privilege)).toBe(false);
    }
  });

  it("cannot read leads, pages, users or any other table", async () => {
    for (const table of ["leads", "pages", "users", "domains", "experiments", "consent_records", "page_stats"]) {
      expect(await can(table)).toBe(false);
    }
  });
});
