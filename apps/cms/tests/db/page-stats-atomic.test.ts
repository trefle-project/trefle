import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dayBucket, hourBucket, incrementPageStat } from "../../src/lib/page-stats";
import { scratchSchema } from "./scratch-schema";

/**
 * 020-edge-html-cache (research R8, T040) — page counters are one SQL upsert:
 * concurrent increments never lose an update.
 */
let db: Awaited<ReturnType<typeof scratchSchema>>;
const stat = async (page: number, day = dayBucket()) =>
  (await db.query("SELECT views::int, submissions::int FROM page_stats WHERE page_id = $1 AND date = $2", [page, day])).rows;

beforeAll(async () => {
  db = await scratchSchema();
});
afterAll(async () => db?.drop());
beforeEach(async () => {
  await db.query("DELETE FROM page_stats");
  await db.query("DELETE FROM page_stats_hourly");
});
const hourly = async (page: number, hour = hourBucket()) =>
  (await db.query("SELECT views::int, submissions::int FROM page_stats_hourly WHERE page_id = $1 AND hour = $2", [page, hour])).rows;

describe("incrementPageStat", () => {
  it("50 concurrent increments add up exactly", async () => {
    await Promise.all(Array.from({ length: 50 }, () => incrementPageStat(db.payload, 7, "views")));
    expect(await stat(7)).toEqual([{ views: 50, submissions: 0 }]);
  });

  it("two concurrent first views of a day create one row with 2", async () => {
    await Promise.all([incrementPageStat(db.payload, 8, "views"), incrementPageStat(db.payload, 8, "views")]);
    expect(await stat(8)).toEqual([{ views: 2, submissions: 0 }]);
  });

  it("submissions (lead intake) and views count separately on the same row", async () => {
    await incrementPageStat(db.payload, "9", "submissions");
    await incrementPageStat(db.payload, 9, "views", 5);
    await incrementPageStat(db.payload, 9, "submissions");
    expect(await stat(9)).toEqual([{ views: 5, submissions: 2 }]);
  });

  it("adds to the day and hour of the given instant (edge windows)", async () => {
    const at = new Date("2026-10-01T14:37:00.000Z");
    await incrementPageStat(db.payload, 9, "views", 3, { at });
    expect(await stat(9, "2026-10-01T00:00:00.000Z")).toEqual([{ views: 3, submissions: 0 }]);
    expect(await hourly(9, "2026-10-01T14:00:00.000Z")).toEqual([{ views: 3, submissions: 0 }]);
    expect(await stat(9)).toEqual([]);
  });

  // 022-ux-improvement (US1, FR-007)
  it("the hourly row adds up like the daily one, concurrent calls included", async () => {
    await Promise.all(Array.from({ length: 30 }, () => incrementPageStat(db.payload, 7, "views")));
    await incrementPageStat(db.payload, 7, "submissions");
    expect(await hourly(7)).toEqual([{ views: 30, submissions: 1 }]);
    expect(await stat(7)).toEqual([{ views: 30, submissions: 1 }]);
  });
});
