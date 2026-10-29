# Phase 0 Research: Content language tagging

## 1. Languages live in their own collection, not a fixed code-level list

**Decision**: A new `languages` collection (`code`, `label`, `isActive`),
admin-manageable like `domains` — not a hard-coded `select` enum like
`pageType`/`status`.

**Rationale**: Settled explicitly in `/speckit-specify`'s clarification
session (spec.md) — the whole point of this shape is that adding a fifth
language later is an admin task, not a deployment. `pages.language` and
`domains.defaultLanguage` are `relationship` fields to it, so the set of
selectable languages can grow without touching `Pages.ts`/`Domains.ts` or
running a migration.

**Alternatives considered**: a `select` field with a fixed `options` array
(the `pageType` pattern) — rejected per the clarification: it would put
every future language behind a code change + deploy, which is exactly what
was ruled out.

---

## 2. `pages.language` is a `relationship`; `leads.language` is a denormalized text copy

**Decision**: `pages.language` → `relationship, relationTo: "languages"`
(a live reference, editable at any time). `leads.language` → plain `text`
storing the *code* (e.g. `"fr"`), copied once at submission time — not a
relationship.

**Rationale**: This is exactly how `domainHostname` already works on
`leads` today (a denormalized string copy of `pages.domain`'s hostname,
sitting right next to the `page` relationship itself) — the codebase
already has this precise pattern for "capture a fact about the page onto
the lead, frozen from then on." A relationship on `leads` would need extra
machinery to stay "frozen" (FR-008: a lead's language must never change
even if the page's language changes or the page is deleted); a plain copied
string is frozen by construction — there's nothing to keep in sync, and it
survives the source page being deleted for free (leads already tolerate an
orphaned `page` reference, per `Leads.ts`'s own header comment).

**Alternatives considered**: `leads.language` as a `relationship` to
`languages`, snapshotting the *id* at creation — rejected: still lets the
label/active-state of that language document change under the lead's feet
conceptually (not the code, but the display), and deleting a referenced
`languages` row would need either a delete guard reaching into `leads` (see
§4) or an orphaned relationship — more moving parts for no benefit over a
plain text copy, since all any downstream consumer needs is the code.

---

## 3. `pages.language` is `required: true` at every save, not only at publish

**Decision**: Unlike `domain`/`path` (required only to *publish*, enforced
by `publishGuard`), `language` is a Payload-level `required: true` field —
enforced on every save, draft included, like `pageType`/`status`.

**Rationale**: The spec's clarification session settled this in FR-006's
exact wording: "saving a new page without an explicitly chosen language
MUST be blocked" (not "publishing"). Making it `required: true` is also
what makes FR-006's "MUST NOT silently apply a system-wide default"
enforceable for free: Payload's field-level `required` simply won't let a
save through with nothing selected — no extra validation code needed, and
no separate rule to keep in sync with `publishGuard`'s own checks.

**Alternatives considered**: enforcing it inside `publishGuard` instead
(matching `domain`/`path`'s pattern) — rejected as contradicting FR-006's
explicit "saving...MUST be blocked" wording; also would need a second,
new mechanism to block a *draft* save (`publishGuard` only runs when the
target status is `published`), whereas `required: true` handles both in
one place, for free.

---

## 4. The domain-default pre-fill lives entirely in the existing creation wizard

**Decision**: `domains.defaultLanguage` only ever pre-fills
`PageCreateWizard.tsx`'s own `language` select (added alongside its
existing `domain` select) — no reactive field-level behaviour is added to
the plain Payload edit/create form itself.

**Rationale**: 004-page-types already made the wizard the *only* path to
creating a page — `PageWizardBootstrap` redirects any direct visit to
`/admin/collections/pages/create` (no stash, no doc id) back to the wizard
first. So the wizard already has `domain` selected before `language` is
ever asked for, and the wizard's existing stash → `stashToFieldUpdates` →
`dispatchFields` handoff (research.md §9 of 004) is already exactly the
right mechanism to carry a pre-filled `language` value onto the real
document. Building a second, reactive "watch `domain`, autofill `language`"
behaviour on the plain form would be genuinely dead code — that form is
never reached with `domain` already set but `language` still blank,
because the wizard is the only door in.

**Alternatives considered**: a Payload custom `admin.components.Field` on
`language` using `useFormFields` to watch `domain` and react live —
rejected as an unreachable second implementation of behaviour the wizard
already provides (Principle I: no abstraction before it's needed twice for
real).

---

## 5. One hand-augmented migration for all four schema additions

**Decision**: Define the new `languages` collection and the three field
additions (`pages.language`, `domains.defaultLanguage`, `leads.language`)
together, then run `payload generate:types` + `payload migrate:create`
once, producing a single migration file. Hand-augment it (matching 004's
precedent of hand-editing a generated migration) to:

1. `CREATE TABLE languages (...)`.
2. `INSERT INTO languages (code, label, is_active) VALUES (...)` — the four
   FR-002 launch languages (fr, en, es, de).
3. `ALTER TABLE pages ADD COLUMN language_id integer REFERENCES
   languages(id)` (nullable at this point).
4. `UPDATE pages SET language_id = (SELECT id FROM languages WHERE code =
   'fr') WHERE language_id IS NULL`.
5. `ALTER TABLE pages ALTER COLUMN language_id SET NOT NULL`.
6. `ALTER TABLE domains ADD COLUMN default_language_id integer REFERENCES
   languages(id)` — stays nullable, no backfill (FR-006: optional).
7. `ALTER TABLE leads ADD COLUMN language text`.
8. `UPDATE leads SET language = COALESCE((SELECT code FROM languages l JOIN
   pages p ON p.language_id = l.id WHERE p.id = leads.page_id), 'fr') WHERE
   language IS NULL` — a lead whose page still exists inherits that page's
   (just-backfilled) language; an orphaned lead (deleted page — `Leads.ts`
   already documents this happens) falls back to the same `fr` default.
9. `ALTER TABLE leads ALTER COLUMN language SET NOT NULL`.

`down()` drops all four in reverse (columns, then the table) — matching
this repo's existing convention for column/table-drop downs (data loss on
rollback is acceptable and already precedented).

**Rationale**: Steps 2-9 must happen in this order (languages must exist
with real ids before anything can reference or backfill against them) —
keeping them in one file/one transaction is the only way to satisfy
Principle III's "no step that drops [or here: requires] the old shape ships
without the rest" for what is fundamentally one coherent, atomic change.
Seeding the four launch languages *in the migration* (rather than via
`apps/cms/src/seed/dev.ts`, which is dev-only and never runs in production)
is new for this repo — there's no prior `INSERT INTO` in a migration — but
justified because FR-002 makes these four rows a delivery requirement of
the feature itself ("the system MUST be seeded... at launch"), not
admin-authored content like a `domains` row (which is deliberately a manual
post-deploy step, per the existing runbook). A migration is the only
mechanism that reaches every environment (dev, CI, prod) the same way,
without depending on someone remembering to run a seed script.

**Alternatives considered**: seeding via `seed:dev` only — rejected, it
doesn't run in production and this repo already has a documented history of
manual prod setup steps being missed (e.g. a since-fixed bug where
`SEED_ADMIN_PASSWORD` was never wired into the prod compose file at all).
Splitting into two or three separate migration files — rejected as adding
files without adding safety: they'd still have to apply together, in order,
in the same deploy for `pages`/`leads`' `NOT NULL` steps to ever succeed.

---

## 6. Language lifecycle guards mirror existing hook precedents exactly

**Decision**: Two new hooks on `languages`:

- **Prevent deactivating the last active language** (`beforeChange`): if an
  update flips `isActive` from `true` to `false`, count other active
  languages; reject with an `APIError` if that count is zero (FR-004a).
- **Prevent deleting a referenced language** (`beforeDelete`): reject with
  an `APIError` naming the referencing pages/domains if any `pages.language`
  or `domains.defaultLanguage` still points at it.

**Rationale**: The delete guard is the exact shape
`pages-confirmation-guard.ts`'s `confirmationGuardOnDelete` already uses
for the same kind of problem ("don't let a delete silently orphan a
relationship elsewhere") — same `find` + `APIError` pattern, reused, not
reinvented. `leads.language` is deliberately excluded from the delete
guard's reference check (§2: it's a denormalized copy, not a live
relationship — deleting a `languages` row can never corrupt an
already-captured lead).

**Alternatives considered**: soft-guarding only in the admin UI (hide the
delete button) — rejected, the API/REST path would still allow it
(`overrideAccess` aside, nothing stops a direct `DELETE`); a hard DB
foreign-key `ON DELETE RESTRICT` alone — rejected as it produces a raw
Postgres constraint error instead of the clear, actionable message
`pages-confirmation-guard.ts`'s precedent already establishes as this
repo's convention for this exact situation.
