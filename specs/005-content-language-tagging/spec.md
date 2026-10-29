# Feature Specification: Content language tagging

**Feature Branch**: `005-content-language-tagging`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Mise en place du multilangue : Taguer la langue
sur les différentes pages et transmettre en metadata la langue utilisée lors
de la capture du lead. Il faut donc prévoir que chaque contenu soit identifié
avec une langue : pages, formulaires, messages, emails, leads..."

## Context

This is the foundation feature for a broader multilingual effort. It
establishes *what language a page is in* and makes sure that fact survives
into every lead captured from it. It deliberately does not do translation,
per-language rendering, or localized content variants — those are separate,
later features (starting with a lead-confirmation email, tracked
separately) that will consume the language this feature records rather than
invent their own.

A lead-capture form and a page's on-page messages (success message, consent
text, etc.) live inside the page's own content (GrapesJS blocks and page
fields) — they are not separate content items with a life of their own, so
they do not get an independent language tag; they inherit the page's.

## Clarifications

### Session 2026-09-13

- Q: Which languages need to be available at launch? → A: fr, en, es, de.
- Q: How should the supported-language list be modeled? → A: A dedicated,
  admin-manageable collection (not a fixed code-level list) — adding a
  language later is an admin task, not a deployment.
- Q: If a page is created under a domain with no default language and the
  editor picks none, what happens? → A: Block the save — a language must
  always be chosen explicitly when there's no domain default.
- Q: Once a page's assigned language is deactivated in the Languages list,
  can that page keep being saved/published without the editor switching
  language? → A: Yes, indefinitely — deactivation only removes a language
  from future selection; it never re-validates content that already uses
  it.
- Q: What happens if someone tries to deactivate the last remaining active
  language? → A: The system prevents it — at least one active language must
  always remain, so page creation never becomes impossible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintain the list of supported languages (Priority: P1)

An administrator manages which languages are available for tagging content —
adding a new one, relabeling one, or retiring one — without needing a code
change or a deployment.

**Why this priority**: Every other story depends on a language actually
existing to select. It's also the smallest possible independently-shippable
slice: a working language registry has value (it's ready to be pointed at)
even before anything else consumes it.

**Independent Test**: Can be fully tested by creating, editing, and
deactivating a language entry in the admin and confirming the change is
immediately reflected, with no other feature in place yet.

**Acceptance Scenarios**:

1. **Given** the admin, **When** an administrator adds a new language with a
   code and a label, **Then** it becomes available for selection elsewhere.
2. **Given** an existing language already used by some pages, **When** an
   administrator deactivates it, **Then** it disappears from selection for
   *new* content but every page/lead already tagged with it is unaffected —
   those pages keep saving and publishing normally, indefinitely, without
   ever being forced to switch language.
3. **Given** a language code that already exists, **When** an administrator
   tries to add it again, **Then** the system rejects the duplicate.
4. **Given** exactly one active language remains, **When** an administrator
   tries to deactivate it, **Then** the system prevents the action — at
   least one active language must always remain available.

---

### User Story 2 - Tag every page with a language (Priority: P1)

An editor sets the language of a page — on creation and, if needed, later —
so the page's language is always known and unambiguous.

**Why this priority**: This is the core of the request: every page needs an
explicit language identity. Nothing downstream (lead capture, future
localized content) is possible without it.

**Independent Test**: Can be fully tested by creating a page, confirming it
requires a language before it can be published, and confirming existing
pages (from before this feature) have been given one automatically.

**Acceptance Scenarios**:

1. **Given** a new page being created under a domain with no default
   language configured, **When** the editor tries to save it without
   picking a language, **Then** the save is blocked until a language is
   explicitly chosen — never leaves the page without one.
2. **Given** a page assigned to a domain with a default language configured,
   **When** the editor creates a new page under that domain, **Then** the
   page's language is pre-filled with the domain's default (still
   changeable before saving).
3. **Given** a page that already existed before this feature shipped,
   **When** this feature ships, **Then** the page has a language value (per
   the migration default) and every other field is unchanged.
4. **Given** a published page whose language is edited afterward, **When**
   the change is saved, **Then** only the page's own tag changes — leads
   already captured from it keep the language they were captured with (see
   User Story 3).

---

### User Story 3 - Stamp every captured lead with its language (Priority: P1)

When a visitor submits a lead-capture form, the resulting lead record
automatically carries the language of the page they submitted it from — no
extra input from the visitor, no extra step for staff.

**Why this priority**: This is the other half of the original ask
("transmettre en metadata la langue utilisée lors de la capture du lead")
and the reason the feature exists — it's what lets a later feature (e.g. a
localized confirmation email) know which language to use, and lets staff
segment leads by language today.

