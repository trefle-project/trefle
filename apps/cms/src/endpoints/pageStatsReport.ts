import type { Endpoint, PayloadRequest } from "payload";

import { isAdminOrEditor } from "../access";
import { adminText } from "../i18n";
import { effectiveZone, zoneDay } from "../lib/admin-time";
import { csvRow } from "../lib/csv";
import { drizzleOf, HourRangeError, pageStatsSeries, pageStatsTotals, parseFilters } from "../lib/page-stats";

/**
 * 022-ux-improvement (US1, contracts/page-stats.md) — Pages Stats' chart data
 * and CSV export. Administrator or Editor. Days are those of the caller's
 * display time zone (their choice, else the installation default) — never a
 * zone sent by the client.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Default period: the last 30 days ending today, in `tz`. */
export function defaultPeriod(tz: string, now = new Date()): { from: string; to: string } {
  const to = zoneDay(now, tz);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export async function callerZone(req: PayloadRequest): Promise<string> {
  const settings = (await req.payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true })) as { adminTimezone?: string | null };
  return effectiveZone(req.user as { displayTimezone?: string | null } | null, settings);
}

function period(q: Record<string, unknown>, tz: string): { from: string; to: string } | null {
  const fallback = defaultPeriod(tz);
  const from = q.from == null ? fallback.from : String(q.from);
  const to = q.to == null ? fallback.to : String(q.to);
  return DAY.test(from) && DAY.test(to) && from <= to ? { from, to } : null;
}

export const pageStatsSeriesEndpoint: Endpoint = {
  path: "/series", // on the page-stats collection: GET /api/page-stats/series
  method: "get",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response(null, { status: 403 });
    const q = (req.query ?? {}) as Record<string, unknown>;
    const tz = await callerZone(req);
    const p = period(q, tz);
    const step = q.step === "hour" ? "hour" : q.step == null || q.step === "day" ? "day" : null;
    const page = q.page === "deleted" ? null : /^\d+$/.test(String(q.page ?? "")) ? Number(q.page) : undefined;
    if (!p || !step || page === undefined) return Response.json({ error: "bad query" }, { status: 400 });
    if (page !== null) {
      const found = await req.payload.find({ collection: "pages", where: { id: { equals: page } }, limit: 1, depth: 0, overrideAccess: true });
      if (found.docs.length === 0) {
        // A deleted page's stats are summed on « Pages supprimées », not served by id.
        return Response.json({ error: "not found" }, { status: 404 });
      }
    }
    try {
      return Response.json(await pageStatsSeries(drizzleOf(req.payload), { page, ...p, step, tz }));
    } catch (err) {
      if (err instanceof HourRangeError) return Response.json({ error: "hour_range" }, { status: 400 });
      throw err;
    }
  },
};

export const pageStatsExportEndpoint: Endpoint = {
  path: "/export", // GET /api/page-stats/export
  method: "get",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response("Forbidden", { status: 403 });
    const q = (req.query ?? {}) as Record<string, unknown>;
    const tz = await callerZone(req);
    const p = period(q, tz);
    if (!p) return Response.json({ error: "bad query" }, { status: 400 });
    // 023-admin-i18n (T034) — titles and header in the member's language; values unchanged.
    const t = adminText(req.i18n?.language);
    const totals = await pageStatsTotals(drizzleOf(req.payload), {
      ...p,
      tz,
      sort: typeof q.sort === "string" ? q.sort : undefined,
      filters: parseFilters(q),
      deletedTitle: t("pageStats.deletedPages"),
    });
    const basis = totals.dayBasis === "zone" ? t("pageStats.csvZoneDays", { tz }) : t("pageStats.csvUtcDays");
    const lines = [
      `${t("pageStats.csvTitle", { from: p.from, to: p.to, basis })}\r\n`,
      csvRow(t("pageStats.csvHeader").split(",")),
      ...[...totals.rows, ...(totals.deleted ? [totals.deleted] : [])].map((r) =>
        csvRow([r.id ?? "", r.title, r.domain ?? "", r.views, r.submissions, r.rate === null ? "" : r.rate.toFixed(4)]),
      ),
    ];
    return new Response(lines.join(""), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pages-stats_${p.from}_${p.to}.csv"`,
        "cache-control": "no-store",
      },
    });
  },
};
