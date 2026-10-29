# Contract: Pages Stats (US1)

Access for the view and both endpoints: Administrator or Editor (as the
current `page-stats` read rule). Dates are `YYYY-MM-DD`; `to` is inclusive.

## View — `/admin/collections/page-stats`

Query: `from`, `to` (default: last 30 days ending today; days in the
member's display time zone — their choice, else the installation default —
or stored UTC days for periods older than the hourly data, research R3/R12,
notice shown; the zone always comes from the signed-in member, never from the
query),
`sort` (`views` | `submissions` | `rate` | `id` | `title` | `domain`, `-`
prefix = descending; default `-views`).

One row per page: published pages + any page with stats in the period, plus
one « Pages supprimées » row (no ID, no domain, no link) summing stats whose
page was deleted — shown only when non-zero.

| Column | Value |
|---|---|
| ID page | `pages.id` (no stats-row ID anywhere) |
| Page | title (link to the page document) |
| Domaine | page's domain hostname |
| Vues | Σ `views` in period |
| Soumissions | Σ `submissions` in period |
| Conversion | submissions ÷ views, 1 decimal %, « — » when views = 0 |

States: loading (period change), empty (« Aucune page »), error (message in
French, retry). Buttons: period picker, « Exporter CSV ». Clicking a row
toggles the chart (below).

## GET `/api/page-stats/series`

Query: `page` (id, or `deleted` for the « Pages supprimées » row), `from`,
`to`, `step` = `day` | `hour`.

- `step=hour` allowed only when `to − from ≤ 7 days` and `from` within the
  last 90 days → else `400 { error: "hour_range" }`.
- 200: `{ step, tz, dayBasis: "zone" | "utc", points: [{ t, views,
  submissions }], hourlyFrom }` — one point per day (zone day, or UTC day
  when `dayBasis = "utc"`) or per hour (ISO with offset in `tz`, DST hours as
  they are);
  missing buckets returned as 0, except hours before `hourlyFrom` (first
  hourly data) returned as `null` (« pas de données horaires »).
- 403 without access; 404 unknown page.

## GET `/api/page-stats/export`

Query: `from`, `to`, `sort` (as the view). 200 `text/csv; charset=utf-8`,
`Content-Disposition: attachment; filename="pages-stats_{from}_{to}.csv"`,
columns as the view, conversion as a number (empty when views = 0); a first
comment line gives the period, the time zone and the day basis.

## Tests

- Totals equal Σ daily rows (UTC basis) or Σ hourly rows (zone basis); one
  row per page; published page with no stats → 0; unpublished page with
  stats listed; deleted page's stats on the « Pages supprimées » row; sort by
  each column.
- Day basis: period starting after `hourlyFrom` → zone days (e.g.
  America/New_York cuts at 05:00/04:00 UTC); before → UTC days + notice.
- DST: a 23-hour and a 25-hour day in Europe/Paris give 23/25 hour points and
  exact day totals.
- Series: day points fill gaps with 0; hour range rule; `null` before
  `hourlyFrom`; access 403.
- Export: same rows/totals as the view for the same query.
- `incrementPageStat`: day and hour rows both incremented; concurrent calls
  add up (extends 020's test); edge batch uses the window's hour.
- Migration back-fill: per-hour sums from a seeded `edge_view_windows` and
  leads; leads older than the earliest ledger window are **not** back-filled;
  down drops the table.
- Retention: hourly rows > 90 days removed, daily rows untouched.
