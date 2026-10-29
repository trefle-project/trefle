# Feature Specification: Admin UX improvements (batch 1)

**Feature Branch**: `022-ux-improvement`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: « Dans la liste des améliorations d'UX je vais lister ici des améliorations possibles pour lesquelles nous préciserons les specs par la suite. » The list was collected in `backlog.md` (UX-01 → UX-11, 2026-10-22 → 2026-10-23), each item settled with the user as it was added, and closed on 2026-10-23. This spec turns it into one feature; `backlog.md` keeps the history of each decision.

## Context

Eleven small improvements, mostly to the admin, noticed while using Trefle in
production. They are shipped together because each is small, but every user
story below can be built, tested and released on its own.

Traceability — backlog item → user story:

| Backlog | Subject | Story |
|---|---|---|
| UX-10 | Pages Stats: totals per page over the period, daily/hourly chart | US1 |
| UX-09, UX-08, UX-07 | Left menu: groups, order, names, heading size, width | US2 |
| UX-06 | Settings → Default split into tabs | US2 |
| UX-05 | List search on several fields | US2 |
| UX-01 | Legal pages: no heading over an empty section | US3 |
| UX-02, UX-11 | Installation name, logo, menu icon, favicon, version footer | US4 |
| UX-03 | Tiled background with a random variant tile | US4 |
| UX-04 | Member avatars | US5 |
| (added at analysis, 2026-10-23) | Display time zone: installation default + per-member choice | US6 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pages Stats shows one row per page with its totals over the period (Priority: P1)

An editor opens Reports → Pages Stats, picks a period, and reads one row per
page with that page's total views, submissions and conversion rate over the
period. Clicking a row shows a chart of that page's views and submissions day
by day, or hour by hour for a short recent period. The totals can be exported.

**Why this priority**: today the list shows one row per page **and per day**,
so a 30-day period gives 30 rows for one page and no total; each row shows its
own technical ID, which is mistaken for a page ID. The report does not answer
the question it exists for.

**Independent Test**: With daily counts for two pages over several days, pick a
period: the list shows exactly two rows whose totals equal the sum of the days
in the period; the chart of one row shows one point per day; the export
contains the same totals.

**Acceptance Scenarios**:

1. **Given** page 19 has views on 30 days, **When** the editor picks those 30
   days, **Then** the list shows one row for page 19 with the sum of its views
   and submissions over the period.
2. **Given** no period has been picked, **When** the editor opens Pages Stats,
   **Then** the period is the last 30 days and rows are sorted by most views
   first.
3. **Given** a published page with no view in the period, **When** the list is
   shown, **Then** that page is listed with 0 views, 0 submissions.
4. **Given** the list, **When** the editor sorts by any column, **Then** rows are
   reordered by that column.
5. **Given** a row, **When** the editor clicks it, **Then** a chart shows that
   page's views and submissions for each day of the period.
6. **Given** a period within the last 90 days and no longer than 7 days,
   **When** the editor switches the chart to « Heure », **Then** it shows one
   point per hour; for a longer or older period, « Heure » is not offered.
7. **Given** the list for a period, **When** the editor exports it, **Then** a
   CSV file contains one line per page with the same columns and totals.
8. **Given** the list, **Then** no stats-row identifier is shown anywhere; the
   « ID page » column shows the page's own ID.

---

### User Story 2 - The admin is organised the way the team works (Priority: P2)

A member finds things where they expect them: the left menu groups pages by
purpose (Reports, Contents, Imports, Leads, Settings) in a fixed order, its
section headings stand out, and its width can be adjusted. Settings → Default
is split into tabs instead of one long page. A list's search bar finds a record
by any of its useful fields, not only one.

**Why this priority**: these are daily irritants (P2 « confusing ») that slow
every visit to the admin.

**Independent Test**: Log in as an Administrator: the menu shows the five
groups in order with the listed entries and names; dragging the menu edge
changes its width and the width is still there after logging in from another
browser; Settings → Default shows four tabs; searching Users by a member's name
finds them.

