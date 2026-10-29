# Implementation Plan: Filtres de période par calendrier

**Branch**: `010-date-range-filters` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-date-range-filters/spec.md`

## Summary

Add a graphical, day-granularity date-range filter to four existing Payload
list views (`page-stats`, `activity-log`, `pages`, `experiments`) and to the
A/B-test results panel (`ExperimentStats`, which today only has a fixed
lower bound at the test's `startedAt` and no upper bound or UI control at
all). One shared calendar component (`react-day-picker`, the one new runtime
dependency this feature needs) is reused across all five surfaces via two
thin, context-specific wrappers: a Payload list-view wrapper that reads/writes
`where` through `useListQuery()`/`handleWhereChange()` (verified to already
round-trip into the URL for free), and a non-list wrapper for the A/B results
panel that navigates with `from`/`to` URL params read server-side via
`req.searchParams`. `page-stats.date` is bucketed at exact UTC midnight
(`apps/cms/src/lib/page-stats.ts`'s `dayBucket()`); the other three fields are
precise timestamps. The picker therefore has two boundary-computation modes —
UTC calendar day (for `page-stats` and, transitively, `ExperimentStats`, which
queries `page-stats`) and local calendar day (for `activity-log`, `pages`,
`experiments`) — so a day picked in the UI always lines up with how the
underlying field is actually stored.

## Technical Context

**Language/Version**: TypeScript, Node (repo-wide). Payload 3.88 + Next 16,
React 19.2.8 (`apps/cms`). No change to `apps/web`.

**Primary Dependencies**: `react-day-picker@10.0.1` (new, `apps/cms` only) —
peer dep `react: ">=16.8.0"`, confirmed React-19-safe. No other new
dependency; `@payloadcms/ui`'s `useListQuery`/`Popup` and `payload`'s
`Where`/`Operator` types are used directly.

**Storage**: PostgreSQL via Payload — **no schema change**. No new fields, no
new collection, no migration. This feature only adds a `where`-query filter
on fields that already exist (`page-stats.date`, `activity-log.at`,
`pages.updatedAt`, `experiments.startedAt`) and an optional upper bound to an
existing read query (`ExperimentStats`'s `armTotals`).

**Testing**: Vitest (`apps/cms`, `tests/**/*.test.ts`, Node environment, no
JSX rendering configured — matches this repo's existing convention of testing
only the pure logic exported alongside a component, e.g.
`tests/experiment-stats.test.ts` already does this for `startOfDay`). New:
`tests/date-range-bounds.test.ts` (`utcDayRangeBounds`/`localDayRangeBounds`)
and `tests/collection-date-range-filter.test.ts`
(`mergeDateRangeIntoWhere`'s wrap/unwrap/clear behavior); extend
`tests/experiment-stats.test.ts` with the new `endOfDayExclusive` helper and
`armTotals`'s two-bound `where` construction. Presentational components
(`DateRangePicker.client.tsx`, `CollectionDateRangeFilter.client.tsx`,
`ExperimentPeriodFilter.client.tsx`) are exempt per constitution Principle IV,
same allowance already used for `ExperimentStats` itself — verified live
against the real admin instead.

**Target Platform**: Same Docker Compose stack, `apps/cms` container only. No
`infra/` change.

**Project Type**: Existing monorepo; touches only `apps/cms`.

**Performance Goals**: The Payload admin has no client-JS budget (constitution
Technology & Delivery Standards, Performance budget) but must stay responsive
for daily editing — `react-day-picker` is a small, tree-shakeable package;
the shared calendar component is only mounted where used (four list views'
`beforeListTable` slot, plus the results panel), never on every admin route.

**Constraints**: Every one of the five surfaces MUST behave exactly as today
when no period is chosen — in particular `ExperimentStats`'s two existing
call sites (`PageExperimentsTab.tsx`, `ExperimentResultsPanel.tsx`) must keep
their current unbounded-since-`startedAt` behavior unchanged when `until` is
absent (regression safety, spec.md User Story 2's second acceptance
scenario).

**Scale/Scope**: Four Payload collection list views + one non-list admin
panel (mounted at two call sites); one shared pure calendar component, two
thin integration wrappers, one new npm dependency.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check |
|---|---|
| I. Simplicity First | One pure calendar component (`DateRangePicker.client.tsx`) reused by all five call sites — well past the "third use" threshold that justifies extraction (Principle I explicitly allows this). Two thin wrappers, one per integration mechanism, no bespoke abstraction hiding Payload's or Next's own APIs: `useListQuery`/`handleWhereChange` and `req.searchParams` are called directly, not wrapped. |
| II. Stack-Native, Minimal Additions | `react-day-picker` is the one dependency beyond the stack. Justified: `@payloadcms/ui` exposes only a single-date field widget (built on `react-datepicker` internally, not a public range component), no reusable graphical range picker exists in the stack already. Exact-pinned (`10.0.1`), matching this repo's convention for newly adopted deps. The justification is written here and MUST also appear in the implementing commit/PR body per Principle II's own requirement. |
| III. Small, Reversible Changes | No schema/migration — no expand/migrate/contract sequence needed. The whole change is one coherent, cleanly revertible unit (delete the new files, remove the `admin.components.beforeListTable` entries, revert `package.json`). Not half-finished at any point: each of the five surfaces keeps working exactly as before whenever a period isn't chosen. |
| IV. Working Software Over Ceremony | The pure business logic — day-boundary computation (`utcDayRangeBounds`/`localDayRangeBounds`) and `where`-merging (`mergeDateRangeIntoWhere`) — is a data transformation and gets unit tests (Testing, above), matching this feature area's own existing precedent (`startOfDay`'s test). Presentational components stay exempt, same allowance already used for `ExperimentStats`. Lint + typecheck gate as usual. |
| V. Quality the User Feels | The four list views and the results panel are "Payload admin customisations", which per this principle MUST handle their loading/empty/error states explicitly — the empty-period-result state (spec.md FR-008) and an accessible calendar trigger (FR-009) are both required by the spec's acceptance criteria, not left implicit. No published-page performance budget applies (admin-only), but the admin's own responsiveness bar still does. |

Gate: **PASS**. One Complexity Tracking entry below for `react-day-picker`,
required whenever a runtime dependency beyond the stack is added.

## Project Structure

### Documentation (this feature)

```text
specs/010-date-range-filters/
├── plan.md                                    # this file
├── research.md                                # Phase 0 output
├── data-model.md                              # Phase 1 output
├── quickstart.md                              # Phase 1 output
└── contracts/
    └── date-range-filter-component.md         # Phase 1 output
