import { describe, expect, it } from "vitest";

import { endOfDayExclusive, startOfDay } from "../src/lib/experimentDayBounds";

/**
 * 008-ab-testing, US2 — `ExperimentStats` itself (the JSX-returning
 * component) is exempt from unit coverage per the constitution's
 * "purely presentational components... are EXEMPT" allowance; this
 * project's `apps/cms` Vitest setup has no JSX/React-rendering support
 * configured at all (unlike `apps/web`'s), and adding one for a single
 * component would be exactly the kind of infrastructure-for-one-use-case
 * this project avoids. Its integrated behavior (including this exact
 * regression) was instead verified live against the real stack —
 * screenshots + real page-stats data, not just mocked. `startOfDay` and
 * `endOfDayExclusive` (010-date-range-filters) are the pure logic worth a
 * unit test; both now live in `../src/lib/experimentDayBounds.ts`, not
 * `ExperimentStats.tsx` itself — that component file imports
 * `ExperimentPeriodFilter.client.tsx` (`@payloadcms/ui`/`react-day-picker`
 * and their CSS), which this Node-environment Vitest config cannot import.
 */
describe("startOfDay (008-ab-testing, US2)", () => {
  // Regression: found live — comparing page-stats' day-only `date`
  // (stored at midnight UTC) directly against `experiments.startedAt` (a
  // precise timestamp) silently excluded the entire day a test started
  // whenever it began after midnight (05:51 UTC hid that same day's
  // 00:00 row: `date >= startedAt` was false, the tab showed zero visits
  // despite real, same-day recorded activity).
  it("truncates a precise timestamp to midnight UTC of the same day", () => {
    expect(startOfDay("2026-09-17T05:51:38.217Z")).toBe("2026-09-17T00:00:00.000Z");
  });

  it("is a no-op for a value already at midnight", () => {
    expect(startOfDay("2026-09-17T00:00:00.000Z")).toBe("2026-09-17T00:00:00.000Z");
  });

  it("truncates a late-in-the-day timestamp to the same day, not the next", () => {
    expect(startOfDay("2026-09-17T23:59:59.999Z")).toBe("2026-09-17T00:00:00.000Z");
  });
});

describe("endOfDayExclusive (010-date-range-filters)", () => {
  it("advances a precise timestamp to midnight UTC of the following day", () => {
    expect(endOfDayExclusive("2026-09-17T05:51:38.217Z")).toBe("2026-09-18T00:00:00.000Z");
  });

  it("advances a value already at midnight to the following day, not a no-op", () => {
    expect(endOfDayExclusive("2026-09-17T00:00:00.000Z")).toBe("2026-09-18T00:00:00.000Z");
  });

  it("advances a late-in-the-day timestamp to the day after that same day, not two days later", () => {
    expect(endOfDayExclusive("2026-09-17T23:59:59.999Z")).toBe("2026-09-18T00:00:00.000Z");
  });

  it("crosses a month/year boundary correctly", () => {
    expect(endOfDayExclusive("2026-12-31T12:00:00.000Z")).toBe("2027-01-01T00:00:00.000Z");
  });
});
