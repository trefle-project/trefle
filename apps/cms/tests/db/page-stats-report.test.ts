import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { backfillHourlyStats, HourRangeError, pageStatsSeries, pageStatsTotals } from "../../src/lib/page-stats";
import { scratchSchema } from "./scratch-schema";

/**
 * 022-ux-improvement (US1, contracts/page-stats.md, T005/T006/T009) — Pages
 * Stats: one row per page over a period, deleted pages grouped, days in the
 * member's zone when hourly data covers the period, UTC days otherwise.
 */
let db: Awaited<ReturnType<typeof scratchSchema>>;
const sqlDb = () => (db.payload as unknown as { db: { drizzle: Parameters<typeof pageStatsTotals>[0] } }).db.drizzle;

beforeAll(async () => {
  db = await scratchSchema(async (schema, query) => {
    await query(`CREATE TABLE ${schema}.domains (id integer PRIMARY KEY, hostname text)`);
    await query(`CREATE TABLE ${schema}.pages (id integer PRIMARY KEY, title text, status text, domain_id integer)`);
    await query(`CREATE TABLE ${schema}.leads (id serial PRIMARY KEY, page_id integer, submitted_at timestamptz)`);
  });
  await db.query("INSERT INTO domains VALUES (1, 'a.example'), (2, 'b.example')");
  await db.query("INSERT INTO pages VALUES (10, 'Accueil', 'published', 1), (11, 'Offre', 'published', 2), (12, 'Brouillon', 'draft', 1), (13, 'Vide', 'published', 1)");
});
afterAll(async () => db?.drop());
beforeEach(async () => {
  for (const t of ["page_stats", "page_stats_hourly", "edge_view_windows", "leads"]) await db.query(`DELETE FROM ${t}`);
});

const day = (page: number | null, date: string, views: number, submissions = 0) =>
  db.query("INSERT INTO page_stats (page_id, date, views, submissions, updated_at, created_at) VALUES ($1, $2, $3, $4, now(), now())", [page, `${date}T00:00:00.000Z`, views, submissions]);
const hour = (page: number | null, at: string, views: number, submissions = 0) =>
  db.query("INSERT INTO page_stats_hourly (page_id, hour, views, submissions, updated_at, created_at) VALUES ($1, $2, $3, $4, now(), now())", [page, at, views, submissions]);

