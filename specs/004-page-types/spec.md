# Feature Specification: Page types (subscription / free / confirmation)

**Feature Branch**: `004-page-types`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Introduce an internal page-type field (not
visible on the public web) with three values — free, subscription,
confirmation — so only subscription pages require a lead-generation form.
Confirmation pages must carry the unsubscribe link. Each type gets its own
default, editable starter template on creation."

## Context

003-post-launch-improvements added an editable confirmation page
(`pages.confirmationPage`) but discovered a side effect of every page in the
product sharing one undifferentiated shape: `pages-publish-guard.ts` requires
**every** page — landing page or confirmation page alike — to contain exactly
one lead-form block and a fully configured form before it can publish. A
confirmation page whose only job is to say "thank you" is forced to carry a
lead-generation form it will never use, purely because the system has no way
to know its purpose differs from a landing page's.

This phase gives every page an internal `pageType` (subscription / free /
confirmation) so publish requirements — and the starter content a new page
begins from — match what that page is actually for, without changing how
pages are routed, rendered, or selected as another page's confirmation page
(both unchanged from 001/003).

Out of scope: any change to how `confirmationPage` selection works; a bulk
tool to reclassify many existing pages at once (existing pages are
reclassified once, automatically, by this feature's migration — see
Clarifications); the `free` type gaining any capability beyond "a page with
no lead-generation form" — it renders through the exact same pipeline as
every other page.

## Clarifications

### Session 2026-09-11

- Q: Is a lead-generation form forbidden on a `free` page, or merely not
  required? → A: Forbidden — publishing a `free` page that contains a
  lead-form block is rejected, the same explicit way a `subscription` page
  missing one is rejected.
- Q: Is the confirmation page's unsubscribe link a publish-time requirement
  (like the lead-form-block rule), or only provided by the starter template
  with no enforcement? → A: Enforced at publish time — a `confirmation` page
  missing the unsubscribe-link placeholder cannot be published.
- Q: What `pageType` do the pages that already exist (all of them today's
  undifferentiated landing pages) get assigned? → A: `subscription`, for
  every existing page, as part of this feature's one-time migration — matches
  what they already are, so no existing page's behaviour changes.
- Q: (Scope) Is this a new spec or an addition to the already-completed
  003-post-launch-improvements? → A: A new spec (004), following the
  project's one-spec-per-unit-of-work convention.
- Q: Should page creation ask for type/template/domain up front (avoiding
  the "canvas shows the wrong preview until first save" nuance), and if so,
  is domain required at that point? → A: Yes — a guided step collects type,
  template, domain, path, and title before the block editor is shown.
  Domain (and path, paired with it) stay optional at this step, matching
  today's rule that domain/path are only required at publish time, not at
  creation.
- Q: Does the guided step replace the standard page-creation form, or
  coexist with it? → A: Coexists, but as a preliminary step the standard
  form is always reached through — not two independent, user-chosen entry
  points. Reaching the standard form directly still routes through the
  guided step first.
- Q: Is the title collected in the guided step, or left to a default set
  later? → A: Collected in the guided step, alongside type/template/domain/path.
- Q: Given domain is now chosen early, should a (domain, path) conflict
  with another existing page be caught at that point instead of only at
  publish time? → A: Yes — when both domain and path are provided in the
  guided step, the system checks whether any other page (draft or
  published) already uses that pair on that domain, and blocks proceeding
  if so. This is an early, advisory check; the existing publish-time
  uniqueness rule (published pages only, unchanged from 001) remains the
  final authority.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a content page with no lead-generation form (Priority: P1)

An editor builds a page that exists purely to inform or convert attention
elsewhere (e.g. a policy page, an about page, a campaign landing page that
links out rather than capturing leads) and publishes it without being forced
to add a form it doesn't want.

**Why this priority**: this is the problem that motivated the whole feature —
today's shared publish rule makes a formless page impossible to ship.

**Independent Test**: create a page, set its type to `free`, build content
with no lead-form block, publish it — succeeds. Add a lead-form block to a
`free` page and try to publish — rejected with a clear reason.

**Acceptance Scenarios**:

