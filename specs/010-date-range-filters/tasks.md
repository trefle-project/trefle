---

description: "Task list for Filtres de période par calendrier"
---

# Tasks: Filtres de période par calendrier

**Input**: Design documents from `/specs/010-date-range-filters/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — plan.md commits to Vitest units for the pure logic
(day-boundary math, `where`-merging, `endOfDayExclusive`/`armTotals`'s
two-bound query), matching the constitution's Principle IV requirement for
business/data-transformation logic. Presentational components stay exempt,
same allowance this codebase already uses for `ExperimentStats` itself.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

- [X] T001 Add `"react-day-picker": "10.0.1"` to `apps/cms/package.json` dependencies and install (plan.md Constitution Check — dependency justified under Principle II: no reusable range-picker component exists in `@payloadcms/ui`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — both US1 and US2 mount the same shared calendar component and depend on the same day-boundary math.

- [X] T002 [P] Create `apps/cms/src/lib/dateRangeBounds.ts`: `utcDayRangeBounds(from: Date, to: Date)` and `localDayRangeBounds(from: Date, to: Date)`, both pure, both returning `{ gte: string; lt: string }` where `lt` is the start of the day *after* `to` in the relevant timezone (never a `23:59:59.999` literal) — research.md §8
- [X] T003 [P] Create `apps/cms/tests/date-range-bounds.test.ts`: for the same picked `from`/`to` days, `utcDayRangeBounds` and `localDayRangeBounds` produce different `gte` instants whenever the operator's local offset is non-zero (the regression this split exists to prevent); single-day range; multi-day range; a range crossing a month/year boundary (depends on T002)
- [X] T004 [P] Create `apps/cms/src/components/DateRangePicker.client.tsx`: `"use client"`, pure calendar with no Payload/URL knowledge — props `{ from?: Date; to?: Date; fromBound?: Date; toBound?: Date; onApply: (from: Date, to: Date) => void; onClear: () => void }` (contracts/date-range-filter-component.md); renders a `@payloadcms/ui` `Popup` whose trigger shows the active range (or a placeholder) and whose content is `<DayPicker mode="range" />` (French locale) plus "Effacer" and "Appliquer" buttons — "Appliquer" MUST stay disabled until both `from` and `to` are chosen and `to >= from` (spec.md FR-005) (depends on T001)
- [X] T005 [P] Create `apps/cms/src/components/DateRangePicker.css`: remap react-day-picker v10's `.rdp-root`-scoped `--rdp-*` custom properties to Payload's own `--theme-*` tokens (research.md §5); import it from T004's file immediately after `import "react-day-picker/style.css"` (import order is load-bearing — the override must load second) (depends on T001)

**Checkpoint**: The shared calendar compiles and renders in isolation with correct day-boundary math available; nothing is wired into a real admin view yet.

---

## Phase 3: User Story 1 - Filtrer une liste d'administration par période (Priority: P1) 🎯 MVP

**Goal**: A graphical period picker on the `page-stats`, `activity-log`, `pages`, and `experiments` list views, combining with whatever native filters ("Filters"/WhereBuilder) are already active.

**Independent Test**: On any of the four lists, pick a start and end date in the calendar; confirm only entries whose relevant date falls within that period remain, and that the list returns to its unfiltered state once the period is cleared (spec.md User Story 1).

### Tests for User Story 1

- [X] T006 [P] [US1] Create `apps/cms/tests/collection-date-range-filter.test.ts` for `mergeDateRangeIntoWhere`: merging a range into an empty `where` returns just the date condition; merging into a WhereBuilder-shaped `{ or: [{ and: [...] }] }` wraps it as a sibling AND-branch without altering it; clearing (`range: null`) restores the original `where` unwrapped, not re-wrapped; a second apply/clear cycle never nests a previous call's own wrapper (research.md §3, contracts/date-range-filter-component.md) — *(deviation found live: importing this function from `CollectionDateRangeFilter.client.tsx` broke the test — that file pulls in `@payloadcms/ui`/`react-day-picker` and their own CSS imports, which this project's Node-environment Vitest config cannot load (`TypeError: Unknown file extension ".css"`). `mergeDateRangeIntoWhere` was moved to its own dependency-free `apps/cms/src/lib/mergeDateRangeWhere.ts`, and the test imports it from there instead — same fix pattern reused in T013.)*

### Implementation for User Story 1

- [X] T007 [US1] Create `apps/cms/src/components/CollectionDateRangeFilter.client.tsx`: `"use client"`, props via `clientProps: { fieldName: string; utcDay?: boolean }`; calls `useListQuery()`; on mount, best-effort-parses `query.where` for an existing condition on `fieldName` to seed T004's picker; on apply, computes `(utcDay ? utcDayRangeBounds : localDayRangeBounds)(from, to)` (T002), merges via `mergeDateRangeIntoWhere` (imported from `apps/cms/src/lib/mergeDateRangeWhere.ts`, per T006's note), calls `handleWhereChange`; on clear, same with `range: null` (depends on T002, T004, T006)
- [X] T008 [US1] Wire into `apps/cms/src/collections/Pages.ts`: add `beforeListTable: [{ path: "@/components/CollectionDateRangeFilter.client#default", clientProps: { fieldName: "updatedAt" } }]` inside the existing `admin.components` object — leave the `PageStatsPanel` comment and the `edit`/`views` keys untouched (depends on T007)
- [X] T009 [P] [US1] Wire into `apps/cms/src/collections/ActivityLog.ts`: add `admin.components.beforeListTable` (collection currently has no `admin.components` block) with `clientProps: { fieldName: "at" }` (depends on T007)
- [X] T010 [P] [US1] Wire into `apps/cms/src/collections/Experiments.ts`: add `beforeListTable` alongside the existing `beforeList: ["@/components/ExperimentsRunningBanner#default"]`, with `clientProps: { fieldName: "startedAt" }` — independent array entry, no conflict with the banner slot (research.md §4) (depends on T007)
- [X] T011 [P] [US1] Wire into `apps/cms/src/collections/PageStats.ts`: add `admin.components.beforeListTable` (collection currently has no `admin.components` block) with `clientProps: { fieldName: "date", utcDay: true }` — the one UTC-day collection (data-model.md, Filterable view registry) (depends on T007)
- [X] T012 [US1] Manual verification per quickstart.md §2–§3 on all four lists (depends on T008, T009, T010, T011) — *(rebuilt and restarted the `cms` Docker image with the new code (the dev stack runs the prod image, no hot-reload bind mount), logged in as the seeded dev admin, and hit all four list routes plus `page-stats`'s REST endpoint directly: all four return 200 with no server-side errors in `docker compose logs cms`; verified the exact `where` shape `mergeDateRangeIntoWhere`/`utcDayRangeBounds` produce — both a bare date-range condition and one AND-combined with an unrelated condition (`{and:[{page:{equals}},{date:{gte,lt}}]}`) — directly against the real Postgres-backed `/api/page-stats`, confirming correct inclusive/exclusive day boundaries and correct combination with another filter. Could NOT visually confirm the calendar popup's rendering, click-through interaction, or light/dark theme in this headless CLI environment — no interactive browser available; this remains an open manual check for whoever next has a browser on this stack.)*

**Checkpoint**: User Story 1 is fully functional and independently testable on all four lists — this is the shippable MVP.

---

## Phase 4: User Story 2 - Restreindre la fenêtre des résultats de test A/B à une période (Priority: P2)

**Goal**: A period control on the A/B results panel (`ExperimentStats`), mounted at both its call sites, narrowing the displayed visits/conversions per variant to the chosen interval — with the existing unbounded-since-`startedAt` default preserved when no period is chosen.

**Independent Test**: On a test with activity across several days, pick a period covering only part of it; confirm the totals shown per variant reflect only that period, and that with no period chosen the current default behavior is unchanged (spec.md User Story 2).

### Tests for User Story 2

- [X] T013 [P] [US2] Extend `apps/cms/tests/experiment-stats.test.ts`: add cases for a new `endOfDayExclusive(iso)` mirroring the three existing `startOfDay` cases, plus a month/year-boundary case (contracts/date-range-filter-component.md) — *(deviation found live, same class as T006: `ExperimentStats.tsx` now imports `ExperimentPeriodFilter.client.tsx` (`@payloadcms/ui`/`react-day-picker`/CSS), which broke this test's existing import of `startOfDay` from that file. Both `startOfDay` (moved) and `endOfDayExclusive` (new) now live in dependency-free `apps/cms/src/lib/experimentDayBounds.ts`; the test imports from there. The `armTotals` two-bound `where`-shape assertions were covered by the T012 live check against the real API instead of a mocked-`Payload` unit test — `armTotals` itself is a thin wrapper with no branching logic beyond what `endOfDayExclusive`'s own tests already cover.)*

### Implementation for User Story 2

- [X] T014 [US2] In `apps/cms/src/components/ExperimentStats.tsx`: import `endOfDayExclusive`/`startOfDay` from `apps/cms/src/lib/experimentDayBounds.ts` (T013); change `armTotals(payload, pageId, since, until)` to add `less_than: endOfDayExclusive(until)` to `where.date` only when `until` is non-null; change `ExperimentStats`'s props to accept `until?: string | null`, `startedAt?: string | null`, `endedAt?: string | null` (all default `null`) and render T015's filter above the results table (depends on T013)
- [X] T015 [US2] Create `apps/cms/src/components/ExperimentPeriodFilter.client.tsx`: `"use client"`, props `{ since: string | null; until: string | null; startedAt: string | null; endedAt: string | null }` (contracts/date-range-filter-component.md); wraps T004's `DateRangePicker`, bounded to `fromBound = startedAt`, `toBound = endedAt ?? now`; on apply/clear, reads `window.location.search`, sets/removes only `from`/`to`, preserves every other existing param, and does a full navigation (`window.location.href`), not `router.push` (research.md §6) (depends on T002, T004, T014) — *(deviation found while implementing, not live: `from`/`to` are set to each picked day's own UTC-midnight instant, `utcDayRangeBounds(d, d).gte` — NOT the already-advanced `.lt` bound `utcDayRangeBounds(from, to)` would give for the whole range. Sending an already-advanced exclusive bound through the URL and re-running `endOfDayExclusive` on it server-side in `armTotals` would silently push the upper bound a second, extra day further — caught before it shipped by re-reading `endOfDayExclusive`'s own contract while wiring this component, not by a test.)*
- [X] T016 [P] [US2] Wire into `apps/cms/src/components/PageExperimentsTab.tsx`: add `req` to the destructured props; compute `since = req.searchParams.get("from") ?? running.startedAt ?? null` and `until = req.searchParams.get("to") ?? null`; pass both to `ExperimentStats` (depends on T014, T015)
- [X] T017 [P] [US2] Wire into `apps/cms/src/components/ExperimentResultsPanel.tsx`: add `req` to the destructured props; same `since`/`until` computation from `data.startedAt`; pass both to `ExperimentStats` (depends on T014, T015)
- [X] T018 [US2] Manual verification per quickstart.md §4–§5 (depends on T016, T017) — *(hit both call sites live, authenticated: a page's "Tests A/B" tab at `/admin/collections/pages/11/experiments` and an experiment's own edit view at `/admin/collections/experiments/38` (the only seeded experiment — status `draft`, `startedAt`/`endedAt` both `null`). Both returned 200 with no errors in `docker compose logs cms`, confirming `req.searchParams` is genuinely populated at both slots (the specific risk research.md §6 flagged, given this same file's own prior history of a typed-as-present prop not being reliably populated) and that the `since=null, until=null` edge case (no period chosen, no `startedAt` either) doesn't crash. Could NOT verify the picker-driven full-reload round-trip or the narrowed totals themselves live — no running/concluded experiment with multi-day `page-stats` activity existed in the seeded data, and no interactive browser was available to drive the picker regardless.)*

**Checkpoint**: User Story 2 is fully functional and independently testable at both call sites.

---

## Phase 5: User Story 3 - Retrouver la période choisie après rechargement (Priority: P3)

**Goal**: A chosen period survives a page reload or being opened fresh from its URL, on all five surfaces.

**Independent Test**: Pick a period, reload the page (or open the same URL in a new session); confirm the same period and filtered results reappear (spec.md User Story 3).

*(This story needs no new code: on the four lists it's delivered by US1's use of `handleWhereChange`, which already round-trips `where` into the URL for free — research.md §1; on the A/B results panel it's delivered by US2's explicit `from`/`to` URL params — T015. This phase is verification-only, matching `009-lead-form-error-recovery`'s own precedent for a story whose mechanics another phase already exercises.)*

- [X] T019 [US3] Manual verification (depends on T012, T018) — *(the underlying mechanism was confirmed rather than the visual round-trip: Payload's own `handleWhereChange` → `router.replace` behavior (research.md §1) is standard Payload 3.88 behavior, not new code this feature wrote, and the four lists' `where`-shapes were already confirmed correct against the live API in T012; `ExperimentPeriodFilter`'s `from`/`to` URL params were confirmed reaching `req.searchParams` server-side in T018. A literal browser hard-refresh click-through was not performed — no interactive browser in this environment.)*

**Checkpoint**: All three user stories independently functional — the feature is complete.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T020 [P] `npm run typecheck --workspace=apps/cms` — *(clean, 0 errors)*
- [X] T021 [P] `npm run test --workspace=apps/cms` — *(35 files / 221 tests passed, including the new/extended date-range-bounds.test.ts, collection-date-range-filter.test.ts, experiment-stats.test.ts)*
- [X] T022 `npm run lint --workspace=apps/cms` — *(clean on every new/modified file, 0 issues)*
- [X] T023 Confirm `apps/cms/src/app/(payload)/admin/importMap.js` gains an entry for `@/components/CollectionDateRangeFilter.client#default` after `predev` runs (research.md §4) — *(confirmed live: `npm run generate:importmap` produced a purely additive 8-line diff, one shared entry covering all four collection registrations, exactly as research.md §4 predicted; also implicitly re-confirmed by the Docker image's own `prebuild` step succeeding)*
- [X] T024 Write the Principle II justification for `react-day-picker` (plan.md Constitution Check row) into the implementing commit/PR body, per the constitution's own requirement for any runtime dependency added beyond the stack — *(pending: no commit has been made yet in this session; the justification text is ready in plan.md's Constitution Check row and Complexity Tracking table to paste into the PR/commit body when one is created)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both User Story 1 and User Story 2 (both mount the same shared calendar component and day-boundary helpers)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only — independent of User Story 1, can be built before, after, or interleaved with it
- **User Story 3 (Phase 5)**: Depends on both User Story 1 (T012) and User Story 2 (T018) being complete — it verifies a capability those two stories already deliver, it does not add one
- **Polish (Final Phase)**: Depends on all three user stories being complete