```

### Source Code (repository root)

```text
apps/cms/src/lib/dateRangeBounds.ts                    # new — utcDayRangeBounds, localDayRangeBounds (pure)
apps/cms/src/lib/mergeDateRangeWhere.ts                # new — mergeDateRangeIntoWhere (pure)
apps/cms/src/lib/experimentDayBounds.ts                # new — startOfDay (moved), endOfDayExclusive (pure)
apps/cms/src/components/DateRangePicker.client.tsx      # new — shared calendar (Popup + react-day-picker range)
apps/cms/src/components/DateRangePicker.css             # new — --rdp-* → Payload --theme-* token mapping
apps/cms/src/components/CollectionDateRangeFilter.client.tsx  # new — Payload list-view wrapper (useListQuery)
apps/cms/src/components/ExperimentPeriodFilter.client.tsx     # new — ExperimentStats wrapper (URL nav)

apps/cms/src/collections/PageStats.ts          # + admin.components.beforeListTable (fieldName: "date", utcDay: true)
apps/cms/src/collections/ActivityLog.ts        # + admin.components.beforeListTable (fieldName: "at")
apps/cms/src/collections/Pages.ts              # + beforeListTable (fieldName: "updatedAt"); PageStatsPanel comment untouched
apps/cms/src/collections/Experiments.ts        # + beforeListTable alongside existing beforeList (fieldName: "startedAt")

apps/cms/src/components/ExperimentStats.tsx    # + until param, armTotals two-bound where; startOfDay/endOfDayExclusive now imported from lib/experimentDayBounds.ts
apps/cms/src/components/PageExperimentsTab.tsx     # + req in props; since/until from req.searchParams
apps/cms/src/components/ExperimentResultsPanel.tsx # + req in props; since/until from req.searchParams

apps/cms/package.json                          # + react-day-picker@10.0.1

