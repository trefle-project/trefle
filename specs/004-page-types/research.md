# Phase 0 Research: Page types (subscription / free / confirmation)

## 1. Where the type field lives, and its shape

**Decision**: A single `select` field, `pageType`, on `pages`, required,
`options: ["subscription", "free", "confirmation"]`, `defaultValue:
"subscription"` (FR-012), sidebar-positioned, admin description states it's
internal/never public.

**Rationale**: A select field is the smallest primitive that expresses a
closed, three-way classification — matches how `status` (draft/published)
is already modelled on the same collection. No new collection: a
`confirmation`-type page is still an ordinary `Page` document, unchanged
from how 003 already treats `pages.confirmationPage`.

**Alternatives considered**: three boolean flags (`isSubscription`,
`isFree`, `isConfirmation`) — rejected, allows invalid combinations (all
false, or more than one true) a single required select can't express by
construction; a separate `pageTypes` lookup collection — rejected as
unjustified indirection for three fixed, code-level values (Principle I).

---

## 2. Publish-guard: one hook, branched, not a second hook

**Decision**: Extend `pages-publish-guard.ts` in place with a per-`pageType`
branch, rather than adding a second, separate validation hook.

**Rationale**: `pages-publish-guard.ts` is already the single place that
turns "can this page publish?" into one aggregated, user-facing error
message (`problems: string[]`, joined into one `APIError`). A second hook
would mean two independent failure paths an editor could get inconsistent
or out-of-order messages from. Branching in place keeps "why can't this
page publish" a single, complete answer every time (Principle I).

**Alternatives considered**: a `pageType`-keyed table of rule functions
looked up and invoked — rejected as premature abstraction for exactly three,
stable, code-level types (Principle I: "introduce an abstraction only on the
third concrete use" — here there are three *values*, not three *call
sites* needing polymorphism; a `switch`/`if` on three known branches is the
simpler, more readable shape).

---

## 3. Lead-form-forbidden enforcement reuses the existing tally

**Decision**: `free`/`confirmation` reject when
`builder.blockCount.leadForm !== 0`, reading the exact same
`blockCount.leadForm` value `recomputeBlockCount` already maintains for the
existing `subscription` rule (`!== 1`).

**Rationale**: No new counting mechanism, no new hook — `blockCount` is
already correct and current by the time `publishGuard` runs (per the
existing `beforeValidate` ordering: `recomputeBlockCount` before
`publishGuard`... actually before the collection's `beforeChange` array,
where `publishGuard` lives — confirmed unchanged by this feature).

**Alternatives considered**: none — this is the obviously smaller change
over introducing a parallel check.

---

## 4. Unsubscribe-placeholder check: plain text match, same style as the lead-form check

**Decision**: `confirmation`-type pages must have
`builder.html.includes("{{unsubscribeUrl}}")` to publish.

