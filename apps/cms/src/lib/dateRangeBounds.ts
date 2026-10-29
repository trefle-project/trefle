import { zoneDay, zoneDayBounds } from "./admin-time";

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Calendar-day range → ISO instant bounds, treating the picked days as UTC
 * days. For fields bucketed at exact UTC midnight (`page-stats.date`, see
 * `dayBucket()` in `./page-stats.ts`) — a day picked in the UI must line up
 * with how the row is actually stored, regardless of the operator's own
 * timezone (010-date-range-filters research.md §8).
 */
export function utcDayRangeBounds(from: Date, to: Date): { gte: string; lt: string } {
  const gte = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}T00:00:00.000Z`;
  const dayAfterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const lt = `${dayAfterTo.getFullYear()}-${pad(dayAfterTo.getMonth() + 1)}-${pad(dayAfterTo.getDate())}T00:00:00.000Z`;
  return { gte, lt };
}

/**
 * Calendar-day range → ISO instant bounds, treating the picked days as the
 * operator's own local calendar days. For precise, unbucketed timestamp
 * fields (`activity-log.at`, `pages.updatedAt`, `experiments.startedAt`) —
 * "today" means the operator's own wall-clock day, not a UTC day.
 */
export function localDayRangeBounds(from: Date, to: Date): { gte: string; lt: string } {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  const dayAfterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, 0, 0, 0, 0);
  return { gte: start.toISOString(), lt: dayAfterTo.toISOString() };
}

/** A picker's local calendar date → « YYYY-MM-DD » (its digits, whatever the machine's zone). */
const pickedDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 022-ux-improvement (US6) — calendar-day range → ISO instant bounds, the
 * picked days read as days of the member's display time zone `tz` (replaces
 * `localDayRangeBounds`, which followed the computer's clock).
 */
export function zoneDayRangeBounds(from: Date, to: Date, tz: string): { gte: string; lt: string } {
  return zoneDayBounds(pickedDay(from), pickedDay(to), tz);
}

/** The reverse, to show a stored bound back in the picker: the instant's day in `tz` as a local calendar date. */
export function pickerDateOf(iso: string, tz: string): Date {
  const [y, m, d] = zoneDay(new Date(iso), tz).split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}
