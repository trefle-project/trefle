# Contract: shared date-range filter components

Internal component contracts (this is an admin-only UI feature — no public
API or external interface). Documented because five call sites across four
collection configs and two document/field slots depend on these exact
shapes; getting one wrong fails silently into Payload's empty-component
fallback rather than a build error (research.md §4).

## `DateRangePicker.client.tsx` (pure calendar, no Payload/URL knowledge)

```ts
type DateRangePickerProps = {
  from?: Date;
  to?: Date;
  fromBound?: Date; // earliest selectable day, e.g. an experiment's startedAt
  toBound?: Date;   // latest selectable day, e.g. now or an experiment's endedAt
  onApply: (from: Date, to: Date) => void;
  onClear: () => void;
};
```

- Renders a `@payloadcms/ui` `Popup` whose trigger shows the active range
  (or a placeholder) and whose content is `<DayPicker mode="range" />` plus
  "Effacer" / "Appliquer" controls.
- "Appliquer" stays disabled until both `from` and `to` are chosen and
  `to >= from` (spec.md FR-005).
- Knows nothing about Payload `Where` clauses or URLs — both integration
  wrappers below own that translation.

## `CollectionDateRangeFilter.client.tsx` (Payload list-view wrapper)

Registered per collection via `admin.components.beforeListTable`, object
form of `PayloadComponent`:

```ts
type DateFieldOption = { name: string; label: string; utcDay?: boolean };
{
  path: "@/components/CollectionDateRangeFilter.client#default",
  clientProps: { fields: DateFieldOption[] },
}
```

`fields` is every date field this list can filter by — `pages` offers three
(found live: an operator needs to filter by `publishedAt` or `createdAt`,
not just `updatedAt`); a `<select>` is rendered only when `fields.length > 1`.

| Collection | `clientProps.fields` |
|---|---|
| `page-stats` | `[{ name: "date", label: "Date", utcDay: true }]` |
| `activity-log` | `[{ name: "at", label: "Date" }]` |
| `pages` | `[{ name: "updatedAt", label: "Dernière modification" }, { name: "publishedAt", label: "Publication" }, { name: "createdAt", label: "Création" }]` |
| `experiments` | `[{ name: "startedAt", label: "Début du test" }]` |

Behavior:
1. Local state `selectedFieldName` (default: whichever field a `where`
   condition already active on mount matches, else `fields[0].name`).
2. On mount, best-effort-parses `useListQuery().query.where` for an existing
   condition on ANY of `fields`' names to seed both `selectedFieldName` and
   the picker's active `from`/`to` (only when the seeded field matches the
   currently selected one — switching the `<select>` away from a seeded
   field clears the picker's displayed range, it does not carry it over).
3. On apply: `bounds = (activeField.utcDay ? utcDayRangeBounds : localDayRangeBounds)(from, to)`,
   `merged = mergeDateRangeIntoWhere(query.where, fields.map(f => f.name), selectedFieldName, bounds)`,
   `handleWhereChange(merged)`.
4. On clear: same with `range = null`.

`mergeDateRangeIntoWhere(currentWhere, candidateFieldNames, fieldName, range)`
— pure, exported from `apps/cms/src/lib/mergeDateRangeWhere.ts` (not
co-located with the `.client.tsx` component above — that file pulls in
`@payloadcms/ui`/`react-day-picker` and their own CSS imports, which this
project's Vitest config, Node environment with no CSS loader, cannot import;
found live when the first version of its test tried importing it from the
component file directly), unit-tested directly:

```ts
function mergeDateRangeIntoWhere(
  currentWhere: Where | undefined,
  candidateFieldNames: string[],
  fieldName: string,
  range: { gte: string; lt: string } | null,
): Where | undefined
```

`candidateFieldNames` is every field `fields` offers, not just the currently
selected one — this is what lets switching the `<select>` (e.g.
`updatedAt` → `publishedAt`) correctly *replace* the previous field's
condition rather than AND a stale condition on a different field together
with the new one.

Contract: idempotent under repeated apply/clear/field-switch (never nests
its own wrapper — research.md §3), preserves any condition on a field
outside `candidateFieldNames` that the native WhereBuilder already set, and
returns `undefined` (not `{}`) when there is nothing left to filter by.

## `ExperimentPeriodFilter.client.tsx` (A/B results panel wrapper)

```ts
type ExperimentPeriodFilterProps = {
  since: string | null;   // active lower bound, ISO — startedAt if no period chosen
  until: string | null;   // active upper bound, ISO — null if no period chosen
  startedAt: string | null; // picker's fromBound
  endedAt: string | null;   // picker's toBound (falls back to now if null/ongoing)
};
```

On apply/clear: read `window.location.search`, set/remove only `from`/`to`,
preserve every other existing param, then
`window.location.href = pathname + "?" + params` (full navigation, not
`router.push` — re-executes the Payload Document Tab / `ui` Field server
component reliably; research.md §6, plan.md Risks). `from`/`to` are each
picked day's own UTC-midnight instant, `utcDayRangeBounds(d, d).gte` —
**never** the already-advanced `.lt` bound a whole-range call would give:
`ExperimentStats.tsx`'s `armTotals` re-runs `endOfDayExclusive(until)`
server-side (same one-sided transform `since`/`startedAt` already gets), so
sending an already-advanced bound through and transforming it a second time
would silently push the upper bound one extra day further.

## `ExperimentStats.tsx` (consumer of the above)

```ts
function armTotals(
  payload: Payload,
  pageId: number | string,
  since: string | null,
  until: string | null,
): Promise<{ views: number; submissions: number }>
```

Contract: `where.date` gets `greater_than_equal` when `since` is set,
`less_than` (via `endOfDayExclusive(until)`) when `until` is set, either,
both, or neither — never throws or changes shape when one or both are
`null`, since the two existing call sites (`PageExperimentsTab.tsx`,
`ExperimentResultsPanel.tsx`) rely on the `until`-absent case being
byte-for-byte the current unbounded behavior (plan.md Constraints).
`startOfDay`/`endOfDayExclusive` live in `apps/cms/src/lib/experimentDayBounds.ts`
(moved out of `ExperimentStats.tsx` for the same CSS-import reason as
`mergeDateRangeIntoWhere` above, once this file started importing
`ExperimentPeriodFilter.client.tsx`).