**Rationale**: `{{unsubscribeUrl}}` is already the exact literal token
003's `/confirmation` route substitutes
(`apps/web/src/app/(confirmation)/confirmation/page.tsx`). A plain
substring check on the already-computed `builder.html` export costs nothing
new to compute (unlike `blockCount`, no tally needs adding) and matches the
existing checks' style — structural presence, not semantic placement
(spec.md's Assumptions already scope it this way).

**Alternatives considered**: parsing the GrapesJS `projectData` tree for the
placeholder instead of the flat `html` string — rejected, more code for no
behavioural difference; `html` is already guaranteed in sync with
`projectData` by the client editor before every save.

---

## 5. Starter templates: hook-based for non-default types, field-default kept for the default type

**Decision**: Keep `projectData`/`html`/`css`'s existing field-level
`defaultValue` (the subscription starter, matching FR-012's default type)
for the instant, no-save-needed canvas preview an editor who doesn't touch
`pageType` already gets today. Add a new `beforeValidate` hook,
`applyStarterTemplate`, that runs only on `operation === "create"` and only
while the builder content is still blank-or-the-untouched-default, and
overwrites it with the starter matching the document's actual `pageType`
once that's known (at save time).

**Rationale**: Payload's field-level `defaultValue` function signature
(`{ defaultValue, locale, req, user, value }` —
`node_modules/payload/dist/fields/getDefaultValue.js`) has no access to a
sibling field's value, so it structurally cannot pick a starter based on
whatever `pageType` the editor chose in the same, still-unsaved create form
— confirmed by reading Payload's own default-value resolution code (see
003-post-launch-improvements' research for the general finding that
Payload's admin config, including field wiring, is captured once and needs
a server restart to pick up code changes — a separate, unrelated finding
from this one, which is about the *shape* of the defaultValue API itself,
not about hot-reload). A document-level hook has full `data` access and
naturally runs before `publishGuard` in the very same request (Payload's
own beforeValidate-then-beforeChange ordering), so the stored/validated
result is correct for a "pick type, set status, Save once" flow regardless
of type — only the *client canvas preview* can lag by one save round-trip
for the two non-default types, documented plainly in plan.md rather than
engineered away.

**Alternatives considered**: a client-side `useEffect` in
`Editor.client.tsx` watching a `pageType` field and re-initialising GrapesJS
on change — rejected: more moving parts (client-side field-watching,
re-mounting a whole third-party editor instance mid-session) to buy back a
UX nicety for two non-default type choices, disproportionate to the actual
problem (Principle I); could be revisited later if editors report the
one-extra-save nuance as a real friction point in practice, not
pre-emptively engineered around now.

---

## 6. Migration: nullable → backfill → NOT NULL, hand-augmented in one file

**Decision**: `payload migrate:create` generates the `ADD COLUMN`
statement; hand-edit the generated migration to (a) add the column
nullable, (b) `UPDATE pages SET page_type = 'subscription' WHERE page_type
IS NULL`, (c) `ALTER TABLE pages ALTER COLUMN page_type SET NOT NULL` — all
in the one generated migration file, matching this repo's own precedent of
hand-tweaking a generated migration for exactly this kind of
nullable-then-backfill shape (`20260909_140833_phase5b_dsr_email_nullable`).

**Rationale**: Constitution Principle III requires expand → migrate →
contract for content-shape changes with "no step that drops the old shape
in the same change that stops writing it" — the direct inverse concern
(adding a stricter constraint) has the same spirit: never add a NOT NULL
constraint in the same statement as the column, without backfilling first,
against a table that already has rows.

**Alternatives considered**: two separate migrations (one nullable-add,
one later NOT-NULL-after-backfill) — rejected as unnecessary ceremony for a
backfill that has zero ambiguity (every existing row becomes
`subscription`, no judgement call, no waiting period needed between steps
the way a genuine deprecation would need).

---

## 7. `pageType` never reaching the renderer: no new redaction needed

**Decision**: Satisfy FR-002 structurally, by never adding `pageType` to
`apps/web`'s `PublishedPage` TypeScript interface or to anything
`page-shell.tsx`/`[[...slug]]/page.tsx`/the `/confirmation` route reads —
not by adding a field-level `access.read` restriction or an API
`select` exclusion on the CMS side.

**Rationale**: The renderer already only ever consumes the specific fields
it explicitly destructures from Payload's REST responses (title, path,
builder, form, seo, domain) — it never proxies or re-serves a raw CMS API
response to a visitor's browser. Confirmed by inspecting
`apps/web/src/lib/payload-client/index.ts`: every renderer-facing shape is
a hand-written TypeScript interface, not `unknown`/passthrough. Not adding
`pageType` to that surface is sufficient; a regression test in Phase 4
locks this in by asserting the literal string doesn't appear in rendered
output, catching a future contributor who might otherwise widen the type
without thinking about it.

**Alternatives considered**: a Payload field-level `access.read` returning
`false` for non-admin/non-service roles — rejected as solving a problem
that doesn't exist here (the renderer's `service` API-key user legitimately
needs to read *some* CMS-internal fields already, e.g. `status`, to decide
what's publishable; the actual guarantee needed is "the renderer's own code
never re-serves it to a visitor," which is a TypeScript-surface concern, not
an access-control one).

---

## 8. Guided creation flow: a custom admin view, not a modal or a wizard library

