---

description: "Task list for feature implementation"
---

# Tasks: Page types (subscription / free / confirmation)

**Input**: Design documents from `specs/004-page-types/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included per the project constitution (Principle IV — custom
Payload hooks/endpoints, access-control-adjacent logic, and data
transformations MUST have an automated test). UI-only pieces of User Story 4
(the wizard screen, the bootstrap component) are Payload custom admin
components with no practical unit-test harness in this codebase (matches
how 003-post-launch-improvements' GrapesJS `Editor.client.tsx` was verified
live rather than unit-tested) — covered by extracting their non-UI logic
into small pure functions that ARE unit tested, plus the live quickstart.md
walkthrough.

**Organization**: Tasks are grouped by user story from spec.md, in the order
plan.md's phasing already established.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 map to spec.md's four user stories, in priority order
- Exact file paths are included in every task

---

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003-post-launch-improvements' established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

**Checkpoint**: nothing else to set up — no new dependency, no new secret.

---

## Phase 2: Foundational — `pageType` field + migration

**Purpose**: Every user story reads or writes `pageType`; nothing below can
be built or tested until it exists on the collection and in the database.

- [X] T002 In `apps/cms/src/collections/Pages.ts`, add the `pageType` field to the `fields` array (sidebar-positioned, alongside `status`/`confirmationPage`): `{ name: "pageType", type: "select", required: true, defaultValue: "subscription", options: ["subscription", "free", "confirmation"], admin: { position: "sidebar", description: "Internal — never shown publicly. Determines publish requirements and the starter template." } }` — per data-model.md, this is a required select field with exactly these three options and this default
- [X] T003 Run `payload generate:types` in `apps/cms` to regenerate `apps/cms/src/payload-types.ts` with the new field
- [X] T004 Run `payload migrate:create` in `apps/cms`; hand-edit the generated migration file to do the column add in three statements in one file (data-model.md's exact SQL): `ALTER TABLE "pages" ADD COLUMN "page_type" text;` then `UPDATE "pages" SET "page_type" = 'subscription' WHERE "page_type" IS NULL;` then `ALTER TABLE "pages" ALTER COLUMN "page_type" SET NOT NULL;` — `down()` drops the column, matching this repo's existing convention for column-drop downs
- [X] T005 Apply the migration against the local dev database (`payload migrate`); via the REST API, spot-check at least 2 pre-existing pages — confirm `pageType: "subscription"` and every other field byte-for-byte unchanged (SC-005's first proof point)
- [X] T006 `apps/cms` typecheck passes with the new field/regenerated types

**Checkpoint**: `pageType` exists, every existing page has it, nothing else changed yet — publish behaviour is still today's (uniform) rule set until Phase 3.

---

## Phase 3: User Story 1 - Publish a content page with no lead-generation form (Priority: P1) 🎯 MVP

**Goal**: A `free`-type page with no lead-form block publishes; one with a
lead-form block is rejected; no form-configuration is required for `free`.

**Independent Test**: create a page, type `free`, no lead-form block,
publish — succeeds. Add a lead-form block, try to publish — rejected.

- [X] T007 [US1] In `apps/cms/src/hooks/pages-publish-guard.ts`, read `pageType` from `data?.pageType ?? originalDoc?.pageType`. Branch the existing `leadForms` check: `pageType === "subscription"` keeps today's `leadForms !== 1` problem (unchanged wording); `pageType === "free"` or `"confirmation"` instead checks `leadForms !== 0`, pushing `` `the page must not contain a lead-form block (found ${leadForms})` `` when violated
- [X] T008 [US1] In the same file, skip the email-field / form-setting checks (the `emailFields.length !== 1`, `fields.some(...)`, and the `successMessage`/`consentPurposeText`/`privacyNoticeUrl`/`privacyNoticeVersion` loop) entirely unless `pageType === "subscription"` — per FR-007, `free` has no form-configuration requirements
- [X] T009 [P] [US1] Extend `apps/cms/tests/pages-publish-guard.test.ts`: a `free` page with 0 lead-form blocks and no form config publishes; a `free` page with 1 lead-form block is rejected with a message matching `/must not contain a lead-form block/`; every existing (subscription-implicit) test case in this file still passes **verbatim, unmodified** — proves T007/T008 didn't change `subscription` behaviour
- [X] T010 [US1] Manual verification per quickstart.md §2 on the local stack: create a `free` page via the admin/REST with no lead-form block, publish — succeeds; add a lead-form block, try to publish — rejected with the expected message

**Checkpoint**: `free` pages work end to end; `subscription` pages are provably unchanged.

---

## Phase 4: User Story 2 - A confirmation page always carries the unsubscribe link and is never itself a submission target (Priority: P1)

**Goal**: A `confirmation`-type page must contain the unsubscribe-link
placeholder and must not contain a lead-form block to publish.

**Independent Test**: create a page, type `confirmation`, with the
placeholder and no lead-form block, publish — succeeds. Remove the
placeholder — rejected. Add a lead-form block back — rejected.

- [X] T011 [US2] In `apps/cms/src/hooks/pages-publish-guard.ts` (same file as T007, applied after it — depends on T007/T008), add a `confirmation`-only check: if `pageType === "confirmation"` and `!builder.html?.includes("{{unsubscribeUrl}}")`, push `"the confirmation page must include the unsubscribe-link placeholder"`. (The lead-form-forbidden rule for `confirmation` is already covered by T007's shared `free`/`confirmation` branch — no separate edit needed for that half.)
- [X] T012 [P] [US2] Extend `apps/cms/tests/pages-publish-guard.test.ts`: a `confirmation` page with the placeholder and 0 lead-form blocks publishes; one missing the placeholder is rejected with a message matching `/unsubscribe-link placeholder/`; one with a lead-form block (placeholder present) is rejected with the shared lead-form message from T007
- [X] T013 [US2] Manual verification per quickstart.md §3 on the local stack: all three confirmation scenarios (publishes / rejected missing placeholder / rejected with lead-form)

**Checkpoint**: all three types' publish rules are complete and independently verified (contracts/publish-guard-by-type.md's full matrix now holds).

---

## Phase 5: User Story 3 - New pages start from a template matching their type (Priority: P2)

**Goal**: Creating a page (however it reaches the document — REST, or the
standard admin form) initialises `builder.projectData`/`html`/`css` from a
starter matching `pageType`, not blank; every starter satisfies its own
type's publish rules unedited.

**Independent Test**: create a page of each type with no builder content
given; confirm the type-matched starter comes back; publish each unedited.

- [X] T014 [US3] Create `apps/cms/src/fields/grapesjs/starterTemplates.ts` exporting `STARTER_TEMPLATES: Record<"subscription" | "free" | "confirmation", { id: string; label: string; projectData: object; html: string; css: string }[]>`, each type with exactly one entry today, built from `GJS_BLOCKS` (`apps/cms/src/fields/grapesjs/blocks.ts`) — `subscription`: hero + lead-form block (move the existing `STARTER_PROJECT_DATA`/`STARTER_HTML`/`STARTER_CSS` constants here verbatim from `field.ts`, don't reinvent them); `free`: hero/text block only, no lead-form block; `confirmation`: a short "merci" message whose text includes the literal `{{unsubscribeUrl}}` placeholder, no lead-form block
- [X] T015 [US3] In `apps/cms/src/fields/grapesjs/field.ts`, import `STARTER_TEMPLATES` from the new module and point `projectData`/`html`/`css`'s `defaultValue` functions at `STARTER_TEMPLATES.subscription[0]`'s `projectData`/`html`/`css` respectively; delete the now-duplicated local `STARTER_PROJECT_DATA`/`STARTER_HTML`/`STARTER_CSS`/`heroBlock`/`leadFormBlock` constants — depends on T014
- [X] T016 [US3] Create `apps/cms/src/hooks/pages-starter-template.ts`, exporting the `beforeValidate` collection hook as `applyStarterTemplate` (this exact name — T017 wires it in under it): `if (operation !== "create") return data;` then, only if `data.builder`'s `projectData`/`html`/`css` are still empty or still exactly equal to `STARTER_TEMPLATES.subscription[0]`'s content (i.e. untouched since the field default), overwrite `data.builder = { projectData, html, css }` from `STARTER_TEMPLATES[data.pageType ?? "subscription"][0]` — depends on T014
- [X] T017 [US3] In `apps/cms/src/collections/Pages.ts`, add the new hook to `hooks.beforeValidate`, positioned **before** `recomputeBlockCount` (`beforeValidate: [applyStarterTemplate, recomputeBlockCount, rejectInlineImages]`) — depends on T016
- [X] T018 [P] [US3] Create `apps/cms/tests/pages-starter-template.test.ts`: for each of the three types, `STARTER_TEMPLATES[type][0].projectData` run through `countBlocks()` (from `@trefle/shared`) satisfies that type's Phase 3/4 publish rule (subscription: `leadForm === 1`; free/confirmation: `leadForm === 0`, and confirmation's `html` contains `{{unsubscribeUrl}}`); the hook leaves `data.builder` untouched when it's already been customised away from the default (mock `operation: "create"` with a non-default `projectData` and assert no overwrite)
- [X] T019 [US3] Manual verification per quickstart.md §5 (REST half only — the admin-canvas half is User Story 4's concern once the wizard exists): create via REST with no `builder` for each type, confirm the right starter + `blockCount` comes back; publish each unedited — succeeds

**Checkpoint**: every type has a real, publishable starter; `apps/cms` suite green.

---

## Phase 6: User Story 4 - A guided creation flow avoids wasted work and a lagging preview (Priority: P2)

**Goal**: Creating a page through the admin's normal entry point is guided
through type/template/domain/path/title up front, with an early
domain+path conflict check, landing in a block editor that already shows
the right starter on first paint.

**Independent Test**: click "Create New" — land on the guided step, not a
blank form. Enter a colliding domain+path — blocked. Complete the step —
the block editor already shows the chosen type's starter.

- [X] T020 [US4] Create `apps/cms/src/endpoints/pageConflictCheck.ts`: `GET /pages/conflict-check`, admin/editor-only (reuse `apps/cms/src/access`'s active-human check, matching `pagePreview.ts`'s `isServiceCaller` inline-guard pattern but for staff instead of the service key), reads `domain`/`path` query params, `req.payload.find({ collection: "pages", where: { and: [{ domain: { equals } }, { path: { equals } }] }, limit: 1, depth: 0, overrideAccess: true })` — **no `status` filter**, unlike `pages-publish-guard.ts`'s own clash query (contracts/page-conflict-check.md: deliberately draft-or-published) — responds `{ conflict: false }` or `{ conflict: true, pageId, pageTitle }`
- [X] T021 [US4] Register the endpoint in `apps/cms/src/payload.config.ts`'s `endpoints` array (alongside `pagePreviewEndpoint`, `leadIntakeEndpoint`, etc.)
- [X] T022 [P] [US4] Create `apps/cms/tests/page-conflict-check.test.ts`: conflict detected against another draft page; against another published page; no conflict when the path matches but the domain differs; no conflict when nothing matches; a non-staff/unauthenticated caller gets 403
- [X] T023 [US4] Create `apps/cms/src/fields/grapesjs/starterTemplateOptions.ts` (or extend `starterTemplates.ts`) exporting a small pure helper, `templatesFor(pageType): {id, label}[]`, reading `STARTER_TEMPLATES` — used by both the wizard's template `<select>` and (indirectly, for future reuse) anything else that needs to list templates without pulling in full block content — depends on T014
- [X] T024 [US4] Create `apps/cms/src/components/PageCreateWizard.tsx` (client component) registered as a custom admin view via `admin.components.views` on `Pages.ts` (per research.md §8, a route nested under the collection's admin path, e.g. `/collections/pages/wizard`): a form with `pageType` select (3 options, `templatesFor` populating the template select per the chosen type), `domain` select (fetched from `/api/domains`, optional), `path` text input (enabled once a domain is chosen; same leading-slash normalisation as `Pages.ts`'s own `path` field), `title` text input, and a submit action
- [X] T025 [US4] In `PageCreateWizard.tsx`'s submit handler: if both domain and path are set, call `pageConflictCheck` (T020/T021) first — on `conflict: true`, show an inline error naming `pageTitle` and do not proceed; otherwise (or if domain/path are blank), write `{ pageType, templateId, domain, path, title }` to `sessionStorage` under one fixed key and navigate to `/admin/collections/pages/create` — depends on T021, T024
- [X] T026 [US4] Create `apps/cms/src/components/PageWizardBootstrap.tsx` (client component): on mount, read the sessionStorage key from T025; if present, use `useForm`/`useField` (the same hooks `Editor.client.tsx` already relies on) to set `title`, `pageType`, `domain`, `path`, and `builder.projectData`/`html`/`css` (from `STARTER_TEMPLATES` keyed by the stashed `templateId`), then clear the key; if **absent** and this is a fresh create view (no document `id` in the route), redirect (`router.replace`) to the wizard view from T024 — depends on T014, T024
- [X] T027 [US4] In `apps/cms/src/collections/Pages.ts`, add `PageWizardBootstrap` to the existing `admin.components.edit.beforeDocumentControls` array, alongside `RevalidationStatus` — depends on T026
- [X] T028 [P] [US4] Extract **both** pure decisions out of `PageWizardBootstrap.tsx` and unit test them in a new `apps/cms/tests/page-wizard-bootstrap.test.ts`: (a) `stashToFieldUpdates(stash): {path, value}[]` — which fields/values to set from a stash; (b) `shouldRedirectToWizard({ hasStash, hasDocId }): boolean` — the FR-017 redirect decision (`true` iff `!hasStash && !hasDocId`). FR-017 is a MUST requirement, not exempt from a test just for living inside a UI component — cover its actual decision logic here, not only via the live walkthrough in T029. The surrounding React/`useForm`/routing wiring itself has no practical unit-test harness in this codebase (matching how `Editor.client.tsx` has always been verified) and stays covered by T029
- [X] T029 [US4] Manual verification per quickstart.md §7 on the local stack, in a real browser: "Create New" lands on the wizard; a colliding domain+path is blocked inline; a non-conflicting completion (and a blank-domain completion) lands in the block editor already showing the chosen type's starter with **no save performed yet** (proves SC-008); navigating directly to `/admin/collections/pages/create` redirects to the wizard first (proves FR-017)

**Checkpoint**: the guided flow is the normal way to create a page; the server-side fallback from Phase 5 remains as a safety net underneath it.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 Run `npm run lint` and `npm run typecheck` for `apps/cms`; fix any fallout from T002–T029
- [X] T031 Run `apps/cms`'s test suite and confirm every new/extended test from T009, T012, T018, T022, T028 passes alongside the full existing suite (nothing from 001/003 regressed)
- [X] T032 [P] In `apps/web`, add a regression test asserting that a `PublishedPage`-shaped fixture carrying an extraneous `pageType` property (cast in, since the real type never declares it) never causes the literal string `"pageType"` to appear in `PageShell`'s rendered output. **Not** `apps/web/tests/render.test.ts` — that file only tests the pure `sanitizeHtml`/`splitAroundForm` functions and never renders `<PageShell>`; follow `apps/web/tests/confirmation-page.test.tsx`'s `renderToStaticMarkup(<PageShell .../>)` pattern instead, in a new `apps/web/tests/page-shell.test.tsx` (or extend that pattern in place if a page-shell-rendering test already exists by the time this task runs). Locks in FR-002/SC-006 per plan.md's Phase 5 risk note — note this test is a forward-looking regression guard (it trivially passes today since `PageShell` never reads `.pageType` at all), not a deep verification
- [X] T033 Confirm `apps/web` needed zero other changes: `PublishedPage` (`apps/web/src/lib/payload-client/index.ts`) and everything `page-shell.tsx`/`[[...slug]]/page.tsx`/the `/confirmation` route read still don't reference `pageType` anywhere
- [X] T034 Walk `quickstart.md` end to end (§1–§7) on the local stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body"; confirm SC-005 by re-checking pre-existing pages still render/edit/republish exactly as before

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: no hard dependency on Phase 1, but do it right after — every later phase needs `pageType` to exist
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Phase 2; they edit the same file (`pages-publish-guard.ts`) in sequence (T011 depends on T007/T008) — not parallelisable with each other, but neither depends on US3/US4
- **US3 (Phase 5)**: depends on Phase 2 (needs `pageType`); its own tests (T018) assert against the full per-type publish matrix, so build it after US1+US2 even though the files it touches (`starterTemplates.ts`, `field.ts`, `pages-starter-template.ts`) are otherwise independent of `pages-publish-guard.ts`
- **US4 (Phase 6)**: depends on US3 (imports `STARTER_TEMPLATES` directly, T024/T026) and benefits from US1+US2 being complete for its own end-to-end verification (T029 publishes pages during the walkthrough)
- **Polish (Phase 7)**: depends on every phase above

### Within Each User Story

- US1: T007 → T008 (same file, same hook, sequential) → T009 (tests) → T010 (manual)
- US2: T011 depends on T007/T008 (same file) → T012 (tests) → T013 (manual)
- US3: T014 → T015 (field.ts imports it) and T014 → T016 (hook imports it); T016 → T017 (wiring); T018 depends on T014/T016; T019 depends on T015/T017
- US4: T020 → T021 (register the endpoint); T014 → T023 (helper reads the registry); T021+T024 → T025 (submit handler calls both); T014+T024 → T026 (bootstrap reads the registry and needs the wizard route to redirect to); T026 → T027 (wiring); T026 → T028 (extracted from it); everything → T029 (full live walkthrough)

### Parallel Opportunities

- T009, T012, T018, T022, T028 (all `[P]`) can run in parallel with each other once their respective implementation tasks land — they're all distinct test files
- US1 (Phase 3) and US2 (Phase 4) share one file and are not parallelisable with each other by design (both edit `pages-publish-guard.ts`), but a second contributor could start US3's template registry (T014) in parallel with US1/US2, since `starterTemplates.ts` doesn't touch `pages-publish-guard.ts` at all — just note T018/T019 (US3's tests/verification) still wait on US1/US2 landing first per the dependency above

---

## Parallel Example: after Phase 2

```bash
# US1 and the start of US3 can proceed in parallel (different files):
Task: "Per-type lead-form branch — apps/cms/src/hooks/pages-publish-guard.ts (T007-T009)"
Task: "Starter-template registry — apps/cms/src/fields/grapesjs/starterTemplates.ts (T014)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`pageType` field + migration)
3. Complete Phase 3: User Story 1 — `free` pages work
4. **STOP and VALIDATE**: quickstart.md §1–§2
5. This alone already fixes the original problem (a confirmation page forced to carry a form it'll never use) enough to unblock 003's known limitation for the `free` case; US2 completes the fix for `confirmation`.

### Incremental Delivery

1. Setup + Foundational → ready
2. US1 (P1, `free`) → validate → ship
3. US2 (P1, `confirmation`) → validate → ship — the original problem from 003 is now fully resolved
4. US3 (P2, starter templates) → validate → ship
5. US4 (P2, guided creation flow) → validate → ship — the smoothest, most complete experience, but Phases 3–5 are already a complete, useful feature without it

### Parallel Team Strategy

With more than one contributor: complete Setup + Foundational together;
one contributor can take US1+US2 (same file, keep it one person to avoid
merge conflicts) while another starts US3's template registry (T014,
independent of `pages-publish-guard.ts`) — US3's own tests/verification
still wait on US1+US2 landing; US4 waits on US3.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Every hook/endpoint task above carries a regression test per the
  constitution — the wizard's UI-only pieces are the one exception, covered
  instead by an extracted pure-function unit test (T028) plus the live
  walkthrough (T029), consistent with how 003 handled `Editor.client.tsx`
- Commit after each task or logical group, one commit per plan.md phase
  where the phase maps 1:1 to a task cluster above
- Stop at any user-story checkpoint to validate independently before moving on
- A bulk tool to reclassify many existing pages is explicitly out of scope
  (spec.md) — do not add one under T002 or anywhere else
