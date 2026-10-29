import { describe, expect, it, vi } from "vitest";

import { defaultPeriod, pageStatsExportEndpoint, pageStatsSeriesEndpoint } from "../src/endpoints/pageStatsReport";

/**
 * 022-ux-improvement (US1, contracts/page-stats.md, T006/T007) — the two
 * Pages Stats endpoints' contract (the SQL itself: tests/db/page-stats-report).
 */
function makeReq(opts: { user?: unknown; query?: Record<string, string>; pageExists?: boolean; rows?: Record<string, unknown>[]; settings?: object; language?: string } = {}) {
  const execute = vi.fn().mockImplementation(async (q: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(q);
    if (text.includes("min(hour)")) return { rows: [{ first: null }] };
    if (text.includes("FROM pages p")) return { rows: opts.rows ?? [] };
    return { rows: [] };
  });
  return {
    user: opts.user === undefined ? { id: 1, role: "editor", isActive: true } : opts.user,
    query: opts.query ?? {},
    i18n: { language: opts.language ?? "fr" },
    payload: {
      db: { drizzle: { execute } },
      findGlobal: vi.fn().mockResolvedValue(opts.settings ?? { adminTimezone: "Europe/Paris" }),
      find: vi.fn().mockResolvedValue({ docs: opts.pageExists === false ? [] : [{ id: 10 }] }),
    },
    execute,
  };
}
const series = (req: ReturnType<typeof makeReq>) => pageStatsSeriesEndpoint.handler(req as never) as Promise<Response>;
const exportCsv = (req: ReturnType<typeof makeReq>) => pageStatsExportEndpoint.handler(req as never) as Promise<Response>;

describe("GET /api/page-stats/series", () => {
  it("403 for anyone but an Administrator or an Editor", async () => {
    expect((await series(makeReq({ user: null }))).status).toBe(403);
    expect((await series(makeReq({ user: { isService: true } }))).status).toBe(403);
  });

  it("400 on a bad query, 404 for an unknown page", async () => {
    expect((await series(makeReq({ query: { page: "10", from: "2026-13-01", to: "x" } }))).status).toBe(400);
    expect((await series(makeReq({ query: { page: "abc" } }))).status).toBe(400);
    expect((await series(makeReq({ query: { page: "10", from: "2026-10-05", to: "2026-10-01" } }))).status).toBe(400);
    expect((await series(makeReq({ query: { page: "999", from: "2026-10-01", to: "2026-10-02" }, pageExists: false }))).status).toBe(404);
  });

  it("400 hour_range for hours over more than 7 days", async () => {
    const res = await series(makeReq({ query: { page: "10", from: "2026-10-01", to: "2026-10-12", step: "hour" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "hour_range" });
  });

  it("days of the member's own zone, never a zone sent in the query", async () => {
    const res = await series(makeReq({ user: { id: 1, role: "admin", isActive: true, displayTimezone: "America/New_York" }, query: { page: "deleted", from: "2026-10-01", to: "2026-10-02", tz: "Asia/Tokyo" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ step: "day", tz: "America/New_York", points: [{ t: "2026-10-01" }, { t: "2026-10-02" }] });
  });
});

describe("GET /api/page-stats/export", () => {
  it("a CSV of the totals with the period, zone and day basis on its first line", async () => {
    const res = await exportCsv(
      makeReq({
        query: { from: "2026-10-01", to: "2026-10-07" },
        rows: [{ id: 10, title: "Accueil, Lille", hostname: "a.example", views: 200, submissions: 3 }],
      }),
    );
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="pages-stats_2026-10-01_2026-10-07.csv"');
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe("# Pages Stats du 2026-10-01 au 2026-10-07 (jours UTC)");
    expect(lines[1]).toBe("pageId,page,domaine,vues,soumissions,conversion");
    expect(lines[2]).toBe('10,"Accueil, Lille",a.example,200,3,0.0150');
  });

  it("023 — title and header in the member's language, values unchanged", async () => {
    const res = await exportCsv(
      makeReq({
        language: "en",
        query: { from: "2026-10-01", to: "2026-10-07" },
        rows: [{ id: 10, title: "Accueil, Lille", hostname: "a.example", views: 200, submissions: 3 }],
      }),
    );
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe("# Pages Stats from 2026-10-01 to 2026-10-07 (UTC days)");
    expect(lines[1]).toBe("pageId,page,domain,views,submissions,conversion");
    expect(lines[2]).toBe('10,"Accueil, Lille",a.example,200,3,0.0150');
  });

  it("applies the view's search and filters", async () => {
    const res = await exportCsv(
      makeReq({
        query: { from: "2026-10-01", to: "2026-10-07", q: "lille" },
        rows: [
          { id: 10, title: "Accueil, Lille", hostname: "a.example", views: 200, submissions: 3 },
          { id: 11, title: "Offre", hostname: "a.example", views: 50, submissions: 0 },
        ],
      }),
    );
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^10,/);
  });

  it("403 for a service caller", async () => {
    expect((await exportCsv(makeReq({ user: { isService: true } }))).status).toBe(403);
  });
});

describe("defaultPeriod", () => {
  it("the last 30 days ending today in the zone", () => {
    expect(defaultPeriod("Asia/Tokyo", new Date("2026-10-22T20:00:00Z"))).toEqual({ from: "2026-09-24", to: "2026-10-23" });
  });
});