**Acceptance Scenarios**:

1. **Given** an Administrator, **When** the admin opens, **Then** the left menu
   shows, in this order:
   - **Reports**: Pages Stats, A/B experiments;
   - **Contents**: Domains, Pages, Media, Conf. emails, Legal Pages, Fonts;
   - **Imports**: Pages Import, Penpot Import;
   - **Leads**: its current entries except the legal page versions (moved to
     Contents as « Legal Pages »);
   - **Settings**: Users, Activity log, Languages, Default.
2. **Given** an entry was renamed (e.g. « Opt In Emails » → « Conf. emails »,
   the Settings page → « Default »), **When** a member opens it, **Then** its
   page title uses the new name and its existing address still works.
3. **Given** the menu, **Then** group headings are visibly larger than the
   entries under them (starting point: 16 px bold vs 14 px), in the light and
   dark themes.
4. **Given** the menu is open, **When** the member drags its right edge,
   **Then** the width changes within a minimum and a maximum; **When** they
   double-click the edge, **Then** the default width comes back.
5. **Given** a member set a width, **When** they log in again, on any device,
   **Then** the menu has that width; other members are not affected.
6. **Given** Settings → Default, **Then** it shows four tabs: « Général »,
   « Entités légales », « Textes légaux », « Consents default », with the
   fields placed as in FR-012; saving from any tab keeps the values of the
   other tabs.
7. **Given** a list with several searchable fields (e.g. Users: e-mail, name),
   **When** the member types a name, **Then** members whose name matches are
   listed, as well as those whose e-mail matches; the search box's hint names
   the fields searched.

---

### User Story 3 - Legal pages never show a heading over nothing (Priority: P2)

A visitor reading a domain's privacy policy or legal notice never sees a
section heading with nothing under it.

**Why this priority**: seen in production on 2026-10-22 on a domain whose owner
was not filled in yet (« Qui est responsable de vos données », « Éditeur du
site » with no text): it looks broken on a public, legally significant page.

**Independent Test**: On a domain with an empty owner identity, open the
privacy policy and the legal notice: no heading appears without content under
it; fill the owner: the headings come back with their content.

**Acceptance Scenarios**:

1. **Given** every block under a heading is left out because its values are
   empty, **When** a visitor opens the page, **Then** that heading is left out
   too.
2. **Given** at least one block under a heading has content, **Then** the
   heading shows as today.
3. **Given** a heading with sub-headings whose sections are all empty, **Then**
   the parent heading is left out as well.

---

### User Story 4 - The admin carries the operator's identity (Priority: P3)

The installation's operator sees their own identity across the admin: their
name instead of « Trefle », their logo on the login page, their icon in the
menu, their favicon in the browser tab, and their tiled background — with
occasionally a variant tile (e.g. a four-leaf clover among three-leaf ones).
A discreet footer on every admin screen says which Trefle version and release
is running.

**Why this priority**: polish (P3); nothing is blocked today, but the admin
reads as a generic tool rather than the operator's own, and nobody can tell
which release is live without asking.

**Independent Test**: As an Administrator, fill the operator's name and upload
a logo, an icon, a favicon, a pattern and a variant with its frequency; log out:
the login page shows the logo, the background and the footer; log in: every
screen shows the background, the icon, the footer, and the tab shows the name
and favicon; reload a few times: the variant tiles change place.

**Acceptance Scenarios**:

1. **Given** the operator's « Raison sociale » is filled and no logo is
   uploaded, **When** anyone opens the login page, **Then** it shows that name
   where « Trefle » shows today; **Given** it is empty, **Then** « Trefle ».
2. **Given** a logo is uploaded, **Then** the login page shows the logo instead
   of the name.
3. **Given** a menu icon is uploaded, **Then** the admin shows it where the
   small square icon shows today; without one, the current icon.
