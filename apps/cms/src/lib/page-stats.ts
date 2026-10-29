import type { Payload } from "payload";
import { sql, type SQL } from "@payloadcms/db-postgres/drizzle";

import { isoInZone, zoneDay, zoneDayBounds } from "./admin-time";

/** UTC day bucket, e.g. 2026-09-09T00:00:00.000Z */
export function dayBucket(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** UTC hour bucket, e.g. 2026-10-23T14:00:00.000Z (022-ux-improvement). */
export function hourBucket(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString();
}

/** Anything that runs raw SQL: the adapter's Drizzle instance or a transaction of it. */
export interface SqlExecutor {
  execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>;
}

/** The Postgres adapter's Drizzle instance (raw SQL for what Payload's API cannot do atomically). */
export const drizzleOf = (payload: Payload) => (payload.db as unknown as { drizzle: SqlExecutor & { transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) => Promise<T> } }).drizzle;

/**
 * Bump a per-(page, day) counter (T039), creating the row on the first hit.
 *
 * 020-edge-html-cache (research R8) — one SQL upsert on the unique
 * `(page_id, date)` index: concurrent calls (edge view batches, lead intake,
 * the legacy per-view ping) all add up, none is lost. The previous
 * find-then-update could drop increments under concurrency.
 * `at` defaults to now; edge batches pass the start of their window.
 * 022-ux-improvement (US1) — the same call adds to the page's hour
 * (`page_stats_hourly`), in the same executor (transaction when given one).
 * Best-effort: callers swallow failures for `views`.
 */
export async function incrementPageStat(
  payload: Payload,
  pageIdInput: string | number,
  field: "views" | "submissions",
  by = 1,
  { at = new Date(), db = drizzleOf(payload) }: { at?: Date; db?: SqlExecutor } = {},
): Promise<void> {
  const pageId = typeof pageIdInput === "number" ? pageIdInput : Number(pageIdInput);
  const views = field === "views" ? by : 0;
  const submissions = field === "submissions" ? by : 0;
  await db.execute(sql`
    INSERT INTO page_stats (page_id, date, views, submissions, updated_at, created_at)
    VALUES (${pageId}, ${dayBucket(at)}, ${views}, ${submissions}, now(), now())
    ON CONFLICT (page_id, date) DO UPDATE SET
      views = page_stats.views + EXCLUDED.views,
      submissions = page_stats.submissions + EXCLUDED.submissions,
      updated_at = now()`);
  await db.execute(sql`
    INSERT INTO page_stats_hourly (page_id, hour, views, submissions, updated_at, created_at)
    VALUES (${pageId}, ${hourBucket(at)}, ${views}, ${submissions}, now(), now())
    ON CONFLICT (page_id, hour) DO UPDATE SET
      views = page_stats_hourly.views + EXCLUDED.views,
      submissions = page_stats_hourly.submissions + EXCLUDED.submissions,
      updated_at = now()`);
}

/**
 * 022-ux-improvement (US1) — one-off back-fill of `page_stats_hourly` (run by
 * its migration): from the earliest edge view window kept (the ledger keeps
 * 30 days), views from the ledger and submissions (one per lead) over the
 * same span, so both start together; hours in UTC; existing pages only.
 */
export async function backfillHourlyStats(db: SqlExecutor): Promise<void> {
  await db.execute(sql`
  WITH start AS (SELECT date_trunc('hour', min(window_start) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS s FROM edge_view_windows),
  v AS (
    SELECT kv.key::int AS page_id, date_trunc('hour', w.window_start AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS h, sum(kv.value::numeric) AS n
    FROM edge_view_windows w, jsonb_each_text(w.applied) kv
    WHERE kv.key ~ '^[0-9]+$'
    GROUP BY 1, 2
  ),
  sub AS (
    SELECT l.page_id, date_trunc('hour', l.submitted_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS h, count(*)::numeric AS n
    FROM leads l, start
    WHERE start.s IS NOT NULL AND l.page_id IS NOT NULL AND l.submitted_at >= start.s
    GROUP BY 1, 2
  )
  INSERT INTO page_stats_hourly (page_id, hour, views, submissions)
  SELECT coalesce(v.page_id, sub.page_id), coalesce(v.h, sub.h), coalesce(v.n, 0), coalesce(sub.n, 0)
  FROM v FULL JOIN sub ON v.page_id = sub.page_id AND v.h = sub.h
  WHERE coalesce(v.page_id, sub.page_id) IN (SELECT id FROM pages);`);
}

// ---------------------------------------------------------------------------
// 022-ux-improvement (US1, contracts/page-stats.md) — Pages Stats: totals per
// page over a period, and one page's series by day or hour. Days are those of
// the member's display time zone (`tz`) when the whole period has hourly
// data; older periods fall back to the stored UTC days (`dayBasis: "utc"`).

