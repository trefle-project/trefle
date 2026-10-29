import { describe, expect, it } from "vitest";

import { effectiveZone, formatAdminDate, isoInZone, isValidZone, zoneDay, zoneDayBounds, zoneOffset, zoneOptions } from "../src/lib/admin-time";

/** 022-ux-improvement (US6, T053) — display time zone helpers. */
describe("effectiveZone", () => {
  it("member's choice, else the installation default, else Europe/Paris", () => {
    expect(effectiveZone({ displayTimezone: "America/New_York" }, { adminTimezone: "Europe/Paris" })).toBe("America/New_York");
    expect(effectiveZone({ displayTimezone: null }, { adminTimezone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
    expect(effectiveZone(null, { adminTimezone: "Asia/Tokyo" })).toBe("Asia/Tokyo"); // login page
    expect(effectiveZone(null, null)).toBe("Europe/Paris");
  });

  it("ignores an unknown zone", () => {
    expect(isValidZone("Mars/Olympus")).toBe(false);
    expect(effectiveZone({ displayTimezone: "Mars/Olympus" }, { adminTimezone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
  });

  it("offers the IANA list", () => {
    expect(zoneOptions()).toEqual(expect.arrayContaining(["Europe/Paris", "America/New_York", "UTC"]));
  });
});

describe("formatting", () => {
  const summer = new Date("2026-07-01T12:05:00Z");
  const winter = new Date("2026-01-15T23:30:00Z");

  it("formats in the zone, not the machine's", () => {
    expect(formatAdminDate(summer, "Europe/Paris")).toBe("01/07/2026 14:05");
    expect(formatAdminDate(summer, "America/New_York")).toBe("01/07/2026 08:05");
    expect(formatAdminDate(winter, "Asia/Tokyo")).toBe("16/01/2026 08:30");
    expect(formatAdminDate(winter, "Asia/Tokyo", "date")).toBe("16/01/2026");
    expect(formatAdminDate("not a date", "Europe/Paris")).toBe("");
  });

  it("offsets and ISO with offset", () => {
    expect(zoneOffset(summer, "Europe/Paris")).toBe("+02:00");
    expect(zoneOffset(winter, "Europe/Paris")).toBe("+01:00");
    expect(zoneOffset(summer, "America/New_York")).toBe("-04:00");
    expect(zoneOffset(summer, "Asia/Kolkata")).toBe("+05:30");
    expect(isoInZone(summer, "America/New_York")).toBe("2026-07-01T08:05:00-04:00");
    expect(zoneDay(winter, "Asia/Tokyo")).toBe("2026-01-16");
  });
});

describe("zoneDayBounds", () => {
  it("cuts a day at the zone's midnights", () => {
    expect(zoneDayBounds("2026-07-01", "2026-07-01", "Europe/Paris")).toEqual({ gte: "2026-06-30T22:00:00.000Z", lt: "2026-07-01T22:00:00.000Z" });
    expect(zoneDayBounds("2026-07-01", "2026-07-03", "America/New_York")).toEqual({ gte: "2026-07-01T04:00:00.000Z", lt: "2026-07-04T04:00:00.000Z" });
    expect(zoneDayBounds("2026-01-15", "2026-01-15", "America/New_York")).toEqual({ gte: "2026-01-15T05:00:00.000Z", lt: "2026-01-16T05:00:00.000Z" });
  });

  it("Europe/Paris DST days last 23 and 25 hours", () => {
    const hours = (b: { gte: string; lt: string }) => (Date.parse(b.lt) - Date.parse(b.gte)) / 3_600_000;
    expect(hours(zoneDayBounds("2026-03-29", "2026-03-29", "Europe/Paris"))).toBe(23);
    expect(hours(zoneDayBounds("2026-10-25", "2026-10-25", "Europe/Paris"))).toBe(25);
    expect(hours(zoneDayBounds("2026-10-26", "2026-10-26", "Europe/Paris"))).toBe(24);
  });
});
