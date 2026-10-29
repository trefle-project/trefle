"use client";

import DateRangePicker from "./DateRangePicker.client";
import { utcDayRangeBounds } from "../lib/dateRangeBounds";

/**
 * 010-date-range-filters — wraps `DateRangePicker` for the A/B results
 * panel (`ExperimentStats`), which is not a Payload list view — no
 * `useListQuery` here. On apply/clear, only `from`/`to` in the URL are
 * touched (every other param preserved) and a full navigation is used
 * (`window.location.href`, not `router.push`) so the Document Tab / `ui`
 * Field server component reliably re-executes with the new bounds
 * (research.md §6).
 *
 * `page-stats.date` (what `armTotals` ultimately queries) is UTC-bucketed,
 * so each picked day's digits must be read as a UTC day — `utcDayRangeBounds`
 * does that. Only each day's own UTC-midnight instant is sent through the
 * URL (`utcDayRangeBounds(d, d).gte`), never an already-advanced exclusive
 * bound: `armTotals`'s existing `startOfDay`/`endOfDayExclusive` do that
 * one-sided transform server-side, exactly as they already do for
 * `since`/`startedAt` today. Sending an already-advanced `less_than` bound
 * through and re-running `endOfDayExclusive` on it would silently push the
 * upper bound one extra day further.
 */
export default function ExperimentPeriodFilter({
  since,
  until,
  startedAt,
  endedAt,
}: {
  since: string | null;
  until: string | null;
  startedAt: string | null;
  endedAt: string | null;
}) {
  function navigate(from: string | null, to: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (from) params.set("from", from);
    else params.delete("from");
    if (to) params.set("to", to);
    else params.delete("to");
    const qs = params.toString();
    window.location.href = window.location.pathname + (qs ? `?${qs}` : "");
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <DateRangePicker
        from={since ? new Date(since) : undefined}
        to={until ? new Date(until) : undefined}
        fromBound={startedAt ? new Date(startedAt) : undefined}
        toBound={endedAt ? new Date(endedAt) : new Date()}
        onApply={(from, to) => {
          navigate(utcDayRangeBounds(from, from).gte, utcDayRangeBounds(to, to).gte);
        }}
        onClear={() => navigate(null, null)}
      />
    </div>
  );
}
