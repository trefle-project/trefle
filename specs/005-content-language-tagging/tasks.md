---

description: "Task list for content language tagging"
---

# Tasks: Content language tagging

**Input**: Design documents from `/specs/005-content-language-tagging/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — the constitution requires an automated test for
custom Payload hooks/endpoints and business/domain logic (Principle IV),
matching 004-page-types' precedent.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003/004's established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

## Phase 2: Foundational — `languages` collection + field additions + migration

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every story depends on the schema it lands.

- [X] T002 Create `apps/cms/src/collections/Languages.ts` per data-model.md: `code` (text, required, unique, indexed, `beforeValidate` trims+lowercases like `domains.hostname`, `validate` enforces `^[a-z]{2}$`), `label` (text, required), `isActive` (checkbox, `defaultValue: true`); `admin: { group: "Content", useAsTitle: "label", defaultColumns: ["code", "label", "isActive"] }`; `access` block identical in shape to `apps/cms/src/collections/Domains.ts` (`read: isStaffOrService`, `create`/`update`/`delete: isAdmin`) — no hooks in this task (US1 adds them)
- [X] T003 Register `Languages` in `apps/cms/src/payload.config.ts`'s `collections` array
- [X] T004 [P] In `apps/cms/src/collections/Pages.ts`, add the `language` field to the `fields` array (sidebar-positioned, alongside `pageType`/`status`): `{ name: "language", type: "relationship", relationTo: "languages", required: true, filterOptions: { isActive: { equals: true } }, admin: { position: "sidebar", description: "Required. Determines which language this page's leads are captured under." } }` — per data-model.md/research.md §3, this is `required: true` at every save (not only at publish, unlike `domain`/`path`), no `defaultValue`
- [X] T005 [P] In `apps/cms/src/collections/Domains.ts`, add the `defaultLanguage` field: `{ name: "defaultLanguage", type: "relationship", relationTo: "languages", filterOptions: { isActive: { equals: true } }, admin: { description: "Pre-fills the language of a new page created under this domain." } }` — optional, no `required`
- [X] T006 [P] In `apps/cms/src/collections/Leads.ts`, add the `language` field: `{ name: "language", type: "text", admin: { readOnly: true, description: "The source page's language at the moment this lead was captured; never changes afterward." } }` — a denormalized code copy, not a relationship (research.md §2)
- [X] T007 Run `payload generate:types` in `apps/cms` to regenerate `apps/cms/src/payload-types.ts` with the new collection/fields
- [X] T008 Run `payload migrate:create` in `apps/cms`; hand-edit the generated migration per research.md §5's exact statement sequence, in one file: `CREATE TABLE languages (...)` → `INSERT INTO languages (code, label, is_active) VALUES ('fr','Français',true), ('en','English',true), ('es','Español',true), ('de','Deutsch',true)` → `ALTER TABLE pages ADD COLUMN language_id integer REFERENCES languages(id)` → `UPDATE pages SET language_id = (SELECT id FROM languages WHERE code = 'fr') WHERE language_id IS NULL` → `ALTER TABLE pages ALTER COLUMN language_id SET NOT NULL` → `ALTER TABLE domains ADD COLUMN default_language_id integer REFERENCES languages(id)` (no backfill) → `ALTER TABLE leads ADD COLUMN language text` → `UPDATE leads SET language = COALESCE((SELECT code FROM languages l JOIN pages p ON p.language_id = l.id WHERE p.id = leads.page_id), 'fr') WHERE language IS NULL` → `ALTER TABLE leads ALTER COLUMN language SET NOT NULL`; `down()` drops all four (leads.language, domains.default_language_id, pages.language_id, then the `languages` table) in reverse
- [X] T009 Apply the migration against the local dev database (`payload migrate`); via the REST API confirm: `GET /api/languages` returns exactly the 4 seed rows from T008; spot-check at least 2 pre-existing pages — `language` resolves to the `fr` document and every other field is byte-for-byte unchanged (SC-005's first proof point); spot-check at least 1 pre-existing lead — `language: "fr"` and every other field unchanged
- [X] T010 `apps/cms` typecheck passes with the new collection/fields/regenerated types

**Checkpoint**: Foundation ready — every user story below can now build on a real `languages` collection, a required `pages.language`, an optional `domains.defaultLanguage`, and a `leads.language` copy field.

---

## Phase 3: User Story 1 - Maintain the list of supported languages (Priority: P1) 🎯 MVP

**Goal**: An administrator can add, relabel, and retire languages without a deployment, and the system protects two invariants along the way: no duplicate codes, and at least one active language always remains.

**Independent Test**: Create, edit, and deactivate a language entry in the admin; confirm each change takes effect immediately and the two guard rules reject the disallowed attempts — independent of every other story.

### Tests for User Story 1

- [X] T011 [P] [US1] ~~Create `apps/cms/tests/languages-lifecycle.test.ts`: creating a language with a `code` that already exists (case/whitespace-insensitive) is rejected~~ — **deviation**: duplicate-`code` rejection is Payload's own `unique: true` field option, not custom hook logic; there is no hook code path a mocked `req.payload` can exercise for it, and this repo has no DB-backed integration-test harness (every existing test mocks `req.payload`). Verified live instead, against the real local stack (T016) — see completion notes.

### Implementation for User Story 1

- [X] T012 [US1] Create `apps/cms/src/hooks/languages-lifecycle.ts`, exporting `preventLastActiveDeactivation` (`CollectionBeforeChangeHook`): when `data.isActive === false` and `originalDoc?.isActive === true`, count other `isActive: true` languages (`req.payload.find`, `where: { and: [{ isActive: { equals: true } }, { id: { not_equals: originalDoc.id } }] }`); if the count is 0, `throw new APIError("Cannot deactivate: at least one active language must remain.", 400, undefined, true)` (FR-004a)
- [X] T013 [US1] Same file: export `preventDeleteIfReferenced` (`CollectionBeforeDeleteHook`) — `find` on `pages` where `language` equals the deleted id (`limit: 5, depth: 0, overrideAccess: true`) and on `domains` where `defaultLanguage` equals it; if either has matches, `throw new APIError` naming the referencing page/domain titles — same pattern as `apps/cms/src/hooks/pages-confirmation-guard.ts`'s `confirmationGuardOnDelete` (research.md §6); `leads.language` is deliberately not checked (it's a text copy, not a live reference)
- [X] T014 [US1] Wire both hooks into `apps/cms/src/collections/Languages.ts`'s `hooks: { beforeChange: [preventLastActiveDeactivation], beforeDelete: [preventDeleteIfReferenced] }`
- [X] T015 [P] [US1] Extend `apps/cms/tests/languages-lifecycle.test.ts` (started in T011): deactivating a language while another stays active succeeds; deactivating the last remaining active language is rejected with the FR-004a message; deleting a language referenced by a page's `language` is rejected, naming that page; deleting a language referenced by a domain's `defaultLanguage` is rejected, naming that domain; deleting an unreferenced language succeeds; deleting a language that only a lead's (text) `language` copy still names succeeds (proves the delete guard doesn't check `leads`)
- [X] T016 [US1] Manual verification per quickstart.md §2 on the local stack

**Checkpoint**: At this point, the `languages` registry is fully functional and testable independently — every subsequent story just needs it to already work.

---

## Phase 4: User Story 2 - Tag every page with a language (Priority: P1)

**Goal**: Every page — new or pre-existing — has exactly one explicit, required language; nothing can be saved without one when there's no domain default to fall back on.

**Independent Test**: Create a page, confirm the save is blocked with no language and no domain default; confirm a pre-existing (pre-migration) page already carries `fr`.

### Tests for User Story 2

- [X] T017 [P] [US2] ~~Create `apps/cms/tests/pages-language.test.ts`~~ — **deviation**, same reasoning as T011: `required: true` is native Payload field validation, not custom hook logic, and `lead-intake.test.ts`'s mocked-`req.payload` style has no path to exercise it (there is no DB-backed vitest harness in this repo to write a real integration test against instead). Verified live against the real local stack as part of T018: creating a page with no `domain` and no `language` is rejected (`ValidationError`); creating one with only `language` set (no `domain`/`path`) succeeds.

### Implementation for User Story 2

*(The `language` field itself, its `required: true` enforcement, and the migration backfill to `fr` were delivered in Phase 2 — T004, T008, T009. This story's remaining work is verifying those acceptance scenarios explicitly and end to end; the domain-default pre-fill UX that removes the friction of an explicit pick is User Story 4's independent deliverable.)*

- [X] T018 [US2] Manual verification per quickstart.md §3, steps 1-2 on the local stack: creating a page under a domain with no default language and saving with no language chosen is blocked; picking a language and saving succeeds
- [X] T019 [US2] Manual/REST re-verification that every page that existed before this feature shipped has `language: "fr"` and no other field changed (re-confirms T009 from this story's own acceptance-scenario angle, SC-001/SC-005)

**Checkpoint**: Every page, old and new, is guaranteed to carry an explicit language.

---

## Phase 5: User Story 3 - Stamp every captured lead with its language (Priority: P1)

**Goal**: A lead created by a form submission automatically carries the language of the page it came from, frozen from that moment on.

**Independent Test**: Submit a lead form on a page tagged a given language; confirm the resulting lead record carries that exact language, unprompted; confirm it stays unchanged after the source page's language is later edited or the page is deleted.

### Tests for User Story 3

- [X] T020 [P] [US3] Extend `apps/cms/tests/lead-intake.test.ts`: a submission on a page tagged `en` produces a lead with `language: "en"`; added a second case covering the defensive `"fr"` fallback when `page.language` isn't a resolved object

### Implementation for User Story 3

- [X] T021 [US3] In `apps/cms/src/endpoints/leadIntake.ts`, add `language: typeof page.language === "object" ? page.language.code : undefined` to the `payload.create({ collection: "leads", data: {...} })` call — `page` is already fetched at `depth: 1`, resolving `page.language` to the full `languages` document (contracts/lead-language-capture.md)
- [X] T022 [P] [US3] ~~Extend `apps/cms/tests/lead-intake.test.ts`: change the source page's language / delete it, re-fetch the lead~~ — **deviation**, same reasoning as T011/T017: this is an absence-of-a-write-path guarantee (nothing anywhere ever writes `leads.language` again after creation), not a computation `leadIntakeEndpoint`'s own mocked test can exercise. Verified live instead, as part of T023.
- [X] T023 [US3] Manual verification per quickstart.md §4 on the local stack — also confirmed the newly-added page/lead delete-guard (separate fix, see completion notes) blocks deletion while a lead exists and allows it once none do

**Checkpoint**: Every lead captured from here on carries a frozen, accurate language — the reason this whole feature exists.

---

## Phase 6: User Story 4 - Give a domain a default language (Priority: P2)

**Goal**: Picking a domain with a default language in the page-creation wizard pre-fills that language, so single-market domains don't need a manual pick every time.

**Independent Test**: Set a domain's `defaultLanguage`, start the creation wizard, pick that domain — confirm the wizard's language select is pre-filled (still changeable) — independent of every other story except needing a language and a domain to point at (both already exist from Phase 2).

### Implementation for User Story 4

- [X] T024 [US4] In `apps/cms/src/components/pageWizardStash.ts`: add `language?: string` to the `PageWizardStash` interface; extend `stashToFieldUpdates` to push `{ path: "language", value: languageValue }` when `stash.language` is set, coercing a digit-only string id to a number exactly like the existing `stash.domain` handling (same numeric-id gotcha this file already documents for `domain`)
- [X] T025 [US4] In `apps/cms/src/components/PageCreateWizard.tsx`: fetch active languages (`GET /api/languages?where[isActive][equals]=true&limit=50&depth=0&sort=code`, same pattern as the existing `domains` fetch); add a `language` `<select>` populated from the result; extend the existing `domains` fetch/state so each domain's `defaultLanguage` id is available; when `domain` changes, if the newly chosen domain has a `defaultLanguage` **and** the editor has not already picked a `language` by hand, set `language` to it (never overwrite an explicit editor choice — same "don't clobber real input" discipline as `pages-starter-template.ts`'s existing default-application guard); include `language` in the object written to `sessionStorage` on submit
- [X] T026 [P] [US4] Extend `apps/cms/tests/page-wizard-bootstrap.test.ts`: `stashToFieldUpdates` includes a `{ path: "language", value }` entry when the stash carries a `language`, and omits it when the stash doesn't
- [X] T027 [US4] Manual verification per quickstart.md §3, step 3 on the local stack, in a real browser: set a domain's default language, start the wizard, pick that domain, confirm the language select is pre-filled but still changeable before continuing

**Checkpoint**: Single-market domains no longer need a manual language pick on every new page.

---

## Phase 7: User Story 5 - Filter and export leads by language (Priority: P2)

**Goal**: Staff can see and filter leads by language in the admin list and in the CSV export, without cross-referencing each lead's page by hand.

**Independent Test**: Filter the existing leads list by a language value, confirm only matching leads appear; export to CSV, confirm the language column is present — independent of every other story except needing leads that already carry a language (Phase 2/US3 backfill).

### Tests for User Story 5

- [X] T028 [P] [US5] Extend `apps/cms/tests/leads-export.test.ts`: the exported CSV's header row includes `language`; a lead's row includes its `language` value in the matching column position

### Implementation for User Story 5

- [X] T029 [US5] In `apps/cms/src/collections/Leads.ts`, add `"language"` to `admin.defaultColumns` (after `page`, alongside `consentStatus`)
- [X] T030 [US5] In `apps/cms/src/endpoints/leadsExport.ts`, add `"language"` to the `HEADERS` array and `d.language` to the per-row `csvRow([...])` call, in matching position
- [X] T031 [US5] Manual verification per quickstart.md §5 on the local stack: filter the Leads admin list by language; use "Export CSV" and open the file to confirm the column

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T032 Run `npm run lint` and `npm run typecheck` for `apps/cms`; fix any fallout from T002–T031
- [X] T033 Run `apps/cms`'s test suite and confirm every new/extended test from T011, T015, T017, T020, T022, T026, T028 passes alongside the full existing suite (nothing from 001/002/003/004 regressed)
- [X] T034 Confirm `apps/web` needed zero changes (FR-012): `PublishedPage` (`apps/web/src/lib/payload-client/index.ts`) and everything `page-shell.tsx`/`[[...slug]]/page.tsx`/the `/confirmation` route read still don't reference `language` anywhere
- [X] T035 Walk `quickstart.md` end to end (§1-§6) on the local stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body"; confirm SC-005 by re-checking pre-existing pages and leads still render/edit/export exactly as before, aside from the new `language` value

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story (the `languages` collection and the three field additions are the shared prerequisite)
- **User Stories (Phase 3-7)**: All depend on Foundational. Among themselves:
  - US1 (Phase 3) has no dependency on the others — the `languages` collection alone is enough
  - US2 (Phase 4) has no dependency on US1, US3, US4, or US5
  - US3 (Phase 5) has no dependency on US1, US2, US4, or US5 (it only needs `pages.language` from Phase 2)
  - US4 (Phase 6) has no hard dependency, but its manual verification (T027) is most legible once US2's block-on-save behavior (T018) is already confirmed
  - US5 (Phase 7) is most meaningfully verified once US3 (Phase 5) has produced at least one language-tagged lead to filter/export — implement in this order, though the code changes themselves (T029/T030) don't literally require it
- **Polish (Phase 8)**: Depends on all five stories being complete

### Within Each User Story

- Tests are written alongside (US1, US3, US4, US5) or just before (US2) their implementation task, per the constitution's "test-first is NOT required" — order shown above is suggested, not mandated
- A story's Implementation tasks before its own manual-verification task

### Parallel Opportunities

- T004, T005, T006 (the three field additions, Phase 2) — different files, all [P]
- T011 (Phase 3) can start as soon as T002/T014's collection shape is settled, in parallel with T012/T013's hook-writing
- T015, once T012-T014 land, is [P] with nothing else in Phase 3
- Once Phase 2 completes: US1 (Phase 3), US2 (Phase 4), and US3 (Phase 5) can all proceed in parallel (different files); US4 (Phase 6) and US5 (Phase 7) likewise don't share files with any of the P1 stories

---

## Parallel Example: after Phase 2

```bash
# Once Foundational (Phase 2) is done, these can run together:
Task: "Create apps/cms/src/hooks/languages-lifecycle.ts (US1, T012-T013)"
Task: "Create apps/cms/tests/pages-language.test.ts (US2, T017)"
Task: "Extend apps/cms/src/endpoints/leadIntake.ts (US3, T021)"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3, all P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 (language registry + guards)
4. Complete Phase 4: User Story 2 (every page explicitly tagged)
5. Complete Phase 5: User Story 3 (every lead stamped) — this is the feature's actual reason for existing
6. **STOP and VALIDATE**: quickstart.md §1-§4 end to end
7. Deploy/demo if ready — the original ask ("tag pages, propagate to leads") is fully delivered here

### Incremental Delivery

1. Setup + Foundational → schema ready
2. US1 → language registry usable on its own
3. US2 → pages provably always tagged (MVP milestone alongside US1+US3)
4. US3 → leads provably always tagged (**MVP complete**)
5. US4 → less friction creating pages under single-market domains
6. US5 → staff can actually use the captured data day to day
7. Polish → full-suite confidence + PR verification record

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature is deliberately the *foundation* for a later, separately-specified confirmation-email feature (spec.md Context/Assumptions) — nothing here sends or renders anything language-specific; it only tags and propagates
- Commit after each task or logical group; each of the 8 phases above is a natural commit boundary, matching 004-page-types' one-phase-per-commit precedent