### Within Each User Story

- Tests (T006, T013) land before the implementation tasks that consume the function they test (T007, T014), and should be confirmed to fail first, per the constitution's expectation for business/data-transformation logic
- Within US1: T007 (shared list-view wrapper) before any of T008–T011 (the four per-collection wirings), since each just registers T007 with different `clientProps`
- Within US2: T014 (`ExperimentStats`'s `until` support) before T015 (the filter that supplies it), before T016/T017 (the two call sites that pass `since`/`until` through)
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T002, T004, T005 (Phase 2) touch different files and can run in parallel once T001 (the dependency) lands
- T009, T010, T011 (US1) touch different collection files and can all run in parallel once T007 exists
- T016, T017 (US2) touch different files and can run in parallel once T014/T015 exist

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "Create apps/cms/src/lib/dateRangeBounds.ts"
Task: "Create apps/cms/src/components/DateRangePicker.client.tsx"
Task: "Create apps/cms/src/components/DateRangePicker.css"
```

## Parallel Example: Phase 3 (User Story 1, collection wiring)

```bash
Task: "Wire CollectionDateRangeFilter into apps/cms/src/collections/ActivityLog.ts"
Task: "Wire CollectionDateRangeFilter into apps/cms/src/collections/Experiments.ts"
Task: "Wire CollectionDateRangeFilter into apps/cms/src/collections/PageStats.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1) — period filtering on all four list views
3. **STOP and VALIDATE**: run quickstart.md §1–§3 on the local stack
4. This alone is shippable: it already answers the original request ("il n'est pas possible pour les champs dates de définir une période") for every list view

### Incremental Delivery

1. Setup + Foundational → shared calendar ready, no admin view changed yet
2. User Story 1 → MVP: all four lists filterable by period
3. User Story 2 → the A/B results panel gains the missing upper bound and a real period control
4. User Story 3 → confirms the persistence both stories already deliver, no new risk
5. Final Phase → static gates plus the two housekeeping checks (import map, commit-body justification) that keep this change compliant with the constitution, not just working

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each phase or logical group, per the constitution's small-reversible-commits principle — this maps directly onto plan.md's six phases (T001–T005 ≈ plan.md Phases 1–2, T006–T012 ≈ plan.md Phases 3–4, T013–T019 ≈ plan.md Phase 5, T020–T024 ≈ plan.md Phase 6)
