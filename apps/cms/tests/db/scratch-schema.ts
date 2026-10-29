import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "@payloadcms/db-postgres/drizzle/node-postgres";
import pg from "pg";

/** DATABASE_URL from the environment, else apps/cms/.env.local (host runs). */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = readFileSync(join(__dirname, "../../.env.local"), "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).trim();
  } catch {
    /* fall through */
  }
  throw new Error("DATABASE_URL is not set (environment or apps/cms/.env.local)");
}

/**
 * A throwaway schema with copies of `page_stats` (unique (page_id, date)
 * index included), `page_stats_hourly`, `edge_view_windows` and a bare `pages(id)`, first on the
 * search path, so the code's unqualified table names land there. Built from
 * the real tables (`LIKE … INCLUDING ALL`): needs the migrations applied.
 * `setup` replaces the bare `pages` table with the tables a test needs.
 */
export async function scratchSchema(setup?: (schema: string, query: (text: string) => Promise<unknown>) => Promise<void>) {
  const url = databaseUrl();
  const schema = `test_edge_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`CREATE TABLE ${schema}.page_stats (LIKE public.page_stats INCLUDING ALL)`);
  await admin.query(`CREATE TABLE ${schema}.edge_view_windows (LIKE public.edge_view_windows INCLUDING ALL)`);
  // 022-ux-improvement — the hourly counters written next to page_stats.
  await admin.query(`CREATE TABLE ${schema}.page_stats_hourly (LIKE public.page_stats_hourly INCLUDING ALL)`);
  if (setup) await setup(schema, (text) => admin.query(text));
  else await admin.query(`CREATE TABLE ${schema}.pages (id integer PRIMARY KEY)`);
  const pool = new pg.Pool({ connectionString: url, max: 20, options: `-c search_path=${schema}` });
  const db = drizzle(pool);
  return {
    /** Stands in for `payload` where the code only reads `payload.db.drizzle`. */
    payload: { db: { drizzle: db } } as never,
    query: (text: string, values?: unknown[]) => pool.query(text, values),
    async drop() {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