**Independent Test**: Can be fully tested by submitting the lead form on a
page tagged with a given language and confirming the resulting lead record
carries that exact language, unprompted and without any visible change to
the submission flow.

**Acceptance Scenarios**:

1. **Given** a published page tagged `en`, **When** a visitor submits its
   lead form, **Then** the created lead is recorded with language `en`.
2. **Given** a lead already captured with language `en`, **When** the source
   page's language is later changed to `fr`, **Then** the lead still shows
   language `en`. (A page can never actually be deleted while it still has
   leads — see Edge Cases — so this guarantee's "page deleted" half holds
   vacuously: by the time a page is deletable, nothing captured from it
   remains to protect.)
3. **Given** a lead record, **When** staff view it in the admin or export
   leads to CSV, **Then** its language is visible/included.

---

### User Story 4 - Give a domain a default language (Priority: P2)

An administrator sets a default language on a domain, so pages created
under a single-language domain don't need the language picked by hand every
time.

**Why this priority**: A convenience that removes repetitive, error-prone
manual selection once a domain is effectively single-market — valuable, but
the feature is already complete and correct without it (editors can always
pick the language by hand).

**Independent Test**: Can be fully tested by setting a domain's default
language, creating a page under it, and confirming the page's language was
pre-filled — independent of every other story except needing a language to
point at.

**Acceptance Scenarios**:

