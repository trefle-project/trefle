# Data Model: Filtres de période par calendrier

No new Payload collection, field, or migration. This feature filters
existing fields; the "entities" below are transient/derived shapes, not
persisted data.

## Selected period

A day-granularity range, held only in the browser (list-view `where` query
string, or the `from`/`to` URL params on the A/B results panel) — never
written to the database.

| Field | Type | Notes |
|---|---|---|
| `from` | calendar day (`Date`, no time component in the UI) | Inclusive start of the period. |
| `to` | calendar day (`Date`, no time component in the UI) | Inclusive end of the period. |

**Validation rules** (spec.md FR-005): both bounds must be set, and `to`
must not be before `from`, before the period can be applied — enforced by
disabling "Appliquer" in `DateRangePicker.client.tsx` until both hold.

**Derived shape, on apply** (`dateRangeBounds.ts`): `{ gte: string; lt:
string }` — ISO instants, `gte` = start of the `from` day, `lt` = start of
the day *after* `to` (never a value + `23:59:59.999` literal, to avoid a
millisecond-precision assumption). Which of the two boundary interpretations
produces these (UTC calendar day vs. the operator's local calendar day) is a
property of the field being filtered, not of the period itself — see
Filterable view registry below.

## Filterable view registry

The four Payload list views and the A/B results panel are not modeled as
data — this table exists to record, once, which field and which
boundary-interpretation mode applies to each of the five surfaces (research.md
§8), since it's the one fact a future change to this feature is most likely
to need and easiest to get wrong by copy-paste:

| Surface | Field(s) offered | Boundary mode | Where condition shape |
|---|---|---|---|
| `page-stats` list | `date` (single field, no selector shown) | UTC calendar day | `{ date: { greater_than_equal, less_than } }` |
| `activity-log` list | `at` (single field, no selector shown) | Operator's local calendar day | `{ at: { greater_than_equal, less_than } }` |
| `pages` list | `updatedAt` / `publishedAt` / `createdAt` — operator picks via `<select>` (found live: the operator needs to filter by whichever of the three is relevant, not just `updatedAt`) | Operator's local calendar day (all three) | `{ [selectedField]: { greater_than_equal, less_than } }` |
| `experiments` list | `startedAt` (single field, no selector shown) | Operator's local calendar day | `{ startedAt: { greater_than_equal, less_than } }` |
| A/B results panel (`ExperimentStats`) | `page-stats.date`, queried per arm | UTC calendar day (same as `page-stats` above — same underlying field) | `{ date: { greater_than_equal, less_than } }` per `armTotals` call |

`CollectionDateRangeFilter.client.tsx`'s `clientProps` is therefore `{ fields:
{ name: string; label: string; utcDay?: boolean }[] }` (not a single
`fieldName`) on every collection — `pages` passes three entries, the other
three collections pass one (which suppresses the `<select>`, showing just the
period picker as before). `mergeDateRangeIntoWhere` takes every offered field
name as a `candidateFieldNames` set, so it recognizes and replaces its own
condition regardless of which field was active on a previous apply —
switching from "Dernière modification" to "Publication" replaces the old
condition rather than AND-ing a stale one on a different field together with
the new one.

## Merged `where` (Payload list views only)

The value actually sent to `handleWhereChange`, combining whatever the
native WhereBuilder ("Filters") already set with the picked period
(research.md §3):

```
{ and: [ <existing where, or {} if none>, { [field]: { greater_than_equal, less_than } } ] }
```

Clearing the period restores `<existing where>` unwrapped, not `{ and: [
<existing where> ] }` — `mergeDateRangeIntoWhere` (contracts/date-range-filter-component.md)
unwraps a previous call's own wrapper first, so repeated apply/clear cycles
never accumulate nesting.