apps/cms/tests/date-range-bounds.test.ts               # new
apps/cms/tests/collection-date-range-filter.test.ts     # new — tests lib/mergeDateRangeWhere.ts
apps/cms/tests/experiment-stats.test.ts                 # extended (endOfDayExclusive) — tests lib/experimentDayBounds.ts
```

**Structure Decision**: No new app, no new collection, no migration. Every
change lands in `apps/cms`; `apps/web` and `infra/` are untouched. This
matches the feature's actual scope (an admin-only read-side filter).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `react-day-picker`: a runtime dependency beyond the stack (Principle II) | A graphical, "agenda-style" range picker with day-granularity range selection is the explicitly requested UX; the stack's own admin UI kit (`@payloadcms/ui`) exposes only a single-date field widget, not a reusable range component. | Two native `<input type="date">` fields (zero dependency) was presented to and considered by the user alongside this option; the user explicitly chose the graphical calendar picker for the intended day-to-day operator experience. |

## Phasing

Each phase = one commit, independently revertible per constitution
Principle III.

### Phase 1 — Pure logic: day-boundary math and `where` merging

- `apps/cms/src/lib/dateRangeBounds.ts`: `utcDayRangeBounds(from, to)`,
  `localDayRangeBounds(from, to)`, both returning `{ gte, lt }` (a `less_than`
  next-day boundary, not `less_than_equal` 23:59:59.999 — avoids any
  millisecond-precision assumption while covering the full last day).
- Unit tests (`tests/date-range-bounds.test.ts`): UTC vs. local interpretation
  of the same picked days actually differ when the two would disagree (the
  regression this split exists to prevent); single-day range; multi-day
  range; month/year boundary crossing.

Verify: `npm run test --workspace=apps/cms`, `npm run typecheck --workspace=apps/cms`.

### Phase 2 — Shared calendar UI

- `apps/cms/package.json`: add `react-day-picker@10.0.1`, install.
- `apps/cms/src/components/DateRangePicker.client.tsx`: pure calendar,
  `"use client"`, no Payload/URL knowledge — props
  `{ from?, to?, fromBound?, toBound?, onApply(from, to), onClear() }`,
  rendered inside a `@payloadcms/ui` `Popup`. French locale, "Effacer" /
  "Appliquer" (disabled until both bounds chosen).
- `apps/cms/src/components/DateRangePicker.css`: `--rdp-*` → Payload
  `--theme-*` token mapping (see contracts/date-range-filter-component.md for
  the exact tokens), imported after `react-day-picker/style.css`.

Verify: no wiring yet — sanity-check only by temporarily mounting it anywhere
convenient in the admin, or skip straight to Phase 3 where it gets real
call sites.

### Phase 3 — Payload list-view wrapper, wired into `pages` first

- `apps/cms/src/lib/mergeDateRangeWhere.ts`: `mergeDateRangeIntoWhere`, pure,
  in its own dependency-free file rather than co-located with the
  `.client.tsx` component that calls it — found live that `CollectionDateRangeFilter.client.tsx`
  pulls in `@payloadcms/ui`/`react-day-picker` (and their own CSS imports),
  which this project's Vitest config (Node environment, no CSS loader)
  cannot import, breaking a unit test that tried to import the pure function
  from the component file directly (same fix pattern later reused in Phase 5
  for `startOfDay`/`endOfDayExclusive`).
- `apps/cms/src/components/CollectionDateRangeFilter.client.tsx`: reads
  `useListQuery()`, seeds the picker from any existing condition on
  `fieldName` in `query.where`, and on apply/clear calls
  `mergeDateRangeIntoWhere` (contracts/date-range-filter-component.md) then
  `handleWhereChange`. Registered via `PayloadComponent`'s object form —
  `{ path, clientProps: { fieldName, utcDay? } }` — so one component file
  serves all four collections.
- `apps/cms/src/collections/Pages.ts`: wire in first (`fieldName: "updatedAt"`)
  — the most-exercised list, easiest to eyeball correctness against.
- Unit tests (`tests/collection-date-range-filter.test.ts`):
  `mergeDateRangeIntoWhere` against an empty `where`, a `where` already
  containing a WhereBuilder-produced `{ or: [{ and: [...] }] }`, and a
  previous call's own wrapper (re-pick and clear don't nest).

Verify: quickstart.md §1–§2.

### Phase 4 — Roll the same wrapper out to the remaining three lists

- `apps/cms/src/collections/ActivityLog.ts` (`fieldName: "at"`),
  `apps/cms/src/collections/Experiments.ts` (`fieldName: "startedAt"`,
  alongside the existing `beforeList: ExperimentsRunningBanner`),
  `apps/cms/src/collections/PageStats.ts` (`fieldName: "date", utcDay: true`
  — the one UTC-day collection).

Verify: quickstart.md §3, plus the UTC-vs-local boundary check from Phase 1's
tests, live against real `page-stats` rows.

### Phase 5 — `ExperimentStats` upper bound + non-list wrapper

- `apps/cms/src/lib/experimentDayBounds.ts`: moves the existing `startOfDay`
  out of `ExperimentStats.tsx` and adds `endOfDayExclusive(iso)` next to it —
  same reason as Phase 3's `mergeDateRangeWhere.ts` split: `ExperimentStats.tsx`
  now imports `ExperimentPeriodFilter.client.tsx`, so its pure helpers can no
  longer be unit-imported directly without pulling in the same
  Vitest-incompatible client/CSS chain.
- `apps/cms/src/components/ExperimentStats.tsx`: imports both from the new lib
  file; `armTotals(payload, pageId, since, until)` builds `where.date` with
  `greater_than_equal`/`less_than` from whichever bounds are present;
  `ExperimentStats` accepts and renders `until`, mounting
  `ExperimentPeriodFilter` above the results table.
- `apps/cms/src/components/ExperimentPeriodFilter.client.tsx`: wraps
  `DateRangePicker`, bounded to the test's real lifetime
  (`fromBound = startedAt`, `toBound = endedAt ?? now`); on apply/clear,
  computes each picked day's own UTC-midnight instant via
  `utcDayRangeBounds(d, d).gte` (never an already-advanced `less_than`
  bound — re-running `endOfDayExclusive` on one would silently push the
  upper bound a second day further) and rewrites only `from`/`to` in
  `window.location.search`, then does a full navigation
  (`window.location.href`) — same discipline as `PromoteActions.client.tsx`'s
  post-mutation reload, so the change reliably re-executes the server
  component rather than depending on soft-navigation re-render of a Payload
  Document Tab / `ui` Field.
- `apps/cms/src/components/PageExperimentsTab.tsx`,
  `ExperimentResultsPanel.tsx`: add `req` to the destructured props; compute
  `since`/`until` from `req.searchParams.get("from"/"to")`, falling back to
  the existing `startedAt`/`null` defaults.
- Unit tests: extend `tests/experiment-stats.test.ts` with
  `endOfDayExclusive` (mirrors `startOfDay`'s existing cases) and a case
  asserting `armTotals`'s `where.date` carries both bounds when `until` is
  given, and only the lower bound when it isn't (regression guard for the
  Constraints requirement above).

Verify: quickstart.md §4–§5.

### Phase 6 — Verification pass

- `npm run test --workspace=apps/cms`, `npm run typecheck --workspace=apps/cms`, lint.
- Live: quickstart.md end to end on all five surfaces, including the
  light/dark theme check and the WhereBuilder-coexistence check.

## Risks

| Risk | Mitigation |
|---|---|
| A picked "day" silently means different instants on `page-stats` (UTC-bucketed) vs. the other three fields (local calendar day), producing off-by-a-few-hours results an operator wouldn't notice | The `utcDay` flag is explicit per registration (Phase 3/4), covered by dedicated unit tests (Phase 1) that assert the two modes actually diverge for the same picked days, and by a live boundary check in Phase 4 against real `page-stats` rows. |
| `handleWhereChange`'s wholesale `where` replacement silently drops a condition the native WhereBuilder had already set, if the merge logic is wrong | `mergeDateRangeIntoWhere` is unit-tested directly against a WhereBuilder-shaped `{ or: [{ and: [...] }] }` input (Phase 3), and quickstart.md's live check exercises the real WhereBuilder UI side by side with the new filter. |
| `req.searchParams` turns out not to be reliably populated in the Document-Tab/`ui`-Field server-component slots, despite being typed as required (this exact codebase already found one prior case of a typed-as-present prop not being reliably populated in one of these same two components) | Flagged as an explicit live-check step in quickstart.md rather than assumed from the type; if it fails live, `req` is available as a fallback from the same slot's other documented prop paths without changing the rest of the design. |
| `ExperimentStats`'s two existing call sites regress (start showing filtered-out data) once `until` becomes a parameter | `until` defaults to `null` everywhere it isn't explicitly supplied, and a dedicated unit test (Phase 5) asserts `armTotals`'s `where` has no upper bound when `until` is absent — the exact condition the two existing call sites rely on. |
