# Feature Specification: Bilingual admin (French / English)

**Feature Branch**: `023-admin-i18n`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: « Lançons la feature 023-admin-i18n : rendre l'interface d'administration de Trefle bilingue FR/EN. » Starting point: the 2026-10-28 finding that the admin is a French/English mix, and the slices proposed then (declare the languages + per-member choice → field labels → admin screens → server and import messages).

## Context

Today the admin speaks two languages at once, and neither on purpose:

- The admin framework's own chrome (login page, list and edit screens, buttons
  such as « Save », « Create new », pagination, generic validation errors) is in
  **English**: French was meant to be the default but was never actually
  enabled.
- Everything Trefle adds is in **French**: collection and field names, help
  texts, the custom screens (Pages Stats, A/B verdicts, imports, Settings tabs,
  member avatar and time zone pickers), the page editor's panels and block
  names, messages returned when a save or an import fails, and import reports.

The public repository makes Trefle usable by people who do not read French,
and the current French editors see English buttons next to French labels. This
feature makes the whole admin speak **one language at a time**, French or
English, chosen per installation and per member.

A second, smaller axis is added (decided 2026-10-28): the texts Trefle itself
shows to **visitors** of published pages. Their language follows the page,
not a member. The cookie banner and legal pages already do (021, banner
translations); the remaining built-in visitor texts (form validation and
result pages, e-mail confirmation and unsubscribe pages, error pages, the
audience-measurement page, carousel controls) are still French-only and are
covered by US6. Trefle's French public paths (`/confidentialite`,
`/mentions-legales`, `/mesure-audience`) become English, with permanent
redirects from the old ones (US7).

Estimated volume (2026-10-28 inventory): ~600–800 strings — ~210 field labels
and help texts, ~25 custom admin screens and widgets, ~50 server messages,
~40 import-report messages, the page editor's own strings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The admin framework's own screens follow one chosen language (Priority: P1)

An administrator sets the installation's admin language to French or English
in Settings. From then on the login page, the menus, list and edit screens,
buttons, pagination, confirmation dialogs and the framework's generic messages
are in that language, for every member who has not chosen otherwise.

**Why this priority**: this is the visible half of today's mix and the
cheapest to fix; on its own it gives a fully French admin chrome to the current
users and a fully English one to an English-speaking installation.

**Independent Test**: with the installation language set to French, open the
login page and a collection list: every framework button and message is in
French. Switch the setting to English: within 30 seconds, reloading shows the
same screens in English. Trefle's own labels are untouched by this story.

**Acceptance Scenarios**:

1. **Given** the installation language is French, **When** a signed-out person
   opens the login page, **Then** the page declares French as its language and
   its labels, buttons and errors are in French.
2. **Given** the installation language is English, **When** a member opens any
   collection list, **Then** « Create new », filters, columns chooser,
   pagination and the delete confirmation are in English.
