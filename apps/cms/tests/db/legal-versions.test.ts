import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { archiveVersion } from "../../src/lib/legal/build";
import { scratchSchema } from "./scratch-schema";

/** 021-legal-pages (research R5, T009) — each version archived once, with its first publication date. */
let db: Awaited<ReturnType<typeof scratchSchema>>;
const page = (version: string) => ({ html: `<p>${version}</p>`, version, language: "fr", title: "Politique de confidentialité" });

beforeAll(async () => {
  db = await scratchSchema(async (schema, query) => {
    await query(`CREATE TABLE ${schema}.pages (id integer PRIMARY KEY)`);
    await query(`CREATE TABLE ${schema}.legal_versions (LIKE public.legal_versions INCLUDING ALL)`);
  });
});
afterAll(async () => db?.drop());

describe("archiveVersion", () => {
  it("inserts a version once and keeps its first date; a new version is a new row", async () => {
    const first = await archiveVersion(db.payload, 3, "site.example", "privacy", page("aaaaaaaaaaaa"));
    const again = await archiveVersion(db.payload, 3, "site.example", "privacy", page("aaaaaaaaaaaa"));
    expect(again).toBe(first);
    await archiveVersion(db.payload, 3, "site.example", "privacy", page("bbbbbbbbbbbb"));
    await archiveVersion(db.payload, 3, "site.example", "notice", page("aaaaaaaaaaaa"));
    const rows = (await db.query("SELECT kind, version, hostname, html FROM legal_versions ORDER BY id")).rows;
    expect(rows).toEqual([
      { kind: "privacy", version: "aaaaaaaaaaaa", hostname: "site.example", html: "<p>aaaaaaaaaaaa</p>" },
      { kind: "privacy", version: "bbbbbbbbbbbb", hostname: "site.example", html: "<p>bbbbbbbbbbbb</p>" },
      { kind: "notice", version: "aaaaaaaaaaaa", hostname: "site.example", html: "<p>aaaaaaaaaaaa</p>" },
    ]);
  });
});