describe("pageStatsTotals", () => {
  it("UTC basis (no hourly data): one row per page, published at 0, draft with stats listed, deleted grouped", async () => {
    await day(10, "2026-09-01", 100, 5);
    await day(10, "2026-09-02", 50, 0);
    await day(11, "2026-09-01", 10, 1);
    await day(12, "2026-09-02", 7, 0);
    await day(null, "2026-09-01", 30, 2);
    await day(10, "2026-08-31", 999, 9); // outside the period
    const t = await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-09-01", to: "2026-09-02", tz: "Europe/Paris" });
    expect(t.dayBasis).toBe("utc");
    expect(t.rows.map((r) => [r.id, r.views, r.submissions])).toEqual([
      [10, 150, 5],
      [11, 10, 1],
      [12, 7, 0],
      [13, 0, 0],
    ]);
    expect(t.rows[0]).toMatchObject({ title: "Accueil", domain: "a.example", rate: 5 / 150 });
    expect(t.rows.find((r) => r.id === 13)!.rate).toBeNull();
    expect(t.deleted).toMatchObject({ id: null, title: "Pages supprimées", views: 30, submissions: 2 });
  });

  it("search (title, ID or domain, accent-insensitive) and filters (domain, status, with views)", async () => {
    await day(10, "2026-09-01", 5, 1);
    await day(12, "2026-09-01", 3, 0);
    await day(null, "2026-09-01", 2, 0);
    const ids = async (filters: Parameters<typeof pageStatsTotals>[1]["filters"]) =>
      (await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-09-01", to: "2026-09-01", tz: "UTC", filters })).rows.map((r) => r.id);
    expect(await ids({ q: "accueil" })).toEqual([10]);
    expect(await ids({ q: "OFFRE" })).toEqual([11]);
    expect(await ids({ q: "12" })).toEqual([12]);
    expect(await ids({ q: "b.example" })).toEqual([11]);
    expect(await ids({ domain: "a.example" })).toEqual([10, 12, 13]);
    expect(await ids({ status: "draft" })).toEqual([12]);
    expect(await ids({ withViews: true })).toEqual([10, 12]);
    const t = await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-09-01", to: "2026-09-01", tz: "UTC", filters: { domain: "a.example" } });
    expect(t.deleted).toBeNull(); // a deleted page has no domain
    expect(t.domains).toEqual(["a.example", "b.example"]);
    expect((await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-09-01", to: "2026-09-01", tz: "UTC", filters: { q: "supprim" } })).deleted).not.toBeNull();
  });

  it("sorts by any column, ascending or descending", async () => {
    await day(10, "2026-09-01", 5, 1);
    await day(11, "2026-09-01", 50, 1);
    const ids = async (sort: string) => (await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-09-01", to: "2026-09-01", tz: "UTC", sort })).rows.map((r) => r.id);
    expect(await ids("-views")).toEqual([11, 10, 12, 13].filter((id) => id !== 12));
    expect(await ids("views")).toEqual([13, 10, 11]);
    expect(await ids("-rate")).toEqual([10, 11, 13]);
    expect(await ids("title")).toEqual([10, 11, 13]);
    expect(await ids("domain")).toEqual([10, 13, 11]);
  });

  it("zone basis: days cut at the member's midnight from the hourly rows", async () => {
    await hour(10, "2026-10-14T03:00:00.000Z", 1); // first hourly data
    // New York, 15 Oct = 04:00Z 15 Oct → 04:00Z 16 Oct
    await hour(10, "2026-10-15T03:00:00.000Z", 100); // still 14 Oct in New York
    await hour(10, "2026-10-15T04:00:00.000Z", 7, 1);
    await hour(10, "2026-10-16T03:00:00.000Z", 3);
    const t = await pageStatsTotals(sqlDb(), { deletedTitle: "Pages supprimées", from: "2026-10-15", to: "2026-10-15", tz: "America/New_York" });
    expect(t.dayBasis).toBe("zone");
    expect(t.rows.find((r) => r.id === 10)).toMatchObject({ views: 10, submissions: 1 });
  });
});

describe("pageStatsSeries", () => {
  it("days: gaps filled with 0, deleted pages series", async () => {
    await day(10, "2026-09-02", 4, 1);
    await day(null, "2026-09-01", 9);
    const s = await pageStatsSeries(sqlDb(), { page: 10, from: "2026-09-01", to: "2026-09-03", step: "day", tz: "Europe/Paris" });
    expect(s.dayBasis).toBe("utc");
    expect(s.points).toEqual([
      { t: "2026-09-01", views: 0, submissions: 0 },
      { t: "2026-09-02", views: 4, submissions: 1 },
      { t: "2026-09-03", views: 0, submissions: 0 },
    ]);
    const gone = await pageStatsSeries(sqlDb(), { page: null, from: "2026-09-01", to: "2026-09-01", step: "day", tz: "UTC" });
    expect(gone.points[0]).toMatchObject({ views: 9 });
  });

  it("hours: in the member's zone, null before the first hourly data, DST day has 25 hours", async () => {
    await hour(10, "2026-10-25T01:00:00.000Z", 6); // first hourly data
    const s = await pageStatsSeries(sqlDb(), {
      page: 10,
      from: "2026-10-25",
      to: "2026-10-25",
      step: "hour",
      tz: "Europe/Paris",
      now: new Date("2026-10-26T12:00:00Z"),
    });
    expect(s.points).toHaveLength(25);
    expect(s.points[0]).toEqual({ t: "2026-10-25T00:00:00+02:00", views: null, submissions: null });
    expect(s.points.find((p) => p.t === "2026-10-25T02:00:00+01:00")).toEqual({ t: "2026-10-25T02:00:00+01:00", views: 6, submissions: 0 });
    expect(s.points.at(-1)).toMatchObject({ views: 0 });
  });

  it("hours are refused over more than 7 days or older than 90 days", async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    await expect(pageStatsSeries(sqlDb(), { page: 10, from: "2026-10-01", to: "2026-10-10", step: "hour", tz: "UTC", now })).rejects.toBeInstanceOf(HourRangeError);
    await expect(pageStatsSeries(sqlDb(), { page: 10, from: "2026-07-01", to: "2026-07-02", step: "hour", tz: "UTC", now })).rejects.toBeInstanceOf(HourRangeError);
  });
});

describe("backfillHourlyStats (migration)", () => {
  it("views from the ledger and leads from the same start, per UTC hour, existing pages only", async () => {
    await db.query(
      `INSERT INTO edge_view_windows (window_start, applied, updated_at, created_at) VALUES
       ('2026-10-12T10:12:00Z', '{"10": 3, "11": 1, "999": 5}', now(), now()),
       ('2026-10-12T10:40:00Z', '{"10": 2}', now(), now()),
       ('2026-10-13T08:00:00Z', '{"11": 4}', now(), now())`,
    );
    await db.query(
      `INSERT INTO leads (page_id, submitted_at) VALUES
       (10, '2026-10-12T10:30:00Z'), (10, '2026-10-12T15:05:00Z'), (11, '2026-10-01T09:00:00Z'), (NULL, '2026-10-12T11:00:00Z')`,
    );
    await backfillHourlyStats(sqlDb());
    const rows = (await db.query("SELECT page_id, hour, views::int, submissions::int FROM page_stats_hourly ORDER BY page_id, hour")).rows;
    expect(rows.map((r) => [r.page_id, new Date(r.hour).toISOString(), r.views, r.submissions])).toEqual([
      [10, "2026-10-12T10:00:00.000Z", 5, 1],
      [10, "2026-10-12T15:00:00.000Z", 0, 1],
      [11, "2026-10-12T10:00:00.000Z", 1, 0],
      [11, "2026-10-13T08:00:00.000Z", 4, 0],
    ]);
  });
});