**Decision**: The guided step (User Story 4) is a full custom Payload admin
view, registered via `admin.components.views` (Payload's own documented
mechanism for "add custom collection views... matched by path" —
confirmed present in the installed version's types,
`node_modules/payload/dist/collections/config/types.d.ts`), at its own
route under the `pages` collection's admin path. Not a modal overlaid on
the list view, not a third-party wizard/stepper library.

**Rationale**: A full route (not a modal) means it's directly linkable,
survives a page refresh mid-flow, and needs no new UI-state-management
dependency — Payload's admin is itself a Next.js app, and a route is the
stack's own primitive for "a distinct screen." A modal would need to live
somewhere (the list view? a layout-level portal?) and add complexity for no
real benefit here, since the flow is a one-way "collect answers, then
navigate on" sequence, not something that benefits from staying overlaid on
existing content (Principle I/II).

**Alternatives considered**: a modal launched from the list view's "Create
New" button — rejected, no clear benefit over a route and couples the flow
to the list view's own component tree; a third-party multi-step-form
library — rejected as unjustified for a single, three/four-field step
(Principle II: no dependency the stack's own primitives already cover).

---

## 9. Handoff to the standard create form: `sessionStorage`, not URL query params or a server-side draft

**Decision**: The wizard writes its answers to `sessionStorage` under one
fixed key, then does a plain client-side navigation to
`/admin/collections/pages/create`; a new `PageWizardBootstrap` component
(wired via the same `admin.components.edit.beforeDocumentControls` slot
003 already uses for `RevalidationStatus`) reads and clears that key on
mount, applying the values via the form's own `useForm`/`useField` hooks.

**Rationale**: Payload's field-level `defaultValue` cannot read URL query
params (its signature is `{ defaultValue, locale, req, user, value }` — no
`data`, no direct request-query access threaded through to a field
default) or arbitrary request state; encoding the answers in the URL and
having every field's `defaultValue` parse `req` for them would mean
touching four separate field definitions with duplicated
query-string-parsing logic. A single small bootstrap component that runs
once, in one place, using the same form-context hooks `Editor.client.tsx`
already relies on, is the smaller, more contained change — and
`sessionStorage` needs no server round trip to write or read, unlike
creating a real, but-still-a-draft-document server-side just to carry state
between two admin screens (which would also mean a half-created document
existing if the editor abandons the wizard partway).

**Alternatives considered**: URL query params carrying the answers through
to `/create?pageType=...` — rejected per the `defaultValue` limitation
above, and query params are visible/bookmarkable in a way that's
meaningless here (the values are only useful once, consumed immediately);
creating the actual `pages` document at wizard-submit time (via the CMS
API) and redirecting to its real edit view (`/collections/pages/<id>`)
instead of the create view — considered, and functionally similar, but
rejected in favour of keeping document creation happening exactly once, in
exactly one place (the standard create form's own save), matching the
"coexists, wizard is a preliminary step, not a second creation path"
decision (spec.md Clarifications) — the wizard *primes* a creation, it
doesn't perform one.

---

## 10. `pageConflictCheck`: deliberately broader scope than `publishGuard`'s own clash check

**Decision**: A new, small endpoint the wizard calls, checking for any
other page — **draft or published** — already at the entered (domain,
path). This is intentionally **not** the same query `publishGuard` already
runs (which only considers *published* pages, since that's the actual
constraint that matters at publish time — two drafts sharing a path are
harmless until one of them tries to go live).

**Rationale**: FR-015/FR-018 are explicit that this is an early, advisory,
stricter check — its job is to save an editor from building out content
under a path another page (even an unpublished one) already has claimed,
which `publishGuard`'s narrower published-only check wouldn't catch until
much later. Keeping it a **separate** query (not widening
`publishGuard`'s own clash check to include drafts) avoids changing
`publishGuard`'s actual behaviour — two drafts sharing a path remains
allowed, unchanged from 001, since forcing that to be an error too would be
a real behaviour change to today's system, not something asked for here.

**Alternatives considered**: reusing/widening `publishGuard`'s clash query
to also run this check — rejected, conflates two different guarantees (one
final/authoritative at publish time, one advisory/early at creation time)
into one code path, risking exactly the kind of accidental behaviour change
Principle III warns against.
