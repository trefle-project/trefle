import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pageViewsBatchEndpoint } from "../../src/endpoints/pageViewsBatch";
import { scratchSchema } from "./scratch-schema";

/**
 * 020-edge-html-cache (contracts/edge-ingest.md, T043) — minute windows of
 * edge views, re-sent every minute, add each view once.
 */
let db: Awaited<ReturnType<typeof scratchSchema>>;

const post = async (windows: unknown, user: object = { isService: true }) => {
  const res = await pageViewsBatchEndpoint.handler({ user, payload: db.payload, json: async () => ({ windows }) } as never);
  return { status: res.status, body: res.status === 200 ? await res.json() : undefined };
};
const views = async (page: number, day: string) =>
  (await db.query("SELECT views::int FROM page_stats WHERE page_id = $1 AND date = $2", [page, day])).rows[0]?.views ?? 0;

const DAY = "2026-10-12T00:00:00.000Z";
const W1 = "2026-10-12T10:12:00.000Z";
const W2 = "2026-10-12T10:13:00.000Z";

beforeAll(async () => {
  db = await scratchSchema();
  await db.query("INSERT INTO pages (id) VALUES (12), (57)");
});
afterAll(async () => db?.drop());
beforeEach(async () => {
  await db.query("DELETE FROM page_stats");
  await db.query("DELETE FROM page_stats_hourly");
  await db.query("DELETE FROM edge_view_windows");
});

describe("POST /api/page-views/batch", () => {
  it("adds a window's views to the page's day", async () => {
    const res = await post([{ start: W1, counts: { "12": 340, "57": 12 } }]);
    expect(res).toEqual({ status: 200, body: { added: 352, windows: 1 } });
    expect(await views(12, DAY)).toBe(340);
    expect(await views(57, DAY)).toBe(12);
  });

  it("a window posted twice adds nothing the second time", async () => {
    await post([{ start: W1, counts: { "12": 340 } }]);
    expect((await post([{ start: W1, counts: { "12": 340 } }])).body).toEqual({ added: 0, windows: 1 });
    expect(await views(12, DAY)).toBe(340);
  });

  it("a re-posted window with a higher count adds only the difference; a lower one changes nothing", async () => {
    await post([{ start: W1, counts: { "12": 340 } }]);
    await post([{ start: W1, counts: { "12": 345 } }]);
    await post([{ start: W1, counts: { "12": 344 } }]);
    expect(await views(12, DAY)).toBe(345);
  });

  it("two windows of the same day add up", async () => {
    await post([{ start: W1, counts: { "12": 340 } }, { start: W2, counts: { "12": 298 } }]);
    expect(await views(12, DAY)).toBe(638);
  });

  it("two concurrent posts of the same window add once", async () => {
    await Promise.all(Array.from({ length: 5 }, () => post([{ start: W1, counts: { "12": 100 } }])));
    expect(await views(12, DAY)).toBe(100);
  });

  it("a window at 23:59 UTC goes to that day", async () => {
    await post([{ start: "2026-10-12T23:59:00.000Z", counts: { "12": 4 } }]);
    expect(await views(12, DAY)).toBe(4);
    expect(await views(12, "2026-10-13T00:00:00.000Z")).toBe(0);
  });

  // 022-ux-improvement (US1) — the window's hour too, once per window.
  it("adds a window's views to the page's hour as well, and only once", async () => {
    await post([{ start: W1, counts: { "12": 340 } }, { start: "2026-10-12T11:00:00.000Z", counts: { "12": 5 } }]);
    await post([{ start: W1, counts: { "12": 340 } }]);
    const rows = (await db.query("SELECT hour, views::int FROM page_stats_hourly WHERE page_id = 12 ORDER BY hour")).rows;
    expect(rows.map((r) => [new Date(r.hour).toISOString(), r.views])).toEqual([
      ["2026-10-12T10:00:00.000Z", 340],
      ["2026-10-12T11:00:00.000Z", 5],
    ]);
  });

  it("ignores unknown page ids", async () => {
    const res = await post([{ start: W1, counts: { "12": 3, "999": 50 } }]);
    expect(res.body).toEqual({ added: 3, windows: 1 });
    expect(await views(999, DAY)).toBe(0);
  });

  it("refuses a caller that is not the service account (403) and a malformed body (400)", async () => {
    expect((await post([{ start: W1, counts: { "12": 3 } }], { role: "editor" })).status).toBe(403);
    expect((await post([{ start: "2026-10-12T10:12:30.000Z", counts: { "12": 3 } }])).status).toBe(400);
    expect((await post([{ start: W1, counts: { "12": -1 } }])).status).toBe(400);
    expect((await post([{ start: W1, counts: { abc: 1 } }])).status).toBe(400);
    expect(await views(12, DAY)).toBe(0);
  });
});