1. **Given** a domain with no default language set, **When** a page is
   created under it, **Then** no language is pre-filled (falls back to User
   Story 2's default behavior).
2. **Given** a domain's default language is changed, **When** existing pages
   under that domain are viewed, **Then** their own language tags are
   unaffected — only future page creation is.

---

### User Story 5 - Filter and export leads by language (Priority: P2)

Staff reviewing leads can filter the leads list by language and see language
as a column in list view and CSV export, so language-based segmentation and
reporting don't require manually cross-referencing each lead's page.

**Why this priority**: Makes the data captured in User Story 3 actually
usable day to day; not needed for the data to exist and be correct.

**Independent Test**: Can be fully tested by filtering the existing leads
list by a language value and confirming only matching leads appear, and by
exporting and confirming the language column is present.

**Acceptance Scenarios**:

1. **Given** leads in more than one language, **When** staff filter the
   list by a language, **Then** only leads captured in that language are
   shown.
2. **Given** a CSV export of leads, **When** it is opened, **Then** each row
   includes the language the lead was captured in.

---

### Edge Cases

- A language is deactivated while pages/leads still reference it: those
  pages keep rendering and those leads keep their value; only new selection
  is blocked (User Story 1, Scenario 2).
- A page's language is changed after it has already produced leads: past
  leads are unaffected (User Story 3, Scenario 2).
- A page still has leads pointing at it: it cannot be deleted at all (found
  during this feature's own verification — pre-existing, unrelated to
  language, fixed alongside it: `leads.page` is required and a page's
  deletion was supposed to leave its leads orphaned but pointing-at-nothing
  was never actually possible at the database level; resolved by blocking
  the deletion instead, until no lead references the page any more, per the
  operator's direction). This makes the language-survives-deletion question
  moot — a page with a lead attached is never in a deletable state to begin
  with.
- Two languages entered with the same code: the second is rejected (User
  Story 1, Scenario 3).
- A domain's default language is removed or changed: only future page
  creation under it is affected, not existing pages (User Story 4, Scenario
  2).
- Pre-existing pages and leads at the moment this feature ships: every one
  of them ends up with an explicit language value, not a blank/null one
  (User Story 2, Scenario 3), and nothing else about them changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an administrator maintain a list of
  supported languages, each with a unique code and a human-readable label,
  without requiring a code change or deployment to add, relabel, or retire
  one.
- **FR-002**: The system MUST be seeded, at launch, with four supported
  languages: French (fr), English (en), Spanish (es), German (de).
- **FR-003**: The system MUST reject an attempt to add a language whose code
  duplicates an existing one.
- **FR-004**: Retiring (deactivating) a language MUST remove it from
  selection for new content going forward, and MUST NOT alter, invalidate,
  or re-validate any page or lead that already references it — such a page
  MUST continue to save and publish normally, indefinitely, without ever
  being forced to switch to an active language.
- **FR-004a**: The system MUST prevent deactivating the last remaining
  active language — at least one active language MUST always be available
  for selection.
- **FR-005**: Every page MUST have exactly one explicit language, chosen
  only from the currently active supported languages; a page MUST NOT be
  publishable without one.
- **FR-006**: A domain MAY have a default language; when set, it MUST
  pre-fill the language of a page newly created under that domain (the
  editor may still change it before saving). When no domain default
  applies, saving a new page without an explicitly chosen language MUST be
  blocked — the system MUST NOT silently apply a system-wide default.
- **FR-007**: Every lead created by a form submission MUST be stamped, at
  the moment of submission, with the language of the page it was submitted
  from — with no additional input required from the visitor and no change
  to the submission flow they experience.
- **FR-008**: A lead's recorded language MUST be fixed at capture time: it
  MUST NOT change afterward if the source page's language is later edited,
  or if the source page is deleted.
- **FR-009**: Staff MUST be able to see a lead's language in the admin list
  and detail views, and filter the leads list by language.
- **FR-010**: A lead's language MUST be included as a column in the leads
  CSV export.
- **FR-011**: Every page and lead that exists at the moment this feature
  ships MUST end up with an explicit language value — none may be left
  without one — and no other field on those existing records may change as
  a result.
- **FR-012**: Setting or changing a page's language is a tagging operation
  only in this feature: it MUST NOT alter how the page is rendered, what
  copy it shows, or trigger any translation/localization behavior. Actual
  per-language content variants (translated page copy, a localized
  confirmation email, etc.) are out of scope here and belong to later
  features that will read this tag.

### Key Entities

- **Language**: A supported language available for tagging content — a
  unique code, a display label, and whether it's currently available for
  new selections (retiring one keeps it valid on whatever already
  references it).
- **Page** *(existing entity, extended)*: Gains a single, required language,
  drawn from the active Languages.
- **Domain** *(existing entity, extended)*: Gains an optional default
  language, used only to pre-fill new pages created under it.
- **Lead** *(existing entity, extended)*: Gains a language, captured
  automatically at submission time from the source page and frozen
  thereafter — never edited by staff, never recomputed from the page later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of pages — pre-existing and newly created — have exactly
  one explicit language value; none are left blank.
- **SC-002**: 100% of leads captured after launch carry a language value
  automatically, with zero additional fields or steps added to the
  visitor-facing submission flow.
- **SC-003**: Staff can produce a language-segmented view of leads (filter
  the list, or export to CSV) without manually cross-referencing each
  lead's source page.
- **SC-004**: Adding a new supported language is achievable by an
  administrator the same day, with no code deployment involved.
- **SC-005**: Every page and lead that existed before this feature shipped
  keeps every other field byte-for-byte unchanged after the migration that
  adds language.

## Assumptions

- Lead-capture forms and a page's on-page messages (success message,
  consent/privacy text, etc.) are part of the page's own content and are
  not independently tagged — they inherit the page's language, per the
  Context section.
- Pre-existing pages and leads default to French (`fr`) at migration time —
  the current production domain (`example.com`) is
  French-market-only today, matching the admin's existing French fallback
  locale.
- A page's language is a single, exclusive value (a page is not tagged as
  "available in multiple languages" — a multi-language page is modeled, if
  ever needed, as separate pages linked together, which is out of scope
  here).
- This feature does not add any language switcher, translated UI string, or
  per-language rendering behavior on the public site — it only records the
  language, for later features to act on.
- The confirmation-email feature (tracked separately) is the first intended
  consumer of the language recorded here, but is not part of this feature.
