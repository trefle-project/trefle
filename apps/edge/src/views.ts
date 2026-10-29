/**
 * 020-edge-html-cache, contracts/edge-worker.md §5–§6 — page views counted at
 * the edge, without a request to the origin per view.
 *
 * Each served page writes one Analytics Engine data point. Every minute the
 * cron reads the counts of the last 10 closed minutes (per page and minute)
 * and posts them, signed, to the renderer (`/api/edge/views`). The CMS adds
 * only what it has not added yet for each window, so re-sending a window is
 * harmless: a failed run is caught up by the next ones.
 */
import { hmacHex } from "./sign";

export interface ViewsEnv {
  PAGE_VIEWS: AnalyticsEngineDataset;
  EDGE_SECRET: string;
  CF_ANALYTICS_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ORIGIN_INGEST_URL: string;
}

export const DATASET = "trefle_page_views";
const MINUTE_MS = 60_000;
/** Windows re-sent on every run: a run that fails is caught up by the next ones. */
export const WINDOWS_PER_RUN = 10;

/** Contract §5: one data point per served page. Never throws. */
export function recordView(env: Pick<ViewsEnv, "PAGE_VIEWS">, pageId: string, host: string): void {
  try {
    env.PAGE_VIEWS.writeDataPoint({ indexes: [pageId], blobs: [host], doubles: [1] });
  } catch {
    /* counting never affects a page view */
  }
}

/** `[start, end)` of the last closed minutes before `now`, as Analytics Engine SQL literals and ISO. */
export function windowBounds(now: number): { start: Date; end: Date } {
  const end = new Date(Math.floor(now / MINUTE_MS) * MINUTE_MS);
  return { start: new Date(end.getTime() - WINDOWS_PER_RUN * MINUTE_MS), end };
}

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export function viewQuery(start: Date, end: Date): string {
  return (
    `SELECT toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS m, index1 AS page, SUM(_sample_interval) AS n ` +
    `FROM ${DATASET} ` +
    `WHERE timestamp >= toDateTime('${sqlTime(start)}') AND timestamp < toDateTime('${sqlTime(end)}') ` +
    `GROUP BY m, page FORMAT JSON`
  );
}

type Row = { m: string; page: string; n: number | string };

/** Analytics Engine rows → `[{ start, counts }]`, minute windows in UTC, counts rounded. */
export function toWindows(rows: Row[]): { start: string; counts: Record<string, number> }[] {
  const windows = new Map<string, Record<string, number>>();
  for (const { m, page, n } of rows) {
    const count = Math.round(Number(n));
    if (!/^\d+$/.test(page) || !(count > 0)) continue;
    const start = new Date(`${m.replace(" ", "T")}Z`).toISOString();
    const counts = windows.get(start) ?? {};
    counts[page] = (counts[page] ?? 0) + count;
    windows.set(start, counts);
  }
  return [...windows].sort(([a], [b]) => a.localeCompare(b)).map(([start, counts]) => ({ start, counts }));
}

/** Contract §6: one run of the per-minute cron. Never throws; failures are logged and retried by the next run. */
export async function runViewCron(env: ViewsEnv, now: number): Promise<{ windows: number; status: number | null }> {
  try {
    const { start, end } = windowBounds(now);
    const query = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
      body: viewQuery(start, end),
    });
    if (!query.ok) {
      console.error("views cron: analytics query failed", query.status);
      return { windows: 0, status: null };
    }
    const windows = toWindows(((await query.json()) as { data?: Row[] }).data ?? []);
    if (windows.length === 0) return { windows: 0, status: null };

    const body = JSON.stringify({ at: new Date(now).toISOString(), windows });
    const res = await fetch(new URL("/api/edge/views", env.ORIGIN_INGEST_URL), {
      method: "POST",
      // An explicit user agent: the zone's Browser Integrity Check may challenge a request without one.
      headers: { "content-type": "application/json", "user-agent": "trefle-edge-cron", "x-trefle-signature": await hmacHex(env.EDGE_SECRET, body) },
      body,
    });
    if (!res.ok) console.error("views cron: origin refused", res.status);
    return { windows: windows.length, status: res.status };
  } catch (err) {
    console.error("views cron failed", err instanceof Error ? err.message : String(err));
    return { windows: 0, status: null };
  }
}