4. **Given** a favicon is uploaded, **Then** every admin page's browser tab
   shows it; without one, the current favicon.
5. **Given** the operator's name is filled, **Then** every admin page's browser
   tab title ends with « · <name> » instead of « · Trefle », and a member who
   sets up two-factor authentication from then on sees that name in their
   authenticator app.
6. **Given** any admin screen or the login page, **Then** its bottom shows
   « Powered by Trefle v <version> - r <release tag> » (e.g. « v 0.1.0 - r
   018.3-gb-id-types »).
7. **Given** a pattern image is uploaded, **When** any admin screen or the login
   page opens, **Then** the pattern repeats as a wallpaper behind it, under a
   veil that keeps lists and forms readable in the light and dark themes; the
   page editor's canvas has no background.
8. **Given** a variant image of the same size and the mode « K par écran »,
   **When** an admin page opens, **Then** exactly K cells (e.g. 1) show the
   variant at random places, whatever the screen size, drawn again on every
   page change.
9. **Given** the mode « 1 sur N », **When** an admin page opens, **Then** each
   cell independently shows the variant with a 1-in-N chance (so the count
   varies from page to page and may be 0), drawn again on every page change.
10. **Given** a variant image whose size differs from the pattern's, **When** the
   Administrator saves, **Then** the save is refused with a message saying both
   images must have the same size.
11. **Given** no image is set, **Then** the admin looks as it does today.

---

### User Story 5 - Members have an avatar (Priority: P3)

Each member can give themselves an avatar; an Administrator can set anyone's.
The avatar shows on the account button, in the members list and next to
« modifié par » in histories. A member without one shows their initials on a
coloured disc.

**Why this priority**: polish (P3); it makes « who did this » readable at a
glance as the team grows.

**Independent Test**: Upload an avatar on one's own account: it shows on the
account button, in Users and next to one's changes in a history; a member
without one shows initials; the avatar is not offered when picking an image for
a page.

**Acceptance Scenarios**:

1. **Given** a member, **When** they upload an image on their own account,
   **Then** it becomes their avatar, cropped square.
2. **Given** an Administrator, **When** they upload an avatar on another
   member's account, **Then** it becomes that member's avatar; a non-Administrator
   cannot change another member's avatar.
3. **Given** a member without an avatar, **Then** their initials show on a
   coloured disc, the same colour every time for the same member.
4. **Given** a page editor picks an image from the media library, **Then** no
   avatar is offered.
5. **Given** an image over the size limit or not an image, **When** uploaded as
   an avatar, **Then** it is refused with a clear message.

---

### User Story 6 - Each member sees dates in the time zone they choose (Priority: P2)

An Administrator sets the installation's default time zone in Settings →
Default (e.g. Europe/Paris). Each member can choose their own display time
zone in their account — a member based in Europe working on the US market
picks America/New_York. Every date and time the admin shows that member —
list columns, document fields, activity log, Pages Stats days and hours,
period pickers, their exports — is in their chosen time zone, else the
installation's default, whatever the time zone of their computer.

**Why this priority**: today each member sees dates in their computer's time
zone and Pages Stats counts UTC days; a member working on another market than
where they sit cannot read times in that market's zone (P2 « confusing »).

**Independent Test**: Installation default Europe/Paris; member A chooses
America/New_York, member B chooses nothing; both browsers set to
Europe/Paris: A sees a lead's submission time in New York time, B in Paris
time; A clears the choice: Paris time.

**Acceptance Scenarios**:

1. **Given** a member with no choice, **When** they open a list, **Then** every
   date column shows the installation's default time zone, whatever their
   computer's zone.
2. **Given** a member chose America/New_York, **When** they open any admin
   screen, **Then** dates are in New York time; other members are unaffected.
3. **Given** an Administrator changes the installation default, **Then** members
   without a choice see the new zone on reload; members with a choice keep
   theirs; stored dates are unchanged.