3. **Given** an existing production installation upgraded to this version,
   **When** nobody has touched the new setting, **Then** its admin language is
   French (today's intent for that installation), and no member's other
   settings changed.

---

### User Story 2 - Each member can choose their own admin language (Priority: P1)

A member opens their own account and picks « Français », « English », or
« Installation default ». Their admin switches to that language on the next
screen they open; other members are not affected.

**Why this priority**: an installation may be shared by French- and
English-speaking members (agency + international client). The same pattern
already exists for the display time zone (022 US6), so members find it where
they expect.

**Independent Test**: two members on an installation set to French; the
second picks English. Signed in as the first, the admin is French; signed in as
the second, it is English; the installation setting is unchanged.

**Acceptance Scenarios**:

1. **Given** a member with no personal choice, **When** they sign in, **Then**
   the admin is in the installation language.
2. **Given** a member who chose English on a French installation, **When**
   they save the choice, **Then** the admin is in English from the next screen
   without signing out, and stays English on their next sign-in.
3. **Given** a member who chose English, **When** an administrator changes the
   installation language, **Then** that member's admin stays English, while
   members without a choice follow the new language within 30 seconds.
4. **Given** a signed-out person on the login page, **Then** the page uses the
   installation language (no member is known yet).

---

### User Story 3 - Trefle's own labels and screens are translated (Priority: P2)

Every name and help text Trefle adds — menu groups, collection names, field
labels, descriptions, select options, tab names, column headers — and every
custom admin screen (Pages Stats, A/B experiments and verdicts, imports,
Settings, legal pages, members, avatar and time zone pickers, dashboard
widgets) appear in the member's admin language.

**Why this priority**: with US1–US2 alone, an English admin still shows French
field labels; this story makes the English admin genuinely usable. It is
larger, so it can ship by group of screens.

**Independent Test**: as a member whose admin is English, walk through every
menu entry and open one document of each collection: no French label, help
text, option or button remains (editor-authored content excepted, FR-012).
Repeat in French: no English text remains other than the explicit exceptions
of FR-013.

**Acceptance Scenarios**:

1. **Given** an English admin, **When** the member opens Reports → Pages
   Stats, **Then** the column headers, period picker, empty state, chart
   labels and export button are in English.
2. **Given** an English admin, **When** the member opens an A/B experiment,
   **Then** the verdict sentence (significance, winner, « keep waiting ») is
   in English with the same numbers as in French.
3. **Given** a French admin, **When** the member opens Settings, **Then** the
   tabs and fields read exactly as today.

---

### User Story 4 - The page editor speaks the member's language (Priority: P2)

Inside the page editor, the panels, toolbar tooltips, block categories and
block names, style and trait labels, the code view and its messages, and
« Replace everywhere » dialogs follow the member's admin language.

**Why this priority**: editing pages is the core daily task; an English editor
inside an otherwise English admin is expected, but it is a distinct surface
with its own strings.

**Independent Test**: as an English-admin member, open a page in the editor:
every panel, block name and tooltip is in English; insert a block and edit a
text — the page's content itself is unchanged.

**Acceptance Scenarios**:

1. **Given** an English admin, **When** the member opens « Open Blocks »,
   **Then** categories and block names are in English.
2. **Given** a page built by a French-admin member, **When** an English-admin
   member opens it, **Then** the page content, classes and structure are
   identical; only the editor's interface differs.

---

### User Story 5 - Messages from the server and import reports are in the member's language (Priority: P3)

When a save is refused (validation, permission, conflict), when an import
finishes or fails, or when an action reports a result, the message the member
reads is in their admin language.

**Why this priority**: these are fewer and seen less often than labels, but an
error in a language the member does not read blocks them exactly when they
need help.

**Independent Test**: as an English-admin member, trigger a known refused
save (e.g. a duplicate page path) and run an import with a known warning: both
messages are in English and say the same thing as their French versions.

**Acceptance Scenarios**:

1. **Given** an English admin, **When** a page save is refused because its
   path is already used, **Then** the message is in English and names the
   conflicting path.
2. **Given** an import run by a French-admin member, **When** an English-admin
   member opens its report, **Then** every line Trefle itself writes
   (headings, counts, error and check messages) is in English, and the lines
   written by the AI conversion are shown as written, in French (FR-013).
3. **Given** an import report created before this feature, **When** any member
   opens it, **Then** it shows as it was written (French), never an empty or
   broken report.

---

### User Story 6 - Built-in visitor texts follow the page's language (Priority: P3)

A visitor on an English page submits the lead form with a wrong phone number,
then succeeds: the validation message and the « thank you » page are in
English. The confirmation and unsubscribe links in their e-mail open pages in
English; the carousel's pause and slide buttons are announced in English; an
error page, should one appear, is in English. French pages behave exactly as
today.

**Why this priority**: today an English page built in Trefle answers its
visitors in French at the most sensitive moments (form errors, consent
withdrawal), which an international installation cannot ship. It is
independent of the admin stories and touches a small set of texts.

**Independent Test**: publish the same page in French and in English; on the
English one, trigger each built-in visitor text (invalid field, success, rate
limit, confirm link, unsubscribe link, carousel controls, error page,
audience-measurement page): all are in English; on the French one, all read
as today.

**Acceptance Scenarios**:

1. **Given** an English page with a phone field, **When** a visitor submits an
   invalid number, **Then** the message is in English and names the field with
   its label as written by the editor.
2. **Given** a lead captured on an English page, **When** the visitor opens
   the unsubscribe link of their e-mail, **Then** the page and its result are
   in English.
3. **Given** a page in a language with no built-in translation (e.g. Spanish),
   **When** a built-in visitor text is shown, **Then** it is in English, and
   the page declares that text's language for assistive technologies.
4. **Given** a French page, **When** any built-in visitor text is shown,
   **Then** its wording is unchanged from today.

---

### User Story 7 - Trefle's public paths are in English (Priority: P3)

Trefle's built-in public pages are served at English paths on every domain:
`/privacy` (privacy policy), `/legal-notice` (legal notice) and
`/audience-measurement` (audience-measurement page), instead of
`/confidentialite`, `/mentions-legales` and `/mesure-audience`. Every link
Trefle produces — page footers, the lead form's privacy link, legal texts,
the A/B notice, default settings, documentation — uses the new paths. The old
paths redirect permanently to the new ones, so nothing already published or
sent breaks.

**Why this priority**: an international installation should not expose French
words in its URLs (decided 2026-10-28, after the first draft kept them). The
other built-in paths (`/confirm`, `/confirmation`, `/unsubscribe`,
`/form-retry`) are already English, so after this story every Trefle path is.

**Independent Test**: on a domain, open the footer links of a published page
and the lead form's privacy link: they go to `/privacy` and `/legal-notice`;
open `/confidentialite?lang=en`, `/mentions-legales` and `/mesure-audience`:
each lands permanently on its English path with the query kept, with the same
content as before.

**Acceptance Scenarios**:

1. **Given** a published page on any domain, **When** it is rendered, **Then**
   its legal links point to `/privacy` and `/legal-notice` (or to the owner's
   own addresses when set).
2. **Given** a visitor following an old link `/confidentialite?lang=en`,
   **When** they open it, **Then** they land on `/privacy?lang=en` through a
   permanent redirect.
3. **Given** an editor creating a page at `/privacy` or `/legal-notice`,
   **When** they save, **Then** the save is refused as today for the old
   paths, with a message naming the reserved path; the old paths stay
   reserved too.
4. **Given** the default legal texts never edited on an installation, **When**
   it is upgraded, **Then** their links use the new paths; texts a user has
   edited are left untouched and their old links keep working through the
   redirect.

---

### Edge Cases

- Import report lines written by the AI conversion (what was simplified or
  left out, section names) are written once, in the admin language of the
  member who launched the import; a reader in the other language sees those
  lines as written, while the lines Trefle itself writes follow the reader
  (FR-013 exception, research R7).
- A string exists in one language only (forgotten translation): the admin shows
  the other language's text, never a raw key or an empty label; an automated
  check flags the gap before release (FR-010).
- A member's saved choice refers to a language later removed from the
  installation: they get the installation language.
- The installation setting is empty or invalid: the admin uses the
  fresh-install default (FR-003).
- Two browser tabs open when the member changes language: the other tab
  switches at its next navigation; no data is lost.
- Dates, numbers, percentages and amounts (Pages Stats, A/B, import budget in
  euros) follow the admin language's conventions (e.g. « 1 234,5 % » vs
  « 1,234.5% »), still in the member's display time zone (022 US6).
