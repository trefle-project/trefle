# Implementation Plan: Page types (subscription / free / confirmation)

**Branch**: `004-page-types` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-page-types/spec.md`

## Summary

Add an internal `pageType` field (`subscription` / `free` / `confirmation`)
to `pages`, extend `pages-publish-guard.ts`'s existing single rule set into a
per-type rule matrix (only `subscription` requires/allows a lead-form block;
`free`/`confirmation` forbid one; `confirmation` additionally requires the
unsubscribe-link placeholder), give each type its own starter template, and
backfill every existing page to `subscription`. No new collection, no
renderer-visible change, no change to routing or to how `confirmationPage`
selection works.

Also: a guided, 2-step creation flow (User Story 4) — type/template/
domain/path/title collected up front, with an early domain+path conflict
check — so a new page's block editor shows the right starter from its very
first paint, and reaching the standard create form always passes through
this guided step first.

## Technical Context

**Language/Version**: TypeScript, Node 24. Payload 3.88 + Next 16 (`apps/cms`).
This feature touches `apps/cms` only — `apps/web` needs no change (FR-002:
`pageType` never reaches the renderer's read surface).

**Primary Dependencies**: Payload CMS, `@trefle/shared`'s `countBlocks`
(already used by `recomputeBlockCount`), Payload's own custom-admin-view
mechanism for the creation wizard. No new npm dependency; the wizard uses
the browser's `sessionStorage` (see Constitution Check for why).

**Storage**: PostgreSQL 16. One new required column on `pages`
(`page_type`), added expand→backfill→contract in one migration (nullable →
`UPDATE` existing rows to `subscription` → `NOT NULL`), per constitution
Principle III.

**Testing**: Vitest (unit, mocked `req.payload`) for the hook logic —
matches `pages-publish-guard.test.ts`'s existing style. Live verification on
the local stack (REST + real GrapesJS admin canvas), matching how
003-post-launch-improvements' starter template and publish-guard work were
actually verified.

**Target Platform**: Same Debian VPS / Docker Compose stack; no
infra/deploy change.

**Project Type**: Existing multi-app monorepo; this feature stays entirely
inside `apps/cms`.

**Constraints**: Every page created before this feature keeps publishing
and rendering identically (SC-005) — the migration must be a pure backfill,
never touching content/domain/path/status. `pages-publish-guard.ts` stays
the single source of publish-rejection reasons (no second, competing
validation path).

**Scale/Scope**: Same single shared workspace, small trusted editor team as
001/003 — no scale change.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Extends the existing `publishGuard` hook with a per-type branch rather than adding a second validation hook/path; reuses the existing `builder.blockCount.leadForm` tally (no new counting mechanism); reuses `GJS_BLOCKS` for every starter, as 003 already established; one shared `starterTemplates.ts` registry, not two copies. |
| II. Stack-Native | Payload `select` field + `beforeValidate`/`beforeChange` hooks + a Payload migration + Payload's own custom-admin-view mechanism (`admin.components.views`) for the wizard — no wrapper, no new tooling, no client-side router library beyond what Payload's admin already ships. `sessionStorage` (justified below) is the one addition beyond the stack's own primitives. |
| III. Small, Reversible | Five phases below, one commit each. The migration is itself expand → backfill → contract in one file, with a tested `down()`. Phase 4 (the wizard) is fully additive and independently revertible without touching Phases 1–3's data/behaviour — reverting it leaves Phase 3's server-side fallback as the only creation path, exactly like before Phase 4 existed. |
| IV. Working Software Over Ceremony | Every rule-matrix branch, the template-application hook, and the conflict-check endpoint get a regression test (constitution: custom Payload hooks/endpoints MUST have one); the wizard's two UI-embedded decisions (FR-016's field mapping, FR-017's redirect) are each factored into a pure function and unit tested too, not left covered by the live walkthrough alone just because they live inside a component. |
| V. Quality the User Feels | `pageType` is one more sidebar field on the existing edit view; starter templates render through the exact same GrapesJS/PageShell path already covered by 003's accessibility/responsive work. The wizard is a small, focused admin screen — no new public-facing UI, so 003's visitor-facing accessibility/performance work is unaffected. |

Gate: **PASS**. No complexity-tracking entries needed. `sessionStorage` isn't
a runtime *dependency* (Principle II's justification duty is about added
packages) but is a browser API this app hasn't leaned on before for
cross-page state — noted here for the same transparency: it's the smallest
mechanism that survives a client-side navigation between two distinct admin
routes without a server round trip, and per-tab/ephemeral is exactly the
right lifetime for a one-time creation handoff (nothing to clean up, nothing
persisted beyond the moment it's needed).

## Project Structure

### Documentation (this feature)

```text
specs/004-page-types/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/
    └── publish-guard-by-type.md   # Phase 1 output — the updated validation matrix