4. **Given** a period picker (Pages Stats, A/B, lists with a date filter),
   **When** a member picks a day, **Then** the day runs from 00:00 to 24:00 in
   that member's display time zone.
5. **Given** a member exports a CSV, **Then** its dates are written in that
   member's display time zone with their UTC offset.
6. **Given** a date shown in the admin, **Then** its time zone is identifiable
   (abbreviation or offset shown once per screen or in a tooltip).

---

### Edge Cases

- Pages Stats: an unpublished page with views in the period still appears with
  its totals. A **deleted** page's stats lose their link to the page, so all of
  them are grouped on one row « Pages supprimées » (no ID, no domain) with its
  own totals and chart, so that the column totals stay complete. A page with 0
  views shows a conversion rate of « — », not an error.
- Pages Stats: a period ending today includes today's counts so far. Days run
  in the member's display time zone (US6) when the whole period has hourly data;
  otherwise (older periods) they fall back to the stored UTC days, stated under
  the list and the chart. Two members with different zones may therefore see
  different day totals for the « same » day — each consistent with their zone.
- Time zone on the login page (no member yet): the installation default.
- Pages Stats hourly history: the rebuild goes back only as far as the edge's
  per-minute records (edge counting started 2026-10-12, kept 30 days), at most
  30 days; views **and** submissions are rebuilt from that same start, and hours
  before it show « pas de données horaires », not 0.
- Daylight-saving changes: in a display time zone with DST a day has 23 or 25
  hours on the change days; the hourly chart shows them as they are (one hour
  missing or repeated, labelled with its offset), and daily totals stay exact.
- Menu width: a stored width larger than the current screen is capped so the
  content stays usable; the closed (collapsed) menu is unchanged.
- Search: a search term matching nothing in any searchable field shows the
  usual empty state.
- Branding: the login page shows the name, logo, favicon, background and footer
  **before** sign-in, without exposing any other setting.
- Branding: a deleted or unreadable uploaded image falls back to today's look,
  never a broken image.
- Branding: authenticator entries created before the name change keep showing
  « Trefle »; the 2FA screen says so.
- Variant « K par écran » with K larger than the screen's number of cells: every
  cell shows the variant (K is capped by the cells available).
- Variant « 1 sur N »: N has no practical upper bound (e.g. 15×15 tiles on a 4K
  screen = 36 864 cells, so « 1 sur 36 864 » gives one variant per screen on
  average, none on about a third of pages); N = 1 is refused (every tile would
  be the variant).
- Legal pages: a page whose every section is empty still shows its title, not
  a blank page.
- Time zone: a date Payload draws itself outside any field (e.g. « Dernière
  modification » at the top of a document) also follows the setting if Payload
  allows replacing it; if not, it is listed as a known exception in the plan
  and shown with its time zone so it is never ambiguous.