- Exports (Pages Stats, leads): column headers follow the exporting member's
  language; values (dates in ISO form, numbers without grouping) stay the same
  in both languages so files from two members can be combined.
- Activity log entries already written keep their original text; new entries
  are shown in the reader's language where they are system-generated.
- The two-factor screen and authenticator setup texts follow the language;
  the issuer name shown in the authenticator app does not change (022).
- Editor-authored text (page titles, domain names, opt-in e-mail bodies,
  language names entered in Languages, A/B variant names) is never translated.
- Visitor pages reached without a page context (confirm/unsubscribe links,
  an error before the page is known): they use the language of the page the
  lead came from when known, else the domain's default page language, else
  English.
- An editor-entered success message on a page (already per page) keeps
  priority over the built-in « thank you » text.
- A link to an old French path (in a stored text, a page, an e-mail already
  sent, a search engine, a bookmark) keeps working: it lands permanently on the
  English path with the same query (e.g. `?lang=en`) (US7).
- A domain whose owner publishes their own privacy policy or legal notice
  elsewhere: both the old and the new path go to that address, as the old
  path does today.
- An editor page already published at one of the new paths on some domain:
  the change is refused for that domain until the conflict is resolved, and
  the upgrade reports it; no published page is silently hidden.

## Requirements *(mandatory)*

