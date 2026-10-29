import { randomBytes } from "node:crypto";

import { drizzle } from "@payloadcms/db-postgres/drizzle/node-postgres";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { down, up } from "../../src/migrations/20261028_113848_admin_language";
import { databaseUrl } from "./scratch-schema";

/**
 * 023-admin-i18n (T012) — the admin-language migration on a throwaway
 * database (its enum types live in `public`, so a scratch schema is not
 * enough): existing installs get French, fresh ones keep English, nobody's
 * values or `updated_at` change, and down restores the previous shape.
 */
let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function throwawayDatabase(withMembers: boolean) {
  const url = databaseUrl();
  const name = `test_i18n_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const dbUrl = new URL(url);
  dbUrl.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString() });
  // The columns this migration touches, plus one a user set, to prove it stays.
  await pool.query(`CREATE TABLE settings (id serial PRIMARY KEY, admin_timezone varchar, updated_at timestamptz)`);
  await pool.query(`CREATE TABLE users (id serial PRIMARY KEY, email varchar, display_timezone varchar)`);
  await pool.query(`INSERT INTO settings (admin_timezone, updated_at) VALUES ('America/Montreal', '2026-10-01T10:00:00Z')`);
  if (withMembers) await pool.query(`INSERT INTO users (email, display_timezone) VALUES ('a@example.test', 'UTC'), ('b@example.test', NULL)`);
  cleanup = async () => {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  };
  const db = drizzle(pool);
  const args = { db, payload: {}, req: {} } as never;
  return { pool, migrateUp: () => up(args), migrateDown: () => down(args) };
}

const columns = async (pool: pg.Pool, table: string) =>
  (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`, [table])).rows.map((r) => r.column_name);

describe("20261028_113848_admin_language", () => {
  it("gives an installation with members a French admin, without touching what users set", async () => {
    const { pool, migrateUp } = await throwawayDatabase(true);
    await migrateUp();
    const settings = (await pool.query(`SELECT admin_language, admin_timezone, updated_at FROM settings`)).rows[0];
    expect(settings.admin_language).toBe("fr");
    expect(settings.admin_timezone).toBe("America/Montreal");
    expect(new Date(settings.updated_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    const users = (await pool.query(`SELECT email, display_timezone, admin_language FROM users ORDER BY id`)).rows;
    expect(users).toEqual([
      { email: "a@example.test", display_timezone: "UTC", admin_language: null },
      { email: "b@example.test", display_timezone: null, admin_language: null },
    ]);
  });

  it("keeps English on a fresh database whose Settings row the 021 migration created (no member yet)", async () => {
    const { pool, migrateUp } = await throwawayDatabase(false);
    await migrateUp();
    expect((await pool.query(`SELECT admin_language FROM settings`)).rows[0].admin_language).toBe("en");
  });

  it("gives a Settings row created later English by default", async () => {
    const { pool, migrateUp } = await throwawayDatabase(false);
    await pool.query(`DELETE FROM settings`);
    await migrateUp();
    await pool.query(`INSERT INTO settings (admin_timezone) VALUES ('Europe/Paris')`);
    expect((await pool.query(`SELECT admin_language FROM settings`)).rows[0].admin_language).toBe("en");
  });

  it("down restores the previous tables, members otherwise identical", async () => {
    const { pool, migrateUp, migrateDown } = await throwawayDatabase(true);
    const before = { settings: await columns(pool, "settings"), users: await columns(pool, "users"), rows: (await pool.query(`SELECT * FROM users ORDER BY id`)).rows };
    await migrateUp();
    await migrateDown();
    expect(await columns(pool, "settings")).toEqual(before.settings);
    expect(await columns(pool, "users")).toEqual(before.users);
    expect((await pool.query(`SELECT * FROM users ORDER BY id`)).rows).toEqual(before.rows);
    const types = await pool.query(`SELECT typname FROM pg_type WHERE typname LIKE 'enum_%admin_language'`);
    expect(types.rows).toEqual([]);
  });
});