1. **Given** a new page set to type `free` with ordinary content blocks and
   no lead-form block, **When** the editor publishes it, **Then** it
   publishes successfully.
2. **Given** a `free` page that contains a lead-form block, **When** the
   editor tries to publish it, **Then** publishing is rejected with a reason
   naming the type/form conflict.

---

### User Story 2 - A confirmation page always carries the unsubscribe link and is never itself a submission target (Priority: P1)

An editor builds the page a visitor lands on after submitting a lead form.
The system guarantees it always shows a working unsubscribe link once
published, and guarantees it can never accidentally be turned into a
lead-capture page itself.

**Why this priority**: closes 003's known edge case (a confirmation page
that also has a lead-form block could create a submission loop) with an
enforced rule instead of an unenforced assumption, and guarantees the one
piece of content (the unsubscribe link) GDPR-conscious visitors need on this
page can never be silently dropped and published anyway.

**Independent Test**: create a page, set its type to `confirmation`, remove
the unsubscribe-link placeholder from its content, try to publish — rejected.
Add a lead-form block to a `confirmation` page, try to publish — rejected.
Restore the placeholder and remove the lead-form block — publishes.

**Acceptance Scenarios**:

1. **Given** a `confirmation`-type page whose content includes the
   unsubscribe-link placeholder and no lead-form block, **When** the editor
   publishes it, **Then** it publishes successfully.
2. **Given** a `confirmation`-type page whose content does not include the
   unsubscribe-link placeholder, **When** the editor tries to publish it,
   **Then** publishing is rejected with a reason naming the missing link.
3. **Given** a `confirmation`-type page that contains a lead-form block,
   **When** the editor tries to publish it, **Then** publishing is rejected
   with a reason naming the type/form conflict.

---

### User Story 3 - New pages start from a template matching their type (Priority: P2)

An editor creating a new page picks its type and the block editor opens
already populated with a starting layout appropriate to that type, rather
than either a blank canvas or a layout meant for a different purpose.

**Why this priority**: quality-of-life; it also means a page created and
published unedited already satisfies that type's publish rules, so the
feature is self-consistent out of the box.

**Independent Test**: create a page of each type in turn; confirm the block
editor opens with type-appropriate starting content each time (a
subscription starter includes a lead-form block; a free starter does not; a
confirmation starter already includes the unsubscribe-link placeholder and no
lead-form block); confirm each publishes successfully unedited.

**Acceptance Scenarios**:

1. **Given** an editor creates a new page and sets its type to
   `subscription`, **When** the block editor first opens, **Then** it already
   contains a starter layout with one lead-form block (unchanged from
   003-post-launch-improvements).
2. **Given** an editor creates a new page and sets its type to `free`,
   **When** the block editor first opens, **Then** it already contains a
   starter layout with no lead-form block, and the page publishes
   successfully unedited.
3. **Given** an editor creates a new page and sets its type to
   `confirmation`, **When** the block editor first opens, **Then** it already
   contains a starter layout that includes the unsubscribe-link placeholder
   and no lead-form block, and the page publishes successfully unedited.
4. **Given** any of the above starter layouts, **When** the editor edits,
   removes, or adds blocks, **Then** it behaves exactly like a page built
   from scratch — nothing about it is locked or special-cased (unchanged
   principle from 003-post-launch-improvements).

---

### User Story 4 - A guided creation flow avoids wasted work and a lagging preview (Priority: P2)

An editor creating a new page is guided through choosing its type, starter
template, domain, path, and title up front. A domain+path already used by
another page is flagged immediately, before any content is built. The block
editor then opens already showing the chosen type's starter — no extra save
needed to see it.