export type DayBasis = "zone" | "utc";
export type StatsSort = "views" | "submissions" | "rate" | "id" | "title" | "domain";
export type PageTotals = { id: number | null; title: string; domain: string | null; status?: string | null; views: number; submissions: number; rate: number | null };
export type Totals = { rows: PageTotals[]; deleted: PageTotals | null; dayBasis: DayBasis; hourlyFrom: string | null; domains: string[] };

/** Search and filters of the Pages Stats view (and its CSV): applied after the totals. */
export type StatsFilters = { q?: string; domain?: string; status?: "published" | "draft"; withViews?: boolean };

export function parseFilters(query: Record<string, unknown> | undefined): StatsFilters {
  const str = (k: string) => (typeof query?.[k] === "string" && (query[k] as string).trim() ? (query[k] as string).trim() : undefined);
  const status = str("status");
  return {
    q: str("q"),
    domain: str("domain"),
    status: status === "published" || status === "draft" ? status : undefined,
    withViews: str("withViews") === "1",
  };
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function matches(r: PageTotals, f: StatsFilters): boolean {
  if (f.domain && r.domain !== f.domain) return false;
  if (f.status && r.status !== f.status) return false;
  if (f.withViews && r.views <= 0) return false;
  if (f.q) {
    const q = fold(f.q);
    if (![String(r.id ?? ""), r.title, r.domain ?? ""].some((v) => fold(v).includes(q))) return false;
  }
  return true;
}

export const HOURLY_KEEP_DAYS = 90;
export const HOURLY_MAX_SPAN_DAYS = 7;

const num = (v: unknown) => Number(v ?? 0);
const rateOf = (views: number, submissions: number) => (views > 0 ? submissions / views : null);

/** First hour with hourly data (all pages), or null when there is none yet. */
export async function hourlyFrom(db: SqlExecutor): Promise<string | null> {
  const { rows } = await db.execute(sql`SELECT min(hour) AS first FROM page_stats_hourly`);
  const first = rows[0]?.first as string | Date | null | undefined;
  return first ? new Date(first).toISOString() : null;
}

function basisFor(gte: string, first: string | null): DayBasis {
  return first && Date.parse(gte) >= Date.parse(first) ? "zone" : "utc";
}

/** Σ per page over the period, as SQL rows `{ page_id, views, submissions }`. */
function periodSums(basis: DayBasis, from: string, to: string, bounds: { gte: string; lt: string }) {
  return basis === "zone"
    ? sql`SELECT page_id, sum(views) AS views, sum(submissions) AS submissions FROM page_stats_hourly
          WHERE hour >= ${bounds.gte} AND hour < ${bounds.lt} GROUP BY page_id`
    : sql`SELECT page_id, sum(views) AS views, sum(submissions) AS submissions FROM page_stats
          WHERE date >= ${`${from}T00:00:00.000Z`} AND date <= ${`${to}T00:00:00.000Z`} GROUP BY page_id`;
}

const SORTERS: Record<StatsSort, (a: PageTotals, b: PageTotals) => number> = {
  views: (a, b) => a.views - b.views,
  submissions: (a, b) => a.submissions - b.submissions,
  rate: (a, b) => (a.rate ?? -1) - (b.rate ?? -1),
  id: (a, b) => (a.id ?? 0) - (b.id ?? 0),
  title: (a, b) => a.title.localeCompare(b.title, "fr"),
  domain: (a, b) => (a.domain ?? "").localeCompare(b.domain ?? "", "fr"),
};

export function parseSort(value: unknown): { key: StatsSort; desc: boolean } {
  const raw = typeof value === "string" ? value : "-views";
  const desc = raw.startsWith("-");
  const key = raw.replace(/^-/, "") as StatsSort;
  return key in SORTERS ? { key, desc } : { key: "views", desc: true };
}

/**
 * One row per page: every published page (0 when no stats) and any page with
 * stats in the period; a deleted page's stats (page_id null) are summed on
 * `deleted` (« Pages supprimées », `deletedTitle` in the member's language).
 * `from`/`to` are « YYYY-MM-DD », inclusive.
 */
export async function pageStatsTotals(
  db: SqlExecutor,
  {
    from,
    to,
    sort,
    tz,
    filters = {},
    deletedTitle,
  }: { from: string; to: string; sort?: string; tz: string; filters?: StatsFilters; deletedTitle: string },
): Promise<Totals> {
  const first = await hourlyFrom(db);
  const bounds = zoneDayBounds(from, to, tz);
  const dayBasis = basisFor(bounds.gte, first);
  const sums = periodSums(dayBasis, from, to, bounds);
  const { rows } = await db.execute(sql`
    WITH s AS (${sums})
    SELECT p.id, p.title, p.status, d.hostname, coalesce(s.views, 0) AS views, coalesce(s.submissions, 0) AS submissions
    FROM pages p
    LEFT JOIN s ON s.page_id = p.id
    LEFT JOIN domains d ON d.id = p.domain_id
    WHERE p.status = 'published' OR s.page_id IS NOT NULL`);
  const { rows: gone } = await db.execute(sql`WITH s AS (${sums}) SELECT views, submissions FROM s WHERE page_id IS NULL`);
  const list: PageTotals[] = rows.map((r) => {
    const views = num(r.views);
    const submissions = num(r.submissions);
    return {
      id: Number(r.id),
      title: String(r.title ?? ""),
      domain: (r.hostname as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      views,
      submissions,
      rate: rateOf(views, submissions),
    };
  });
  const domains = [...new Set(list.map((r) => r.domain).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, "fr"));
  const { key, desc } = parseSort(sort);
  list.sort((a, b) => (desc ? -1 : 1) * SORTERS[key](a, b) || (a.id ?? 0) - (b.id ?? 0));
  const g = gone[0];
  const deleted =
    g && (num(g.views) > 0 || num(g.submissions) > 0)
      ? { id: null, title: deletedTitle, domain: null, views: num(g.views), submissions: num(g.submissions), rate: rateOf(num(g.views), num(g.submissions)) }
      : null;
  // A deleted page has no domain nor status: it only shows without those filters.
  const keepDeleted = deleted && !filters.domain && !filters.status && matches({ ...deleted, status: undefined }, { q: filters.q, withViews: filters.withViews });
  return { rows: list.filter((r) => matches(r, filters)), deleted: keepDeleted ? deleted : null, dayBasis, hourlyFrom: first, domains };
}

export type SeriesPoint = { t: string; views: number | null; submissions: number | null };
export type Series = { step: "day" | "hour"; tz: string; dayBasis: DayBasis; hourlyFrom: string | null; points: SeriesPoint[] };

export class HourRangeError extends Error {}

const daysBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/** One page's (or, with `page: null`, the deleted pages') views and submissions per day or per hour. */
export async function pageStatsSeries(
  db: SqlExecutor,
  { page, from, to, step, tz, now = new Date() }: { page: number | null; from: string; to: string; step: "day" | "hour"; tz: string; now?: Date },
): Promise<Series> {
  const first = await hourlyFrom(db);
  const bounds = zoneDayBounds(from, to, tz);
  const pageCond = (col: SQL) => (page === null ? sql`${col} IS NULL` : sql`${col} = ${page}`);

  if (step === "hour") {
    const span = (Date.parse(bounds.lt) - Date.parse(bounds.gte)) / 86_400_000;
    if (span > HOURLY_MAX_SPAN_DAYS + 0.1 || Date.parse(bounds.gte) < now.getTime() - HOURLY_KEEP_DAYS * 86_400_000) throw new HourRangeError();
    const { rows } = await db.execute(sql`
      SELECT hour, sum(views) AS views, sum(submissions) AS submissions FROM page_stats_hourly
      WHERE ${pageCond(sql`page_id`)} AND hour >= ${bounds.gte} AND hour < ${bounds.lt} GROUP BY hour`);
    const byHour = new Map(rows.map((r) => [new Date(r.hour as string).toISOString(), r]));
    const points: SeriesPoint[] = [];
    for (let t = Date.parse(bounds.gte); t < Date.parse(bounds.lt); t += 3_600_000) {
      const key = new Date(t).toISOString();
      const r = byHour.get(key);
      const known = first !== null && t >= Date.parse(first);
      points.push({ t: isoInZone(key, tz), views: known ? num(r?.views) : null, submissions: known ? num(r?.submissions) : null });
    }
    return { step, tz, dayBasis: "zone", hourlyFrom: first, points };
  }

  const dayBasis = basisFor(bounds.gte, first);
  const byDay = new Map<string, { views: number; submissions: number }>();
  if (dayBasis === "zone") {
    const { rows } = await db.execute(sql`
      SELECT hour, views, submissions FROM page_stats_hourly
      WHERE ${pageCond(sql`page_id`)} AND hour >= ${bounds.gte} AND hour < ${bounds.lt}`);
    for (const r of rows) {
      const day = zoneDay(new Date(r.hour as string), tz);
      const cur = byDay.get(day) ?? { views: 0, submissions: 0 };
      cur.views += num(r.views);
      cur.submissions += num(r.submissions);
      byDay.set(day, cur);
    }
  } else {
    const { rows } = await db.execute(sql`
      SELECT date, sum(views) AS views, sum(submissions) AS submissions FROM page_stats
      WHERE ${pageCond(sql`page_id`)} AND date >= ${`${from}T00:00:00.000Z`} AND date <= ${`${to}T00:00:00.000Z`} GROUP BY date`);
    for (const r of rows) byDay.set(new Date(r.date as string).toISOString().slice(0, 10), { views: num(r.views), submissions: num(r.submissions) });
  }
  const points = daysBetween(from, to).map((day) => ({ t: day, views: byDay.get(day)?.views ?? 0, submissions: byDay.get(day)?.submissions ?? 0 }));
  return { step, tz, dayBasis, hourlyFrom: first, points };
}
