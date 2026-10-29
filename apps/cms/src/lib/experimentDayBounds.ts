/**
 * 008-ab-testing / 010-date-range-filters — day-boundary helpers for
 * `ExperimentStats.tsx`'s `armTotals`. Kept in their own dependency-free
 * file, not co-located with the component, because `ExperimentStats.tsx`
 * now imports `ExperimentPeriodFilter.client.tsx` (which pulls in
 * `@payloadcms/ui`/`react-day-picker` and their own CSS imports) — this
 * project's Vitest config (Node environment, no CSS loader) cannot import
 * that chain, found live the same way `mergeDateRangeWhere.ts` was split
 * out from `CollectionDateRangeFilter.client.tsx`.
 *
 * `page-stats.date` is day-only (stored at midnight UTC for the day it
 * counts) while `experiments.startedAt` is a precise timestamp — comparing
 * them directly excludes the entire day a test started whenever it began
 * after midnight (found live: a test started at 05:51 UTC hid that same
 * day's 00:00 `page-stats` row entirely, `date >= startedAt` was false).
 * Truncating `since` to the start of its own calendar day fixes it; the
 * small amount of pre-test activity earlier that same day this can now
 * include is an acceptable, unavoidable trade-off of day-level granularity.
 */
export function startOfDay(iso: string): string {
  return `${iso.slice(0, 10)}T00:00:00.000Z`;
}

/** The upper-bound counterpart to `startOfDay`: truncates to the same UTC
 * day, then advances one day, so a `less_than` comparison against it
 * includes the entirety of `iso`'s own day. */
export function endOfDayExclusive(iso: string): string {
  const nextDay = new Date(startOfDay(iso));
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString();
}
