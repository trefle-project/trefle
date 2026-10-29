# Research: Filtres de période par calendrier

All findings below were verified by reading the installed source
(`node_modules/@payloadcms/ui`, `node_modules/payload`, `node_modules/next`)
at the pinned versions in this repo (Payload 3.88.0, Next 16.3.4, React
19.2.8), not inferred from general Payload/Next knowledge — this stack has
enough breaking-change history (see `AGENTS.md`) that assumptions from
training data are not trusted here.

## 1. Does a Payload list-view filter component need its own URL bookkeeping?

**Decision**: No. Call `useListQuery().handleWhereChange(where)` and stop —
Payload's own list view already syncs the query string and refetches.

**Rationale**: `node_modules/@payloadcms/ui/dist/providers/ListQuery/index.js`
shows `handleWhereChange` → `refineListData({ where })` → `mergeQuery(...)`
→, whenever `modifySearchParams` is true, `router.replace('?' +
qs.stringify(newQuery))`. `node_modules/@payloadcms/next/dist/views/List/index.js`
sets `modifySearchParams: !isInDrawer` — true on a collection's own
top-level list route (only false inside a relationship picker's List
Drawer, not our case). This also means a chosen period is
shareable/refresh-persistent for free (spec.md User Story 3), with no extra
code.

**Alternatives considered**: Hand-rolling `useRouter()`/`useSearchParams()`
URL bookkeeping in the filter component itself — rejected, redundant with
what Payload's own list-query provider already does, and risks fighting its
`mergeQuery` reconciliation instead of cooperating with it.

## 2. Does `handleWhereChange` merge or replace the current `where`?

**Decision**: It replaces `where` wholesale. The filter component must read
`useListQuery().query.where` itself, construct the full merged object, and
pass that back.

**Rationale**: `node_modules/@payloadcms/ui/dist/providers/ListQuery/mergeQuery.js`:
`where: 'where' in newQuery ? newQuery.where : currentQuery?.where` — no
deep merge.

## 3. How to combine the picked period with whatever Payload's native WhereBuilder ("Filters") already set?

**Decision**: Wrap the *entire* current `where` (whatever shape it is) as one
AND-branch, and add the date condition as a second, sibling AND-branch,
unwrapping a previous call's own wrapper first so repeated picks/clears don't
nest:

```ts
function mergeDateRangeIntoWhere(currentWhere, fieldName, range) {
  let base = currentWhere;
  if (base?.and?.length === 2) {
    const maybeOwn = base.and[1];
    if (maybeOwn && Object.keys(maybeOwn).length === 1 && Object.keys(maybeOwn)[0] === fieldName) {
      base = base.and[0];
    }
  }
  const baseIsEmpty = !base || Object.keys(base).length === 0;
  if (!range) return baseIsEmpty ? undefined : base;
  const condition = { [fieldName]: { greater_than_equal: range.gte, less_than: range.lt } };
  return baseIsEmpty ? condition : { and: [base, condition] };
}
```

**Rationale**: `node_modules/@payloadcms/ui/dist/elements/WhereBuilder/index.js`
always normalizes the filter UI's own contribution to `{ or: [{ and: [...] }]
}`. A shallow AND-wrap (rather than a recursive walk into every OR branch) is
semantically correct — a date-range filter should restrict the *whole*
result set — and is explicitly sufficient for v1 per this feature's scope
(spec.md does not require supporting a date condition living inside a
user-authored OR group). `greater_than_equal`/`less_than` are confirmed valid
`Operator` values (`node_modules/payload/dist/types/constants.d.ts`).

**Alternatives considered**: A recursive merge that finds and replaces any
existing `fieldName` condition anywhere in an arbitrary and/or tree —
rejected as unnecessary complexity (Principle I) for a v1 whose own filter
is the only thing ever setting a condition on that specific field via this
UI.

## 4. Which admin slot, and how is one component parameterized per collection?

**Decision**: `admin.components.beforeListTable`, registered via Payload's
*object* form of `PayloadComponent` — `{ path, clientProps }` — once per
collection, all pointing at the same component file with a different
`clientProps.fieldName` (and `utcDay` for `page-stats`). No per-collection
wrapper file.

**Rationale**: `node_modules/payload/dist/collections/config/types.d.ts`
defines `beforeList`/`beforeListTable`/`afterList`/`afterListTable` as four
independent arrays — no mutual-exclusivity constraint, confirmed by
`node_modules/@payloadcms/next/dist/views/List/renderListViewSlots.js`
rendering each into its own named slot. `beforeListTable` sits below
Payload's own search/WhereBuilder bar and just above the table — the
correct spot for a filter control (`beforeList`, used by `experiments`' own
`ExperimentsRunningBanner`, renders above everything, right for a banner,
not a filter — the two coexist as independent array entries with no
conflict). `node_modules/@payloadcms/ui/dist/elements/RenderServerComponent/index.js`
confirms `clientProps` on the object form are spread onto the rendered
component's own props; `node_modules/payload/dist/bin/generateImportMap/utilities/parsePayloadComponent.js`
confirms the import-map generator resolves the object and string forms
identically for `path`/`exportName`, ignoring `clientProps` — so three (four,
including `page-stats`) registrations of the same `path` collapse to one
import-map entry, invoked with different props each time.

## 5. Where does `react-day-picker`'s CSS load, and how does it stay themed?

**Decision**: Plain `import "react-day-picker/style.css"` directly inside
`DateRangePicker.client.tsx`, immediately followed by a small,
project-authored override stylesheet remapping `--rdp-*` custom properties
(scoped under react-day-picker v10's `.rdp-root`) to Payload's own
`--theme-*` tokens (e.g. `--theme-elevation-*`), which already flip
correctly per Payload's own `[data-theme]` light/dark toggle — no separate
dark-mode branch needed on our side.

**Rationale**: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`
("External stylesheets"): stylesheets from external packages may be imported
from any colocated `app/` component; the admin lives under
`apps/cms/src/app/(payload)/admin/...`, inside `app/`. Import order matters
(same doc, "Ordering and Merging") — the override file must be imported
*after* the package's own `style.css`. `node_modules/@payloadcms/ui/dist/providers/Theme/index.js`
confirms Payload sets `document.documentElement.setAttribute('data-theme',
theme)`, exactly the mechanism react-day-picker's own docs describe for a
manual dark-mode override. No existing component in this repo imports
external CSS yet (`grep` for `.css'`/`.scss'` under `apps/cms/src/components`
and `apps/cms/src/fields` is empty) — this is the first such import in the
codebase, worth a one-line note in the new file, not a new convention that
needs its own doc.

