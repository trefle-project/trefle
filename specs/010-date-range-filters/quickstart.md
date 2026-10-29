# Quickstart: Filtres de période par calendrier

## Prerequisites

- `apps/cms` dev stack running (per `infra/docker-compose.yml` +
  `docker-compose.override.yml` — always pass both `-f` flags).
- An admin/editor account with at least a few days of spread-out data in
  `page-stats`, `activity-log`, `pages` (varied `updatedAt`), and at least
  one `experiments` document with a few days of real `page-stats` activity
  under its control/variant pages.

## §1 — Static checks

```
npm run typecheck --workspace=apps/cms
npm run test --workspace=apps/cms
```
Expected: no type errors; `date-range-bounds.test.ts`,
`collection-date-range-filter.test.ts`, and the extended
`experiment-stats.test.ts` all pass.

## §2 — `pages` list (first wired collection)

1. Open `/admin/collections/pages`. Confirm the date-range control renders
   just above the table, below Payload's own search/filter bar.
2. Pick a period covering only some of the pages' `updatedAt` values.
   Confirm the table narrows to matching rows and the URL gains a `where`
   query param.
3. Hard-refresh the page at that URL. Confirm the same period still shows
   as active and the table stays filtered (spec.md User Story 3).
4. Open Payload's native "Filters" (WhereBuilder), add an unrelated
   condition (e.g. `status equals published`), keep the date period active.
   Confirm both apply together (AND). Clear the date period only; confirm
   the native filter condition is untouched.
5. Pick a period with no matching pages. Confirm an explicit "no results for
   this period" state, not a bare empty table (spec.md FR-008).
6. Toggle light/dark admin theme; confirm the calendar reads cleanly in
   both.

## §3 — `activity-log`, `experiments`, `page-stats` lists

Repeat §2 steps 1–3 on each of the other three lists.

On `experiments`: confirm `ExperimentsRunningBanner` still renders above
everything, unaffected by the new control sharing the list view.

On `page-stats` specifically: pick "today" as the period. Confirm the
result includes today's UTC-midnight-bucketed row even when the browser's
local time is already into tomorrow UTC, and excludes yesterday's row —
i.e. the boundary is a UTC day, not a local one (research.md §8). Contrast
with the same "today" pick on `pages`/`activity-log`, where the boundary
should instead match the browser's own local midnight.

## §4 — A/B test results panel

1. Open a page's "Tests A/B" tab (`PageExperimentsTab`) for a page with a
   running or past test that has multiple days of `page-stats` activity.
   Confirm a period control renders above the results table, bounded to the
   test's own `startedAt`/`endedAt` (can't pick outside the test's
   lifetime).
2. Pick a period covering only part of the test's activity. Confirm the
   visits/conversions per variant change to reflect only that period, and
   that applying causes a full page reload (not a soft client transition).
3. Clear the period. Confirm the table returns to the original
   unbounded-since-`startedAt` totals — byte-identical to the numbers shown
   before this feature existed on this same test.
4. Repeat steps 1–3 from the experiment's own admin edit view
   (`ExperimentResultsPanel`) instead of the page's tab, on the same
   experiment. Confirm identical numbers for the same period from both
   entry points.

## §5 — Regression: two untouched call sites

Open a page's "Tests A/B" tab and an experiment's edit view for a test that
was never interacted with via the new period control. Confirm both still
show exactly the pre-feature default (unbounded since `startedAt`) with no
extra action needed — this is what the Phase 5 unit test on `armTotals`
guards statically; this step confirms it live.

## Done when

- All of §1's automated checks pass.
- §2–§4's manual checks pass on the real admin, across both light and dark
  themes.
- §5 shows no regression on the two pre-existing `ExperimentStats` call
  sites.
