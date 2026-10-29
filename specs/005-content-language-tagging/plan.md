# Implementation Plan: Content language tagging

**Branch**: `005-content-language-tagging` | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-content-language-tagging/spec.md`

## Summary

Add a new, admin-manageable `languages` collection (seeded at launch with
fr/en/es/de), a required `language` relationship on `pages`, an optional
`defaultLanguage` relationship on `domains` (pre-fills the creation
wizard's `language` select), and a denormalized `language` text field on
`leads` that `leadIntakeEndpoint` copies from the source page's language
at the moment of submission and never touches again. One hand-augmented
migration lands the new table + seed rows + all three field additions +
backfill of every pre-existing page (`fr`) and lead (their page's
backfilled language, or `fr` if orphaned). No renderer change — `apps/web`
stays untouched, matching how `pageType` stayed CMS-only in
004-page-types.

## Technical Context

**Language/Version**: TypeScript, Node 24. Payload 3.88 + Next 16
(`apps/cms`). This feature touches `apps/cms` only — `apps/web` needs no
change (FR-012: language is tagging/metadata only, never a rendering
input).

**Primary Dependencies**: Payload CMS only. No new npm dependency. The
`language` pre-fill in the creation wizard reuses 004-page-types'
existing `sessionStorage` stash mechanism (`pageWizardStash.ts`) — no new
client-state mechanism.

**Storage**: PostgreSQL 16. One new table (`languages`) + three new
columns (`pages.language_id` required, `domains.default_language_id`
optional, `leads.language` text required) in one hand-augmented migration
(research.md §5): create table → seed 4 rows → add+backfill `pages` →
add `domains` (no backfill needed) → add+backfill `leads`. Every `NOT
NULL` step is preceded, in the same file, by a full backfill of every
existing row — Principle III.

**Testing**: Vitest (unit, mocked `req.payload`) for the new hooks
(`languages`' deactivate/delete guards) and the extended
`leadIntakeEndpoint`/`leadsExport` behavior — matches
`pages-confirmation-guard.test.ts` and `lead-intake.test.ts`'s existing
style. `pageWizardStash.ts`'s extended `stashToFieldUpdates` gets the same
pure-function unit-test treatment 004 already established for it. Live
verification on the local stack per `quickstart.md`.

**Target Platform**: Same Debian VPS / Docker Compose stack; no
infra/deploy change.

**Project Type**: Existing multi-app monorepo; this feature stays entirely
inside `apps/cms`.

**Constraints**: Every page and lead that existed before this feature
keeps every other field byte-for-byte unchanged after the migration
(SC-005) — the migration is a pure additive backfill, never touching
content/domain/path/status/email/fieldValues/etc. `leadIntakeEndpoint`
stays the single writer of `leads` rows (no second write path introduced
for `language`).

**Scale/Scope**: Same single shared workspace, small trusted editor team
as prior features — 4 seed languages, not an open-ended list at launch.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | `languages` is one small collection with two guard hooks mirroring existing ones (`domains`' access shape, `pages-confirmation-guard.ts`'s delete-guard pattern) — no new abstraction invented. The domain-default pre-fill reuses 004's existing wizard/stash mechanism rather than adding a second, reactive one (research.md §4). `leads.language` is a plain text copy, the same shape as the already-existing `domainHostname` — no new "snapshot" concept introduced. |
| II. Stack-Native | Payload `relationship`/`text`/`checkbox` fields + `beforeChange`/`beforeDelete` hooks + one Payload migration — no wrapper, no new tooling. The wizard extension is more Payload admin-view/form-context code, the same primitives 004 already used. |
| III. Small, Reversible | 6 phases below, one commit each. The single migration is itself create → seed → backfill → constrain, in one file, with a tested `down()` that drops everything it added. Phases 2-5 are each independently revertible without touching the schema phase's data. |
| IV. Working Software Over Ceremony | The two new `languages` hooks, the `leadIntakeEndpoint` extension, and `pageWizardStash.ts`'s extended pure functions each get a regression test (constitution: custom Payload hooks/endpoints MUST have one). The CSV/list-filter change is thin, presentational wiring around already-tested data — covered by extending `leads-export.test.ts`, not by a new test class. |
| V. Quality the User Feels | Everything here is an admin-surface change (a picker field, a list filter, a CSV column) — no published-page markup, accessibility surface, or client bundle weight changes on the public site at all (FR-012). The one admin-UX-sensitive bit (blocking a save with no language and no domain default) gets a clear, plain-language rejection, same tone as `publishGuard`'s existing messages. |

Gate: **PASS**. No complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-content-language-tagging/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── contracts/
    ├── languages-collection.md      # Phase 1 output
    └── lead-language-capture.md     # Phase 1 output
```