```

### Source Code (repository root)

```text
apps/cms/src/collections/Pages.ts            # + pageType field
apps/cms/src/hooks/pages-publish-guard.ts    # extended: per-type rule matrix
apps/cms/src/hooks/pages-starter-template.ts # new — applies the type-matched starter on create (server-side fallback)
apps/cms/src/fields/grapesjs/field.ts        # keep the subscription default (FR-012's default type); drop it as the ONLY default
apps/cms/src/fields/grapesjs/starterTemplates.ts # new — the shared {type -> template[]} registry (server hook AND client wizard both import this)
apps/cms/src/fields/grapesjs/starterTemplateOptions.ts # new — templatesFor(pageType) list helper for the wizard's template <select> (or folded into starterTemplates.ts directly)
apps/cms/src/migrations/<ts>_page_type.ts    # new — nullable add, backfill, NOT NULL
apps/cms/src/payload-types.ts                # regenerated
apps/cms/src/components/PageCreateWizard.tsx # new — the guided-step admin view (client component); the sessionStorage write + conflict-check call live inline here, not a separate file
apps/cms/src/components/PageWizardBootstrap.tsx # new — wired via admin.components.edit.beforeDocumentControls; applies a pending wizard stash on the create form (and redirects to the wizard when none is pending), no-ops otherwise
apps/cms/src/endpoints/pageConflictCheck.ts  # new — small read endpoint the wizard calls to check an existing (domain, path) collision
apps/cms/tests/pages-publish-guard.test.ts   # extended per-type cases
apps/cms/tests/pages-starter-template.test.ts # new
apps/cms/tests/page-conflict-check.test.ts   # new
apps/cms/tests/page-wizard-bootstrap.test.ts # new — unit tests for PageWizardBootstrap's extracted pure logic (stash->field mapping, redirect decision)
```

**Structure Decision**: No new app, package, or collection. Everything lands
inside `apps/cms`'s existing collection/hook/field layout, following 003's
established pattern for this exact area of the codebase.

## Phasing

Each phase = one commit, independently revertible.

### Phase 1 — `pageType` field + migration

- `apps/cms/src/collections/Pages.ts`: new sidebar field —
  `{ name: "pageType", type: "select", required: true, defaultValue: "subscription", options: ["subscription", "free", "confirmation"], admin: { position: "sidebar", description: "Internal — never shown publicly. Determines publish requirements and the starter template." } }`.
- `payload generate:types` to refresh `payload-types.ts`.
- `payload migrate:create` generates the `ADD COLUMN` — hand-augment the
  generated migration (matching this repo's existing precedent of
  hand-tweaked generated migrations, e.g. `..._dsr_email_nullable`) to do it
  in one file as: add `page_type` nullable → `UPDATE pages SET page_type =
  'subscription' WHERE page_type IS NULL` → `ALTER COLUMN page_type SET NOT
  NULL`. `down()` drops the column (data loss on rollback is acceptable and
  already this repo's convention for column-drop downs).
- Apply the migration against the local dev DB; confirm every existing page
  now has `pageType: "subscription"` and nothing else about it changed
  (SC-005).

Verify: `payload migrate:status` clean; spot-check a couple of existing
pages via the REST API before/after — identical except the new field.

### Phase 2 — Per-type publish-guard rule matrix

- `apps/cms/src/hooks/pages-publish-guard.ts`: read `pageType` from
  `data ?? originalDoc`. Branch the existing lead-form-count check:
  - `subscription`: unchanged — `leadForms !== 1` is a problem.
  - `free` / `confirmation`: `leadForms !== 0` is a problem ("a `<type>` page
    must not contain a lead-form block").
  - The email-field / form-setting checks (lines checking `form.fields`,
    `successMessage`, etc.) only run when `pageType === "subscription"`
    (FR-007) — skip them entirely for `free`/`confirmation`.
  - New check, `confirmation` only: `builder.html` must contain the literal
    `{{unsubscribeUrl}}` placeholder, else "the confirmation page must
    include the unsubscribe-link placeholder".
- Domain/path/html-non-empty/path-uniqueness checks stay unconditional (all
  types).
- Regression tests (extend `pages-publish-guard.test.ts`): each of
  spec.md's User Story 1/2 acceptance scenarios as a case — free without a
  lead-form publishes; free with one is rejected; confirmation with the
  placeholder and no lead-form publishes; confirmation missing the
  placeholder is rejected; confirmation with a lead-form is rejected;
  subscription behaviour is provably unchanged (existing test cases still
  pass verbatim).

Verify: full `pages-publish-guard.test.ts` green; live REST check on the
local stack for at least one case per type (matching how 003's guard work
was verified).

### Phase 3 — Per-type starter templates (server-side fallback)

- New `apps/cms/src/fields/grapesjs/starterTemplates.ts`: exports
  `STARTER_TEMPLATES: Record<PageType, { id: string; label: string;
  projectData: object; html: string; css: string }[]>` — today exactly one
  entry per type, built from `GJS_BLOCKS` (`hero`/`rich-text`/`lead-form`),
  not hand-invented trees — same principle as 003. This is the **one**
  place template content is defined; both the server hook (this phase) and
  the client wizard (Phase 4) import it, so there is never a second,
  drifting copy.
  - `subscription`: hero + lead-form block (identical to 003's existing
    starter — factored out of `field.ts` into this new module, not
    reinvented).
  - `free`: hero/text block only, no lead-form block.
  - `confirmation`: a short "merci" message whose text already contains the
    `{{unsubscribeUrl}}` placeholder, no lead-form block.
- `apps/cms/src/fields/grapesjs/field.ts`: `projectData`/`html`/`css` keep a
  field-level `defaultValue` returning `STARTER_TEMPLATES.subscription[0]`'s
  content (matches FR-012's default type — an editor who reaches the
  standard create form with nothing selected yet still sees a sensible
  starter, not a blank field, consistent with 003).
- New `apps/cms/src/hooks/pages-starter-template.ts`: a `beforeValidate`
  collection hook, ordered **before** `recomputeBlockCount`, that only acts
  `if (operation === "create")` and the incoming `builder.projectData` is
  still blank-or-equal-to-the-subscription-default (i.e. neither the editor
  nor the Phase 4 wizard has already set real content) — then overwrites
  `projectData`/`html`/`css` with `STARTER_TEMPLATES[data.pageType][0]`'s
  content. This is the **fallback** for anyone who reaches document
  creation without going through the Phase 4 wizard (e.g. a future
  API-only integration) — once Phase 4 lands, the normal admin path never
  actually needs this fallback to fire, because the wizard already set the
  right content before the document is even created.
- Regression tests (`pages-starter-template.test.ts`): each type's starter
  passes `countBlocks()`/the new publish-guard rules for that type; a
  `free`/`confirmation` create whose `projectData` was already customised
  (by an editor, or by the Phase 4 wizard) is left untouched (never
  overwritten).

Verify: live check per type — create via REST with no builder content,
confirm the right starter comes back; publish each unedited.

### Phase 4 — Guided creation flow

- New `apps/cms/src/endpoints/pageConflictCheck.ts`: a small Payload
  endpoint (`GET /api/pages/conflict-check?domain=&path=`) — staff only
  (admin or editor, reusing `apps/cms/src/access`'s active-human check; this
  is called from an editor's own admin session while creating a page, not
  by the renderer's service key — matching tasks.md and
  contracts/page-conflict-check.md, not `pagePreview.ts`'s narrower
  service-or-admin pattern, which solves a different problem), mirrors
  `pages-publish-guard.ts`'s existing clash query but against **any** page
  (draft or published) rather than published-only (FR-015);
  returns `{ conflict: boolean, pageId?, pageTitle? }`.
- New `apps/cms/src/components/PageCreateWizard.tsx` (+ a small client
  helper for the sessionStorage/fetch logic): a custom Payload admin view
  registered at `admin.components.views.pageWizard` (a path nested under
  the `pages` collection's admin routes, e.g. `/collections/pages/wizard`).
  Renders: `pageType` select (3 options), a template select populated from
  `STARTER_TEMPLATES[pageType]` (today always exactly one entry, still
  rendered as a real select so adding a second template later needs no UI
  rework), `domain` select (optional, fetched from `/api/domains`), `path`
  text input (only meaningful/enabled once a domain is picked), `title`
  text input, and a "Continuer" button.
  - On submit: if both domain and path are set, call
    `pageConflictCheck`; a conflict blocks submission with an inline error
    naming the other page (FR-015). Otherwise, write
    `{ pageType, templateId, domain, path, title }` to
    `sessionStorage` under one fixed key and navigate to
    `/admin/collections/pages/create`.
- New `apps/cms/src/components/PageWizardBootstrap.tsx`, wired via
  `Pages.ts`'s existing `admin.components.edit.beforeDocumentControls`
  array (alongside 003's `RevalidationStatus`) — Payload renders this slot
  on the create view too (create is a variant of the edit view). On mount:
  read the sessionStorage key; if present, use the form context
  (`useForm`/`useField`, the same hooks `Editor.client.tsx` already uses)
  to set `title`, `pageType`, `domain`, `path`, and
  `builder.projectData`/`html`/`css` (from `STARTER_TEMPLATES` keyed by the
  stashed `templateId`) — then clear the key. Renders nothing itself (a
  behaviour-only component); a complete no-op, including on every ordinary
  edit-existing-page view, when no stash is present.
- Redirect guard: the standard create view redirects client-side to the
  wizard **unless** a pending stash already exists in sessionStorage
  (i.e. we just came *from* the wizard) — implemented as a tiny check
  alongside `PageWizardBootstrap` itself (same mount point, same
  component): no stash and no `id` in the URL → `router.replace` to the
  wizard path; stash present → consume it as described above and do not
  redirect (FR-017).
- `PageWizardBootstrap`'s two decisions — which fields to set from a stash,
  and whether to redirect — are each factored into a small pure function
  (`stashToFieldUpdates`, `shouldRedirectToWizard`) and unit tested in
  `apps/cms/tests/page-wizard-bootstrap.test.ts`; the surrounding
  React/`useForm`/routing wiring itself has no practical unit-test harness
  in this codebase (same reasoning as `Editor.client.tsx`) and stays
  covered by the live check below. FR-017 is a MUST requirement — routing
  logic alone isn't exempt from that just for being inside a UI component.
- Regression tests (`page-conflict-check.test.ts`): conflict detected
  against another draft; against another published page; no conflict
  across different domains with the same path; no conflict when the other
  page is the same document being edited (not applicable for a brand-new
  page, but keeps the query shape consistent with `publishGuard`'s existing
  clash check for reuse).

Verify: live, in the real admin — click "Create New", confirm landing on
the wizard; enter a domain+path already used by another page, confirm the
inline block; complete the wizard for each of the three types, confirm the
GrapesJS canvas already shows the right starter on first paint (no save
needed) — this is the concrete proof SC-008 holds; navigate directly to
`/admin/collections/pages/create`, confirm the redirect to the wizard.

### Phase 5 — Verification pass

- `apps/cms` full suite + typecheck + lint.
- Confirm `apps/web` needs zero changes: `PublishedPage`/`getPublishedPage`
  never reference `pageType`; add one regression assertion that the string
  `"pageType"` never appears in a rendered `PageShell` output as extra
  insurance for FR-002/SC-006, even though nothing in the renderer reads the
  field.
- Live: register/publish one page of each type end to end (per
  quickstart.md); confirm existing (pre-migration) pages still render and
  can still be edited/republished exactly as before (SC-005).

## Risks

| Risk | Mitigation |
|---|---|
| The migration's `NOT NULL` step fails if any existing row can't be backfilled | The `UPDATE ... WHERE page_type IS NULL` runs unconditionally over every existing row before the `NOT NULL` constraint is added, in the same migration — nothing to leave unbackfilled. |
| Publish-guard per-type branching quietly changes `subscription` behaviour | Existing `pages-publish-guard.test.ts` cases are kept verbatim, not rewritten — a behaviour change there fails the existing suite, not just new tests. |
| Starter-template hook overwrites an editor's real (non-default) work on some later, unrelated save | Guarded by `operation === "create"` plus the "still blank/still the default" check — never runs on an update to an already-customised document. |
| `pageType` accidentally leaks to `apps/web` later (e.g. a future contributor widens the `PublishedPage` type) | FR-002 stays enforceable by the same discipline as every other CMS-only field already excluded from that type; the added regression test in Phase 5 catches an accidental leak into rendered output specifically. |
| sessionStorage handoff is lost (private browsing, a second tab, the editor navigates away and back) | `PageWizardBootstrap` no-ops when nothing is stashed — the create form still works exactly as Phase 3 already made it (server-side fallback template, editor sets fields normally); nothing is ever blocked by a missing stash, only the "instant preview" nicety is skipped that one time. |
| The wizard's redirect guard creates a loop or strands an editor if `PageWizardBootstrap` fails to mount for some reason | The guard only redirects on a genuinely fresh create view with no `id` and no stash — an editor can still always reach a working create form by completing the wizard once; the underlying `/create` route itself is never removed. |
| `pageConflictCheck` and `publishGuard`'s own clash query drift apart over time (one checks drafts too, one doesn't, by design — FR-018) | Documented explicitly in `contracts/publish-guard-by-type.md` and this plan as two deliberately different scopes, not an oversight; each has its own regression test asserting its own scope. |
