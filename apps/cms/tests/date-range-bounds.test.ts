import { describe, expect, it } from "vitest";

import { localDayRangeBounds, pickerDateOf, utcDayRangeBounds, zoneDayRangeBounds } from "../src/lib/dateRangeBounds";

/**
 * 010-date-range-filters — the UTC-day / local-day split exists because
 * `page-stats.date` is bucketed at exact UTC midnight (`dayBucket()` in
 * `page-stats.ts`) while the other three filtered fields are precise,
 * unbucketed timestamps that should read as the operator's own wall-clock
 * day (research.md §8). These tests assert the two modes actually diverge
 * for an operator west of UTC — the exact regression this split prevents.
 */
describe("utcDayRangeBounds vs localDayRangeBounds", () => {
  it("diverge for the same picked day when the local timezone has a non-zero UTC offset", () => {
    // Simulates a browser in a timezone behind UTC (e.g. UTC-5): the local
    // midnight of Sep 17 is 05:00 UTC, not 00:00 UTC.
    const from = new Date(2026, 8, 17); // local Sep 17, 00:00 in whatever TZ this runs under
    const utc = utcDayRangeBounds(from, from);
    // utcDayRangeBounds always reads the same calendar digits as a UTC day,
    // independent of the runner's own TZ.
    expect(utc.gte).toBe("2026-09-17T00:00:00.000Z");
    expect(utc.lt).toBe("2026-09-18T00:00:00.000Z");
    // localDayRangeBounds instead converts the local midnight instant to UTC —
    // identical to utcDayRangeBounds only when the runner's own TZ offset is 0.
    const local = localDayRangeBounds(from, from);
    expect(local.gte).toBe(from.toISOString());
    if (from.getTimezoneOffset() !== 0) {
      expect(local.gte).not.toBe(utc.gte);
    }
  });

  it("utcDayRangeBounds covers a single-day range up to (not including) the next UTC day", () => {
    const day = new Date(2026, 8, 17);
    expect(utcDayRangeBounds(day, day)).toEqual({
      gte: "2026-09-17T00:00:00.000Z",
      lt: "2026-09-18T00:00:00.000Z",
    });
  });

  it("utcDayRangeBounds covers a multi-day range up to (not including) the day after the end", () => {
    const from = new Date(2026, 8, 17);
    const to = new Date(2026, 8, 20);
    expect(utcDayRangeBounds(from, to)).toEqual({
      gte: "2026-09-17T00:00:00.000Z",
      lt: "2026-09-21T00:00:00.000Z",
    });
  });

  it("utcDayRangeBounds crosses a month/year boundary correctly", () => {
    const from = new Date(2026, 11, 30); // Dec 30, 2026
    const to = new Date(2027, 0, 1); // Jan 1, 2027
    expect(utcDayRangeBounds(from, to)).toEqual({
      gte: "2026-12-30T00:00:00.000Z",
      lt: "2027-01-02T00:00:00.000Z",
    });
  });

  it("localDayRangeBounds covers a multi-day range up to (not including) local midnight the day after the end", () => {
    const from = new Date(2026, 8, 17);
    const to = new Date(2026, 8, 20);
    const bounds = localDayRangeBounds(from, to);
    expect(bounds.gte).toBe(new Date(2026, 8, 17, 0, 0, 0, 0).toISOString());
    expect(bounds.lt).toBe(new Date(2026, 8, 21, 0, 0, 0, 0).toISOString());
  });
});

describe("zoneDayRangeBounds (022 US6)", () => {
  it("reads the picked digits as days of the member's zone", () => {
    expect(zoneDayRangeBounds(new Date(2026, 6, 1), new Date(2026, 6, 3), "America/New_York")).toEqual({
      gte: "2026-07-01T04:00:00.000Z",
      lt: "2026-07-04T04:00:00.000Z",
    });
  });

  it("pickerDateOf gives the bound's day in that zone back as a local calendar date", () => {
    const back = pickerDateOf("2026-07-01T04:00:00.000Z", "America/New_York");
    expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, 6, 1]);
    const tokyo = pickerDateOf("2026-06-30T15:00:00.000Z", "Asia/Tokyo");
    expect([tokyo.getFullYear(), tokyo.getMonth(), tokyo.getDate()]).toEqual([2026, 6, 1]);
  });
});