### Source Code (repository root)

```text
apps/cms/src/collections/Languages.ts          # new — the languages collection
apps/cms/src/collections/Pages.ts              # + language field
apps/cms/src/collections/Domains.ts            # + defaultLanguage field
apps/cms/src/collections/Leads.ts              # + language field (text, denormalized)
apps/cms/src/hooks/languages-lifecycle.ts      # new — prevent-last-active-deactivate + prevent-delete-if-referenced
apps/cms/src/endpoints/leadIntake.ts           # + copy page.language.code onto the new lead
apps/cms/src/endpoints/leadsExport.ts          # + language column
apps/cms/src/components/PageCreateWizard.tsx   # + language select, fetch active languages, prefill from domain.defaultLanguage
apps/cms/src/components/pageWizardStash.ts     # + language in PageWizardStash + stashToFieldUpdates
apps/cms/src/payload.config.ts                 # register the Languages collection
apps/cms/src/migrations/<ts>_languages.ts      # new — create table, seed, backfill pages/leads, add domains column
apps/cms/src/payload-types.ts                  # regenerated
apps/cms/tests/languages-lifecycle.test.ts     # new
apps/cms/tests/lead-intake.test.ts             # extended
apps/cms/tests/leads-export.test.ts            # extended
apps/cms/tests/page-wizard-bootstrap.test.ts   # extended (stashToFieldUpdates)
```

**Structure Decision**: No new app or package. One new collection plus
extensions to three existing ones, following 004's established pattern for
this exact area of the codebase (`apps/cms`'s collection/hook/field/
migration layout).

## Phasing

Each phase = one commit, independently revertible.

### Phase 1 — Schema: `languages` + the three field additions

- `apps/cms/src/collections/Languages.ts`: new collection per
  data-model.md — `code` (unique, normalized, validated), `label`,
  `isActive` (default `true`); access mirrors `domains.ts`
  (`read: isStaffOrService`, `create`/`update`/`delete: isAdmin`).
- Register it in `apps/cms/src/payload.config.ts`'s `collections` array.
- `apps/cms/src/collections/Pages.ts`: new sidebar field —
  `{ name: "language", type: "relationship", relationTo: "languages", required: true, filterOptions: { isActive: { equals: true } }, admin: { position: "sidebar", description: "Required. Determines which language this page's leads are captured under." } }`.
- `apps/cms/src/collections/Domains.ts`: new field —
  `{ name: "defaultLanguage", type: "relationship", relationTo: "languages", filterOptions: { isActive: { equals: true } }, admin: { description: "Pre-fills the language of a new page created under this domain." } }`.
- `apps/cms/src/collections/Leads.ts`: new field —
  `{ name: "language", type: "text", admin: { readOnly: true, description: "The source page's language at the moment this lead was captured; never changes afterward." } }`.
- `payload generate:types` to refresh `payload-types.ts`.
- `payload migrate:create`, then hand-augment the generated migration per
  research.md §5 (create `languages`, seed 4 rows, add+backfill
  `pages.language_id`, add `domains.default_language_id`, add+backfill
  `leads.language`). `down()` drops all four in reverse.
- Apply against the local dev DB.

Verify: `payload migrate:status` clean; `GET /api/languages` returns
exactly the 4 seed rows; spot-check a couple of pre-existing pages and
leads via REST — `language: "fr"` and nothing else changed (SC-005).

### Phase 2 — Language lifecycle guards (User Story 1)

- `apps/cms/src/hooks/languages-lifecycle.ts`: two hooks —
  `preventLastActiveDeactivation` (`beforeChange`: reject `isActive: true →
  false` when it would leave zero active languages, FR-004a) and
  `preventDeleteIfReferenced` (`beforeDelete`: `find` on `pages.language`
  and `domains.defaultLanguage`, reject naming the referencing docs if any
  match — same shape as `pages-confirmation-guard.ts`'s
  `confirmationGuardOnDelete`).
- Wire both into `Languages.ts`'s `hooks`.
- `apps/cms/tests/languages-lifecycle.test.ts`: duplicate `code` rejected;
  deactivating with other active languages left succeeds; deactivating the
  last active one is rejected; deleting a referenced language is rejected
  (naming the reference); deleting an unreferenced one succeeds; deleting a
  language only referenced by a lead's (text) `language` succeeds.