**Alternatives considered**: Payload's own `DatePicker` hand-copies
`react-datepicker`'s CSS into its package's own SCSS build
(`node_modules/@payloadcms/ui/dist/elements/DatePicker/library.scss`) — not a
usable precedent, that's Payload's own package build step, not an asset-
loading convention available to a consumer app.

## 6. `req` availability in the two `ExperimentStats` call sites

**Decision**: Both `PageExperimentsTab.tsx` (a Document Tab server
component) and `ExperimentResultsPanel.tsx` (a `ui` Field server component)
can add `req: PayloadRequest` to their destructured props and read
`req.searchParams.get("from"/"to")`.

**Rationale**: `node_modules/payload/dist/admin/forms/Field.d.ts`'s
`ServerComponentProps` (which `UIFieldServerProps` extends) declares `req:
PayloadRequest` as required; `node_modules/payload/dist/admin/views/document.d.ts`'s
`DocumentTabServerPropsOnly` likewise declares `readonly req: PayloadRequest`
as required. `PayloadRequest` (`node_modules/payload/dist/types/index.d.ts`)
picks `'searchParams'` from `URL`. A precedent for reading
`req.searchParams` already exists in
`apps/cms/src/app/(payload)/admin/[[...segments]]/page.tsx`.

**Caveat carried into Risks (plan.md)**: `PageExperimentsTab.tsx`'s own
comment already documents one prior case in this exact file where a
typed-as-populated prop (`ServerProps.id`) was not reliably populated in
this slot, found only by live prop inspection. Treat `req`'s presence as
needing the same live confirmation before relying on it, not as guaranteed
by the type alone.

## 7. `react-day-picker` version and React 19 compatibility

**Decision**: `react-day-picker@10.0.1`, exact-pinned.

**Rationale**: Confirmed via the npm registry: latest stable (non-prerelease)
release, `peerDependencies.react: ">=16.8.0"` (open-ended, covers React 19;
no separate `react-dom` peer declared). `date-fns` and `@date-fns/tz` come in
as `react-day-picker`'s own dependencies, not added directly. CSS is exposed
at the package's `style.css` export subpath, confirmed in the registry
`exports` map. v10 is a cleanup major over v9 (only removes APIs already
deprecated since v9); `mode="range"`, `DayPicker`, and the `DateRange`
selection type used here are unaffected — implementation should be written
against v10's current docs, not older v7/v8 examples that are common in
older tutorials/training data.

## 8. UTC-day vs. local-day boundary interpretation

**Decision**: Two boundary functions, not one:
- `utcDayRangeBounds(from, to)` — for `page-stats.date` (and, transitively,
  `ExperimentStats`'s query against `page-stats`): interprets the picked
  `Date`'s own `getFullYear()/getMonth()/getDate()` digits as a UTC calendar
  day.
- `localDayRangeBounds(from, to)` — for `activity-log.at`, `pages.updatedAt`,
  `experiments.startedAt`: interprets the same digits as the operator's own
  local calendar day (via `new Date(y, m, d, 0, 0, 0, 0).toISOString()`,
  which converts using the browser's own timezone offset).

**Rationale**: `apps/cms/src/lib/page-stats.ts`'s `dayBucket()` writes
`page-stats.date` as `Date.UTC(getUTCFullYear, getUTCMonth, getUTCDate)` —
rows are always exactly UTC midnight of the day they count, never in
between. Filtering that field must therefore treat the picked day as a UTC
day, or a French operator's local midnight (23:00 or 22:00 UTC the previous
day, depending on DST) would silently misalign with the stored bucket by up
to two hours. The other three fields are precise, unbucketed timestamps with
no such storage convention — for those, the spec's literal ask ("de
jj/mm/yyyy 0:00 à jj/mm/yyyy 23:59") is most naturally read as the
operator's own wall-clock day, which is what `localDayRangeBounds` produces.
Both return `{ gte, lt }` with `lt` at the *next* day's midnight (in the
relevant timezone) rather than `23:59:59.999` on the last day — avoids any
millisecond-precision assumption while covering the same instant, for both
UTC-bucketed and continuous-timestamp fields alike.

**Alternatives considered**: A single UTC-only interpretation for all four
fields (simpler, one function) — rejected because it would make "today" on
`activity-log`/`pages`/`experiments` silently exclude up to the first couple
of hours of the operator's own local day, a correctness bug that would be
easy to ship unnoticed and hard for a non-technical operator to diagnose.