### Functional Requirements

**Language choice**

- **FR-001**: The admin MUST offer exactly two languages, French and English,
  and be built so that adding a third later means supplying its translations,
  not changing screens.
- **FR-002**: Settings MUST hold an installation admin language, editable by
  administrators only.
- **FR-003**: A fresh installation's admin language MUST default to English
  (decided 2026-10-28: the public repository is international). An existing
  installation upgraded to this version MUST get French, and the upgrade MUST
  NOT change any value a user has set.
- **FR-004**: Each member MUST be able to choose, on their own account,
  « Installation default », « Français » or « English » (decided 2026-10-28).
  The choice is personal: only that member and administrators can change it.
- **FR-005**: The effective language MUST be: the member's choice if set and
  available, else the installation language, else the fresh-install default.
  Signed-out screens (login, password reset, two-factor) use the installation
  language.
- **FR-006**: A change of language MUST take effect from the next screen the
  member opens, without signing out.

**Coverage**

- **FR-007**: The admin framework's own interface MUST be shown in the
  effective language (US1).
- **FR-008**: Every Trefle label, description, option, tab, menu group, column
  header, custom screen, widget, empty/loading/error state, and the page
  editor's interface MUST be shown in the effective language (US3, US4).
- **FR-009**: Messages produced by the server for the member (refused saves,
  permission errors, action results, import and site-import reports) MUST be
  shown in the reader's effective language. Reports MUST be stored in a form
  that can be shown in either language, except the lines written by the AI
  conversion (FR-013); reports stored before this feature
  are shown as written.
- **FR-010**: Every admin string MUST exist in both languages; an automated
  check MUST fail when one is missing. At run time a missing string falls back
  to the other language, never to a key or a blank.
- **FR-011**: Dates, numbers, percentages and currency amounts in the admin
  MUST be formatted per the effective language; exports keep
  language-independent values (Edge Cases).
- **FR-012**: Content written by people (page content, titles, names, e-mail
  texts, legal texts) MUST NOT be translated or altered.