Verify: quickstart.md §2 on the local stack.

### Phase 3 — Domain-default pre-fill in the creation wizard (User Story 2 scenario 2 / User Story 4)

- `apps/cms/src/components/PageCreateWizard.tsx`: fetch active languages
  (`/api/languages?where[isActive][equals]=true&limit=50&depth=0&sort=code`),
  same pattern as the existing `domains` fetch; add a `language` select;
  when `domain` changes, if the chosen domain has a `defaultLanguage` (the
  existing `domains` fetch response already carries it once the field
  exists), pre-fill `language` — but only if the editor hasn't already
  picked one by hand.
- `apps/cms/src/components/pageWizardStash.ts`: add `language` to
  `PageWizardStash`; extend `stashToFieldUpdates` to push
  `{ path: "language", value: stash.language }` (numeric-id coercion, same
  as the existing `domain` handling — `stashToFieldUpdates`'s comment
  already explains why).
- Extend `apps/cms/tests/page-wizard-bootstrap.test.ts` for the new
  `language` mapping.

Verify: quickstart.md §3 on the local stack, in a real browser — set a
domain default, confirm the wizard pre-fills; confirm saving without any
domain default and no language picked is blocked (Payload's own
`required` validation, Phase 1).

### Phase 4 — Lead capture stamping (User Story 3)

- `apps/cms/src/endpoints/leadIntake.ts`: the page is already fetched at
  `depth: 1`; add
  `language: typeof page.language === "object" ? page.language.code : undefined`
  to the `payload.create({ collection: "leads", ... })` call
  (contracts/lead-language-capture.md).
- Extend `apps/cms/tests/lead-intake.test.ts`: a submission on a page
  tagged `en` produces a lead with `language: "en"`; changing the page's
  language afterward, or deleting the page, leaves the already-created
  lead's `language` untouched.

Verify: quickstart.md §4 on the local stack.

### Phase 5 — Admin visibility + CSV export (User Story 5)

- `apps/cms/src/collections/Leads.ts`: add `language` to
  `admin.defaultColumns`.
- `apps/cms/src/endpoints/leadsExport.ts`: add `"language"` to `HEADERS`
  and `d.language` to the per-row `csvRow([...])` call.
- Extend `apps/cms/tests/leads-export.test.ts`: exported CSV includes the
  `language` column with the expected value.

Verify: quickstart.md §5 on the local stack — filter the Leads list by
language; export and open the CSV.

### Phase 6 — Verification pass

- `apps/cms` full suite + typecheck + lint.
- Confirm `apps/web` needs zero changes (FR-012): `PublishedPage` and
  everything `page-shell.tsx`/`[[...slug]]/page.tsx` reads still don't
  reference `language` anywhere.
- Live: walk quickstart.md §1-§6 end to end on the local stack; confirm
  pre-migration pages/leads render/edit/export exactly as before aside
  from the new field (SC-005).

## Risks

| Risk | Mitigation |
|---|---|
| The migration's `pages`/`leads` `NOT NULL` steps fail if a row can't be backfilled | Both `UPDATE ... WHERE language IS NULL` (or `language_id IS NULL`) run unconditionally over every row, in the same migration, before the constraint is added — nothing left unbackfilled, including orphaned leads (COALESCE fallback to `fr`). |
| Seeding launch data via a migration is new for this repo — a typo in the `INSERT` ships wrong codes/labels to every environment | Phase 1's verify step checks `GET /api/languages` against the exact FR-002 list before Phase 2 begins; `down()` cleanly removes the table if it needs correcting. |
| The wizard's domain-default pre-fill silently overwrites a language the editor already picked by hand (e.g. they set `language` first, then changed `domain`) | Phase 3 pre-fills only when `language` hasn't been touched yet by the editor — same "don't clobber real input" discipline `pages-starter-template.ts` already uses for `projectData`. |
| A `languages` row gets deleted from outside the guarded path (e.g. a raw DB operation, or `overrideAccess: true` in some future script) | Out of scope to fully prevent (any Postgres-level access bypasses application hooks by definition) — the FK (`REFERENCES languages(id)`) on `pages`/`domains` still protects at the database level even if an application-level guard is ever bypassed. |
| Deactivating the last active language becomes a real operational annoyance if an admin genuinely wants zero active languages temporarily | Not expected in practice (4 seed languages, deactivation is rare) — if it ever becomes real friction, FR-004a itself would need revisiting, not this implementation. |