**Why this priority**: turns User Story 3's type-matched starters into a
smooth single flow (removing the "canvas shows the wrong preview until the
first save" nuance that a type-only, no-upfront-choice flow would have), and
prevents an editor from investing time in content that would later collide
with another page's path at publish time.

**Independent Test**: start creating a new page — land in the guided step,
not directly in a blank/default form. Enter a domain+path already used by
another page (draft or published) — blocked with a clear message. Enter a
non-conflicting domain+path (or leave both blank), complete the step — the
block editor opens already showing the chosen type's starter content.

**Acceptance Scenarios**:

1. **Given** an editor starts creating a new page through the normal entry
   point, **When** the admin loads, **Then** they are guided through
   choosing type, template, domain, path, and title before reaching the
   block editor.
2. **Given** an editor in the guided step enters a domain and path already
   used by another existing page (draft or published), **When** they try to
   proceed, **Then** they see a clear conflict message and cannot continue
   until they change the domain or path.
3. **Given** an editor completes the guided step with a non-conflicting
   domain+path (or leaves domain/path blank, deferring them to later),
   **When** the block editor opens, **Then** it already shows the starter
   template matching the chosen type, with no additional save needed to see
   it.
4. **Given** an editor reaches the page-creation form directly rather than
   through the guided step, **When** the admin loads, **Then** they are
   routed through the guided step first.

---

### Edge Cases

- A page's type MUST be changeable after creation via the normal edit form
  (an editor who picked the wrong type at creation is not stuck); changing
  type never rewrites or removes existing content — it only changes which
  publish rules apply to that page from then on.
- Changing an already-published page's type to one whose rules its current
  content no longer satisfies (e.g. a published `subscription` page
  retyped to `free` while still containing a lead-form block) must not
  silently leave a broken or inconsistent published page — the next attempt
  to save/publish it surfaces the conflict the same way any other
  publish-guard failure does.
- The one-time migration that assigns `subscription` to every pre-existing
  page must not alter any of those pages' content, domain, path, or
  published status — only the new type field is set.
- `pageType` must never appear anywhere in the renderer's public output or
  in any data the renderer exposes to a visitor, regardless of page type.
- The guided step's domain+path conflict check (User Story 4) is a
  point-in-time check — if a colliding page is created by someone else
  between that check and the new page's own creation, the guided step does
  not guarantee catching it; the existing publish-time uniqueness rule is
  what actually prevents two published pages from ever colliding, and stays
  authoritative regardless of what the guided step reported.
- Leaving domain and path blank in the guided step is allowed (they're set
  later, as today) — the conflict check simply does not run when either is
  absent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support exactly three page types —
  `subscription`, `free`, `confirmation` — as an internal, editor-facing
  classification with no public visibility.
- **FR-002**: `pageType` MUST NOT appear in the renderer's public output or
  in any data the renderer exposes to a visitor, and MUST have no effect on
  how a domain + path resolves to a page.
- **FR-003**: A `subscription`-type page MUST satisfy the existing publish
  requirements (exactly one lead-form block, a fully configured form) to be
  published — unchanged from 001/003.
- **FR-004**: A `free`-type page MUST NOT be publishable while it contains a
  lead-form block; the system MUST reject the attempt with a reason naming
  the conflict.
- **FR-005**: A `confirmation`-type page MUST NOT be publishable while it
  contains a lead-form block; rejected the same way as FR-004.
- **FR-006**: A `confirmation`-type page MUST NOT be publishable unless its
  content includes the unsubscribe-link placeholder; the system MUST reject
  the attempt with a reason naming the missing link.
- **FR-007**: A `free`-type page has no lead-generation-form configuration
  requirements to publish (the form-field/consent-text rules that apply to
  `subscription` pages do not apply here).
- **FR-008**: Creating a new page MUST initialise its block-editor content
  from a starter template matching the page's selected type, never a blank
  canvas, for all three types.
- **FR-009**: Each type's starter template MUST itself satisfy that type's
  publish requirements, so a newly created, unedited page of any type can be
  published immediately.
- **FR-010**: Starter template content MUST remain fully editable —
  removable, replaceable, extendable — with no special locked state, for all
  three types (unchanged principle from 003-post-launch-improvements).
- **FR-011**: Every page that existed before this feature MUST be assigned
  `pageType: subscription` as part of a one-time migration, with no other
  change to its content, domain, path, or publish status.
- **FR-012**: A newly created page MUST default to `pageType: subscription`
  unless the editor changes it before saving.
- **FR-013**: An editor MUST be able to change an existing page's type at any
  time via the normal edit form; changing type MUST NOT alter the page's
  existing content — it only changes which publish requirements apply from
  that point on.
- **FR-014**: Reaching the page-creation entry point MUST present a guided
  step collecting page type, starter template, domain, path, and title
  before the block editor is shown; domain and path MAY be left blank
  (deferred to later editing, per today's rules).
- **FR-015**: When both domain and path are provided in the guided step, the
  system MUST check whether any other existing page — draft or published —
  already uses that (domain, path) pair, and MUST block proceeding with a
  clear message if so.
- **FR-016**: Completing the guided step successfully MUST result in a new
  page whose block editor already reflects the chosen type's starter
  template on first display, with no extra save required to see it.
- **FR-017**: Reaching the page-creation form without having gone through the
  guided step (e.g. a direct link) MUST route through the guided step first,
  not bypass it.
- **FR-018**: The guided step's domain+path conflict check (FR-015) is
  advisory and point-in-time — it does not replace, weaken, or duplicate the
  existing publish-time uniqueness rule (published pages only, unchanged
  from 001), which remains the sole final authority preventing two published
  pages from colliding.

### Key Entities

- **Page (`pageType`)**: the existing `pages` collection (from 001,
  extended in 003 with `confirmationPage`) gains a required field, one of
  `subscription` / `free` / `confirmation`. No new collection; every page
  remains one ordinary `Page` document regardless of type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An editor can create, build, and publish a `free`-type page
  containing no lead-form block with zero lead-generation-related validation
  errors.
- **SC-002**: 100% of attempts to publish a `confirmation`-type page missing
  the unsubscribe-link placeholder are rejected with a reason identifying the
  missing link.
- **SC-003**: 100% of attempts to publish a `free`- or `confirmation`-type
  page that contains a lead-form block are rejected with a reason identifying
  the type/form conflict.
- **SC-004**: Creating a page of any of the three types and publishing it
  immediately, unedited, succeeds 100% of the time.
- **SC-005**: Every page that existed before this feature renders identically
  on the public site after the migration — zero behavioural regressions
  attributable to the type backfill.
- **SC-006**: `pageType` appears in 0% of responses the renderer serves to a
  visitor, across every page type.
- **SC-007**: 100% of attempts to complete the guided creation step with a
  domain+path already used by another page (draft or published) are blocked
  before a new page document is created.
- **SC-008**: A page created through the guided step shows its
  type-appropriate starter template on the very first display of the block
  editor — zero additional saves needed to see the correct content.

## Assumptions

- `confirmation`-type pages forbid a lead-form block for the same reason
  `free` pages do (FR-005/FR-004) — this also permanently closes
  003-post-launch-improvements' "a confirmation page could itself become a
  submission target and create a loop" edge case with an enforced rule
  instead of leaving it as an unenforced convention. Not explicitly asked;
  inferred as the consistent extension of the `free`-type decision.
- The unsubscribe-link placeholder check (FR-006) is a plain presence check
  on the page's content (the same placeholder token 003's confirmation
  rendering already substitutes), not a semantic check that the link is
  well-placed or styled.
- Reclassifying a single existing page's type is an ordinary edit to that
  page's own document via the normal edit form; no dedicated bulk
  reclassification screen is in scope (per Clarifications).
- `pageType` requires no new redaction/stripping logic to satisfy FR-002: the
  renderer already only ever reads the specific fields it requests for public
  rendering (title, path, builder, form, seo) — not adding `pageType` to that
  read surface is sufficient.
- No new user-facing terminology is needed for `free`/`subscription`/
  `confirmation` beyond plain, editor-facing labels in the admin — these are
  authoring concepts, not public product vocabulary.
- Each type currently has exactly one starter template; the guided step's
  template choice is a selector over a list that today always has one entry
  per type, not a hard-coded 1:1 assumption — future work may add more
  templates per type without changing this spec's shape (out of scope to
  build now, just not precluded).
- The guided step's own screen is itself internal/editor-facing tooling,
  not a new public-facing concept — the templates/types it offers are the
  same ones already defined by this spec.