- Time zone: the few date fields a member can edit (e.g. a data-subject
  request's « reçue le ») keep the date picker of the member's computer, with
  the note « heure de votre ordinateur » — known exception (forcing a picker
  into another zone would store an extra zone per date).

## Requirements *(mandatory)*

### Functional Requirements

**Pages Stats (US1, UX-10)**

- **FR-001**: Pages Stats MUST list one row per page, with the page's views and
  submissions summed over the selected period.
- **FR-002**: Columns MUST be: ID page, page title, domain, views, submissions,
  conversion rate (submissions ÷ views, « — » when views = 0); every column
  MUST be sortable.
- **FR-003**: The default period MUST be the last 30 days and the default sort
  most views first; the existing period picker is reused.
- **FR-004**: Every published page MUST appear, with 0 when it has no view in the
  period; pages with stats in the period MUST appear even if no longer
  published; stats of deleted pages MUST be grouped on one « Pages supprimées »
  row.
- **FR-005**: The stats rows' own identifiers MUST NOT be shown anywhere in
  Pages Stats.
- **FR-006**: Clicking a row MUST open a chart of that page's views and
  submissions per day over the period.
- **FR-007**: The system MUST keep, from the release on, view and submission
  counts per page per hour, retained 90 days, alongside the existing daily
  counts (which stay unchanged).
- **FR-008**: At release, hourly counts MUST be rebuilt once, as far back as the
  edge's per-minute view records go (at most 30 days): views from those
  records, submissions from the leads' timestamps over the same span. From the
  release on, both come from the hourly counter (FR-007).
- **FR-009**: The chart MUST offer « Jour / Heure »; « Heure » only when the whole
  period is within the hourly retention and lasts at most 7 days.
- **FR-010**: The totals MUST be exportable as CSV with the list's columns for
  the selected period.

**Admin organisation (US2, UX-05 → UX-09)**

- **FR-011**: The left menu MUST show the groups and entries of US2 scenario 1, in
  that order, with the names given there; renames change labels and page titles
  only — addresses and stored data stay the same.
- **FR-012**: Settings → Default MUST be split into four tabs:
  - « Général »: data retention, export default, import caps and exchange rate,
    sender address and new-lead notifications, the installation's default time zone
    (US6) and the admin branding of US4;
  - « Entités légales »: legal completeness panel, operator of the installation,
    suppliers;
  - « Textes légaux »: legal texts;
  - « Consents default »: lead-form default consent text, cookie-banner texts
    per language.
  Splitting into tabs MUST NOT change stored values.
- **FR-013**: Settings fields still labelled with technical English names MUST
  get French labels.
- **FR-014**: Menu group headings MUST be shown larger than menu entries.
- **FR-015**: The open menu's width MUST be adjustable by dragging its edge,
  between a minimum and a maximum, reset by double-click, and remembered per
  member across devices.
- **FR-016**: Each list's search MUST match the typed text against several
  useful fields of that list at once (any match), the fields being listed per
  collection in the plan and checked by the user; the search hint MUST name
  them (Payload's own hint if it does, else Trefle's).

**Legal pages (US3, UX-01)**

- **FR-017**: On the privacy policy and legal notice, a heading whose whole
  section is left out MUST be left out too, recursively for nested headings.

**Operator identity (US4, UX-02, UX-03, UX-11)**

- **FR-018**: The admin MUST show the operator's « Raison sociale » where
  « Trefle » shows today as the installation's name (login page, tab title
  suffix, two-factor issuer for new enrolments), « Trefle » when it is empty.
  If the two-factor issuer cannot follow the setting without a restart, it
  stays « Trefle » and the user is told (accepted fallback).
- **FR-019**: Administrators MUST be able to upload, in « Général »: a logo
  (login page), a menu icon (square), a favicon (square), a pattern image, a
  variant image and how the variant appears — either « K par écran » (exactly
  K per page, K from 1 to 100) or « 1 sur N » (each tile 1-in-N, N from 2 to
  1 000 000); each is optional and its absence shows Trefle's own look
  (bundled clover images, « 1 sur 100 », veil 60 %).
- **FR-020**: The pattern MUST tile behind every admin screen and the login
  page under a readability veil (light and dark themes), never behind the page
  editor's canvas; when a variant is set, it MUST be placed per the chosen
  mode (exactly K random tiles, or each tile with probability 1/N), drawn
  again on every page change.
- **FR-021**: A variant whose pixel size differs from the pattern's MUST be
  refused at save.
- **FR-022**: Every admin screen and the login page MUST show « Powered by
  Trefle v <version> - r <release tag> »; the release tag is the one being
  deployed, fixed at release time; the version number changes only when the
  user decides it (today 0.1.0).
- **FR-023**: Branding (name, images, footer) MUST be available to the login
  page without sign-in; no other setting becomes readable without sign-in.

**Avatars (US5, UX-04)**

- **FR-024**: A member MUST be able to set and remove their own avatar; an
  Administrator any member's.
- **FR-025**: Avatars MUST be cropped square, limited in size (1 MB, common image
  formats), and kept apart from the media library used for pages.
