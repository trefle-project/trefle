import { randomBytes } from "node:crypto";

import { drizzle } from "@payloadcms/db-postgres/drizzle/node-postgres";
import { convertMarkdownToLexical, editorConfigFactory } from "@payloadcms/richtext-lexical";
import type { SanitizedConfig } from "payload";
import pg from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_LEGAL_NOTICE_FR, DEFAULT_PRIVACY_POLICY_FR } from "../../src/lib/legal/defaults";
import { down, OLD_LEGAL_NOTICE_FR, OLD_PRIVACY_POLICY_FR, rewrite, up } from "../../src/migrations/20261028_160000_english_public_paths";
import { databaseUrl } from "./scratch-schema";

/**
 * 023-admin-i18n (US7, T028) — the default legal texts move to the English
 * paths only when nobody touched them; down puts them back; editor pages on a
 * new path are reported. On a throwaway database.
 */
// The editor config the 021 migration used comes from the real Payload config,
// which needs these to load (nothing connects here).
process.env.PAYLOAD_SECRET ||= "test-secret";
process.env.DATABASE_URL ||= databaseUrl();
let config: SanitizedConfig;
let lexical: (markdown: string) => string;
beforeAll(async () => {
  config = await (await import("../../src/payload.config")).default;
  const editorConfig = await editorConfigFactory.default({ config });
  lexical = (markdown) => JSON.stringify(convertMarkdownToLexical({ editorConfig, markdown }));
});

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function throwawayDatabase() {
  const url = databaseUrl();
  const name = `test_paths_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const dbUrl = new URL(url);
  dbUrl.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString() });
  await pool.query(`CREATE TABLE settings (id serial PRIMARY KEY, default_privacy_notice_url varchar)`);
  await pool.query(`CREATE TABLE settings_legal_texts (id varchar PRIMARY KEY, privacy_policy jsonb, legal_notice jsonb)`);
  await pool.query(`CREATE TABLE pages (id serial PRIMARY KEY, path varchar)`);
  cleanup = async () => {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const args = { db: drizzle(pool), payload: { config, logger }, req: {} } as never;
  return { pool, logger, migrateUp: () => up(args), migrateDown: () => down(args) };
}

const texts = async (pool: pg.Pool) =>
  (await pool.query(`SELECT id, privacy_policy::text AS privacy, legal_notice::text AS notice FROM settings_legal_texts ORDER BY id`)).rows;
const same = (stored: string, json: string) => expect(JSON.parse(stored)).toEqual(JSON.parse(json));
// Lexical gives each link a random id: two conversions differ by those only.
const withoutIds = (json: string) => JSON.parse(json, (key, value) => (key === "id" ? undefined : value));
const sameText = (stored: string, json: string) => expect(withoutIds(stored)).toEqual(withoutIds(json));
const links = (json: string) => {
  const found: { id: string; url: string }[] = [];
  JSON.parse(json, (_key, value) => {
    if (value?.type === "link") found.push({ id: value.id, url: value.fields.url });
    return value;
  });
  return found;
};

describe("20261028_160000_english_public_paths", () => {
  it("the frozen texts are today's defaults with the old links", () => {
    expect(rewrite(OLD_PRIVACY_POLICY_FR, "up")).toBe(DEFAULT_PRIVACY_POLICY_FR);
    expect(rewrite(OLD_LEGAL_NOTICE_FR, "up")).toBe(DEFAULT_LEGAL_NOTICE_FR);
    expect(OLD_PRIVACY_POLICY_FR).toContain("(/mesure-audience)");
    expect(OLD_LEGAL_NOTICE_FR).toContain("(/confidentialite)");
  });

  it("moves untouched defaults, leaves edited texts, moves the hidden form default, and down puts them back", async () => {
    const { pool, migrateUp, migrateDown } = await throwawayDatabase();
    const edited = lexical(`${OLD_LEGAL_NOTICE_FR}\n\nUn paragraphe ajouté.`);
    await pool.query(`INSERT INTO settings (default_privacy_notice_url) VALUES ('/confidentialite')`);
    await pool.query(`INSERT INTO settings_legal_texts VALUES ('a', $1::jsonb, $2::jsonb), ('b', $1::jsonb, $3::jsonb)`, [
      lexical(OLD_PRIVACY_POLICY_FR),
      lexical(OLD_LEGAL_NOTICE_FR),
      edited,
    ]);

    const [before] = await texts(pool);

    await migrateUp();
    const [a, b] = await texts(pool);
    sameText(a.privacy, lexical(DEFAULT_PRIVACY_POLICY_FR));
    sameText(a.notice, lexical(DEFAULT_LEGAL_NOTICE_FR));
    sameText(b.privacy, lexical(DEFAULT_PRIVACY_POLICY_FR));
    same(b.notice, edited);
    // Only the addresses changed: the stored links keep their ids.
    expect(links(a.privacy).map((l) => l.id)).toEqual(links(before.privacy).map((l) => l.id));
    expect(links(a.privacy).map((l) => l.url)).toContain("/audience-measurement");
    expect(links(a.notice).map((l) => l.url)).toContain("/privacy");
    expect((await pool.query(`SELECT default_privacy_notice_url FROM settings`)).rows[0].default_privacy_notice_url).toBe("/privacy");

    await migrateDown();
    const [a2, b2] = await texts(pool);
    same(a2.privacy, before.privacy);
    same(a2.notice, before.notice);
    same(b2.notice, edited);
    expect((await pool.query(`SELECT default_privacy_notice_url FROM settings`)).rows[0].default_privacy_notice_url).toBe("/confidentialite");
  });

  it("leaves a form default someone pointed elsewhere", async () => {
    const { pool, migrateUp } = await throwawayDatabase();
    await pool.query(`INSERT INTO settings (default_privacy_notice_url) VALUES ('https://owner.example/privacy')`);
    await migrateUp();
    expect((await pool.query(`SELECT default_privacy_notice_url FROM settings`)).rows[0].default_privacy_notice_url).toBe("https://owner.example/privacy");
  });

  it("reports editor pages sitting on a new path", async () => {
    const { pool, logger, migrateUp } = await throwawayDatabase();
    await pool.query(`INSERT INTO pages (path) VALUES ('/privacy'), ('/offre'), ('/audience-measurement/')`);
    await migrateUp();
    const warned = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warned).toHaveLength(2);
    expect(warned[0]).toContain("page 1 is at /privacy");
    expect(warned[1]).toContain("page 3 is at /audience-measurement/");
  });
});