- **FR-013**: Third-party texts Trefle does not own and cannot translate (e.g. a
  provider's own page or message shown verbatim) MAY stay in their language;
  each such exception MUST be listed in the plan. Import report lines written
  by the AI conversion are one such exception: they are in the launching
  member's admin language (Edge Cases).

**Behaviour preserved**

- **FR-014**: A French admin after this feature MUST read the same as today for
  every Trefle string (wording kept), with the framework chrome now in French
  too. Trefle strings that are English today (menu groups « Reports »,
  « Contents »…, « A/B experiments », « Draft »…) stay English in the French
  admin too (decided 2026-10-28): only their absence of translation is closed,
  not their wording.
- **FR-015**: Changing language MUST NOT change permissions, data, saved
  settings, page content, or published pages.
**Visitor texts** (decided 2026-10-28: in scope)

- **FR-016**: Every text Trefle itself shows to visitors — form validation
  messages, form result pages (thank you, retry, rate limit), e-mail
  confirmation and unsubscribe pages, error pages, the audience-measurement
  page, carousel controls and their accessible names, the lead form's
  privacy-link text, and the legal pages' fallback titles and « being
  written » notice — MUST exist in French and English and be shown in the
  page's language (US6).
- **FR-017**: For a page language with no built-in translation, visitor texts
  MUST be shown in English and marked with their own language for assistive
  technologies; for pages without a page context, the order of Edge Cases
  applies.
- **FR-018**: Texts already translated per page or per language by editors
  (cookie banner, legal texts, per-page success message, opt-in e-mails) keep
  their current behaviour and priority.
- **FR-019**: Visitor texts are covered by the same completeness check as
  admin strings (FR-010).

**Public paths** (decided 2026-10-28: English paths)

- **FR-020**: The privacy policy, legal notice and audience-measurement pages
  MUST be served at `/privacy`, `/legal-notice` and `/audience-measurement`
  on every domain, for every page language (the language stays a query or
  page setting, not a path).
- **FR-021**: The old paths `/confidentialite`, `/mentions-legales` and
  `/mesure-audience` MUST redirect permanently to their new path, keeping the
  query string, on every domain and with the edge cache on or off.
- **FR-022**: Every link, default value, help text, reserved-path rule, edge
  rule, seed, test and documentation page that names an old path MUST use the
  new one; after the change, the old paths appear only in the redirect rule,
  its tests and history (specs, changelog).
- **FR-023**: Both the new and the old paths MUST be reserved: an editor page
  cannot be published at any of them.
- **FR-024**: Upgrading MUST rewrite stored values only where they are still
  the untouched default (default legal texts, the default privacy-link
  setting); any value a user has set is kept and served through the redirect.
  The upgrade MUST list any existing editor page that occupies a new path.

### Key Entities

- **Installation admin language** (in Settings): the default language of the
  admin for the installation and its signed-out screens.
- **Member admin language** (on a member): optional personal choice; empty
  means « installation default ».
- **Admin string catalogue**: every admin text, keyed, with a French and an
  English version; the French version keeps today's wording.
- **Stored system message** (import reports, system activity entries): kept
  as a message identifier plus its values, so it can be shown in either
  language; older entries keep their literal text.
- **Visitor text catalogue**: the built-in visitor texts, keyed, in French
  (today's wording) and English, chosen by the page's language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member whose admin is English can complete the core tasks —
  sign in with two-factor, create and publish a page in the editor, run an
  import, read Pages Stats and an A/B verdict, export leads — without meeting
  a single French interface string (editor-authored content excepted).
- **SC-002**: The same walk-through in French meets no English interface
  string other than the exceptions listed under FR-013.
- **SC-003**: 100 % of admin strings exist in both languages, enforced by an
  automated check that runs with the other tests.
- **SC-004**: Switching language takes one save on the member's account and is
  visible on the next screen, in under 5 seconds, with no sign-out.
- **SC-005**: Upgrading the production installation changes no stored user
  setting (verified on a production-data copy), and its admin is French
  afterwards.
- **SC-006**: Existing automated tests keep passing; at least one end-to-end
  walk-through runs in each language.
- **SC-007**: On an English published page, a visitor meets no French text
  from Trefle across the whole lead journey (form errors, success, e-mail
  confirmation, unsubscribe), and French pages read exactly as before.
- **SC-008**: After release, no page Trefle generates links to an old French
  path, and 100 % of requests to an old path end on the matching English page
  in one redirect.
- **SC-009**: Published pages keep no serious or critical accessibility
  violation in either language, and their client code grows by no more than
  2 KB gzipped per page.

## Assumptions

- « Admin » means everything behind the admin login (and the login,
  password-reset and two-factor screens themselves), including the page editor.
- English wording is plain international English; dates in English use
  day-month-year order by default.
- Each story can be released on its own; until US3 ships, an English admin may
  still show French Trefle labels (acceptable intermediate state, French
  installations already better off after US1).
- The member-choice pattern, its location on the account screen and its
  « Installation default » option mirror the display time zone of 022 US6.
- No external translation service is used; translations are written and
  reviewed by the author.
- Trefle's documentation and the public repository's README are out of scope
  (already handled separately, docs-english).
- The admin access layer in front of the admin (e-mail code page of the edge
  provider) is a third-party screen and falls under FR-013.

## Dependencies

- 022 US6 (display time zone): same choice pattern and date formatting path.
- 019 (two-factor): its screens are part of the coverage.
- Public-release preparation (showcase clone plan): not blocked by this
  feature; an English admin makes the public repo more useful.