- **FR-026**: The avatar MUST show on the account button, in the members list
  and next to the actor's name in the Activity log (the admin's « modifié
  par »; pages keep no version history); without one, initials on a disc whose
  colour is stable per member.

**Time zone (US6)**

- **FR-027**: Settings → Default « Général » MUST offer the installation's
  default time zone (IANA list, default Europe/Paris), editable by
  Administrators.
- **FR-028**: Each member MUST be able to choose a display time zone in their
  account (IANA list, or « Par défaut de l'installation »); an Administrator
  may set it for any member.
- **FR-029**: Every date and time shown to a member in the admin — list cells,
  document fields, the activity log, Trefle's own views (Pages Stats, A/B),
  period pickers — MUST be shown in that member's display time zone (their
  choice, else the installation default), whatever their computer's time
  zone; stored dates stay UTC.
- **FR-030**: Day-based periods (period pickers, Pages Stats) MUST run from 00:00
  to 24:00 in the member's display time zone, except Pages Stats periods older
  than the hourly data, which use stored UTC days and say so.
- **FR-031**: CSV exports MUST write dates in the exporting member's display
  time zone with their UTC offset (ISO 8601).

### Key Entities

- **Page stats (daily)**: existing — per page and per day, views and
  submissions. Unchanged; summed per period for the list.
- **Page stats (hourly)**: new — per page and per hour, views and
  submissions; kept 90 days.
- **Settings → Default**: existing single settings record; gains the admin
  branding (logo, menu icon, favicon, pattern, variant, frequency); its
  layout becomes tabs.
- **Member**: existing — gains an optional avatar, an optional display time
  zone and a remembered menu width.
- **Installation default time zone**: one setting (IANA name), used for members
  without a choice and on the login page.
- **Release identity**: version number (changed only on the user's decision)
  and release tag (set by each release), shown in the footer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any period, Pages Stats shows exactly one row per page (plus at
  most one « Pages supprimées » row), and its totals equal the sum of that
  page's counts over the period (checked on production data for 3 periods).
- **SC-002**: An editor reads a page's total views for the last 30 days in under
  10 seconds from opening Pages Stats, with no manual addition.
- **SC-003**: Every admin entry is reachable in at most 2 clicks from the menu,
  under the group and name agreed in this spec (checked entry by entry).
- **SC-004**: No legal page on any live domain shows a heading with nothing under
  it (checked on every domain after release).
- **SC-005**: After release, the login page and every admin screen show the
  operator's name or logo, and the footer shows the release actually deployed.
- **SC-006**: With a background set, the wallpaper is drawn in under 50 ms on a
  4K screen and Pages Stats shows 90 days for all pages in under 1 second.
- **SC-008**: With a member's display zone, the installation default and the
  browser on three different zones, every date on 5 sampled screens (a list, a
  document, Activity log, Pages Stats, an export) is in the member's display
  zone; with no member choice, in the installation default.
- **SC-007**: A member can find another member in Users by typing part of their
  name.

## Assumptions

- Only Administrators can change Settings → Default, as today; branding is
  therefore set by Administrators.
- « Domain » in Pages Stats is the page's domain hostname.
- The hourly chart is limited to 7 days so it stays readable (168 points).
- Hours and days are shown in the member's display time zone (US6), else the
  installation default, Europe/Paris unless changed.
- The lifetime « Statistiques par page » panel above the Pages list stays as
  it is (out of scope; may be removed later now that Pages Stats exists).
- The search fields per collection are listed in research R7, validated by
  the user on 2026-10-23 (e.g. Users: e-mail, name; Conf. emails: subject,
  body).
- Version 0.1.0 stays until the user announces a new version.
- The per-domain adaptation of legal pages (no lead capture, outside the GDPR)
  is out of scope — a separate future spec.
- The list-search field selector (backlog UX-05 option B) is out of scope; it
  may come later for a list where option A proves insufficient.
