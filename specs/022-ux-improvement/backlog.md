# 022-ux-improvement — backlog

A running list of UX improvements, collected as they are noticed and shipped
together as one feature. While the list is open, items are only recorded
here; when it is closed, it becomes the input of `spec.md` (Speckit
specify → clarify → plan → tasks → implement).

**Status**: Closed 2026-10-23 (opened 2026-10-22) — now `spec.md`

Each item: where it shows, what is wrong today, what is wanted, who noticed
it and when. Priority: P1 = gets in the way, P2 = confusing, P3 = polish.

## Items

### UX-01 — Legal pages: no heading over an empty section

- **Where**: public `/confidentialite` and `/mentions-legales` (021).
- **Today**: when every block under a heading is left out (its placeholders
  are empty), the heading still shows with nothing under it — seen in
  production on 2026-10-22 on a domain whose owner was not filled in yet
  (« Qui est responsable de vos données », « Éditeur du site »).
- **Wanted**: a heading whose section ends up empty is left out too.
- **Noticed by**: the user, 2026-10-22. **Priority**: P2.
- **Note**: adapting the legal pages per domain (no lead capture, country
  outside the GDPR) is a larger, separate need — not part of this list.

### UX-02 — Admin: installation name instead of « Trefle », version in the footer

- **Where**: admin login page (`/admin/login`, e.g.
  `https://admin.example.com/admin/login`) and every admin
  screen.
- **Today**: the login page shows the fixed wordmark « Trefle »
  (`apps/cms/src/components/Logo.tsx`, Payload's `graphics.Logo` slot,
  003 FR-021); no admin screen shows which version is running.
- **Wanted**:
  - the login wordmark shows the name of the installation operator
    (Settings → « Opérateur de l'installation » → « Raison sociale »,
    `operator.name`, 021); « Trefle » while it is empty;
  - the same name replaces « Trefle » in the browser-tab suffix
    (`meta.titleSuffix`) and as the 2FA issuer (`totp.issuer`);
  - a footer « Powered by Trefle v x.x.x - r <release tag> » at the bottom
    of the login page **and of every admin screen**
    (e.g. « v 0.1.0 - r 018.3-gb-id-types »).
- **Noticed by**: the user, 2026-10-22. **Priority**: P3.
- **Decided** (2026-10-22): name source = operator of the installation;
  version format = `v x.x.x - r <tag>`; tab suffix and 2FA issuer follow
  the name.
- **To settle in the spec**:
  - the release tag must be written into the build by `release.sh` (not
    read from git at runtime).
- **Version number** (decided 2026-10-22): `x.x.x` is bumped only when the
  user says so — never automatically per release; today `0.1.0`.
  - changing the 2FA issuer only renames new enrolments; existing
    authenticator entries keep « Trefle » (say so, or offer re-enrolment).

### UX-03 — Admin: tiled background image on every screen

- **Where**: the whole admin interface — every screen, login page
  included.
- **Today**: plain Payload background, no way to brand it.
- **Wanted**:
  - an image uploaded in Settings (one for the whole installation, same for
    every member); none = today's look;
  - it repeats as a tile pattern (wallpaper) behind every admin screen and
    the login page;
  - a veil / opacity keeps lists and forms readable in the light and dark
    admin themes; the GrapesJS editor canvas keeps no background.
- **Noticed by**: the user, 2026-10-23. **Priority**: P3.
- **Decided** (2026-10-23): upload in Settings, tiled, login page
  included, veil for readability, one image for everyone.
- **Variant tile** (asked 2026-10-23): optionally a second image of the
  same size (e.g. a 30×30 four-leaf clover among 30×30 three-leaf ones)
  replaces the pattern in a few cells at random.
  - Feasible: the browser draws the wallpaper itself (canvas the size of
    the screen, cell by cell, random draw per cell) and uses it as a fixed
    background — a plain CSS repeat can't do it (same positions every
    tile). No server cost.
  - Settings: pattern image, optional variant image (refused if its size
    differs from the pattern), variant frequency (e.g. « 1 cell in 50 »).
  - Decided (2026-10-23): frequency set in Settings; new random draw on
    every page change; a single variant image.
  - Refined at spec time (2026-10-23): two modes chosen in Settings —
    « K par écran » (exactly K variants per page) or « 1 sur N » (each tile
    1-in-N, no practical upper bound: 15×15 on 4K = 36 864 cells).

### UX-04 — Members: avatar image

- **Where**: admin — a member's account (`users`) and wherever a member is
  shown.
- **Today**: no avatar; Payload shows its generic account icon (top right)
  for everyone.
- **Wanted**:
  - each member uploads their own avatar; an Administrator can also set or
    change anyone's;
  - it shows on the account icon (top right, Payload `admin.avatar` custom
    component), in the members list, and next to « modifié par » in
    history entries;
  - without one: the member's initials on a coloured disc instead of the
    generic icon;
  - stored apart from the media library (never offered when picking an
    image for a page), cropped square, with a size limit.
- **Noticed by**: the user, 2026-10-23. **Priority**: P3.
- **Decided** (2026-10-23): all four points above, as proposed.

### UX-05 — Admin lists: choose what the search bar searches

- **Where**: every admin list view (Users, Leads, Pages, Domains…).
- **Today**: the search bar searches one field only — the collection's
  `useAsTitle` (Users → email, Pages → title, Domains → hostname; Leads
  sets `listSearchableFields: ["email"]`). Payload 3.88 offers no way to
  pick the field; the « Filtres » button can filter on any field but takes
  several clicks.
- **Wanted**: being able to search on other fields than the fixed one.
- **Noticed by**: the user, 2026-10-23. **Priority**: P2.
- **Options**:
  - A (recommended): per collection, list the useful fields in
    `listSearchableFields` — the typed text is matched against all of them
    at once (OR); native Payload, configuration only.
  - B: a « Rechercher dans : [champ ▾] » selector next to the bar — custom
    list component on every collection, to maintain across Payload
    upgrades.
- **Decided** (2026-10-23): option A for now; B stays possible later for
  a list where unwanted matches from other fields get in the way.
- **To settle in the spec**: the field list per collection (proposed by
  Claude, checked by the user).

### UX-06 — Settings: split the page into tabs

- **Where**: admin → Settings (global `settings`,
  `apps/cms/src/globals/Settings.ts`).
- **Today**: one long page with every section one under the other.
- **Wanted**: four tabs — « Général », « Entités légales », « Textes
  légaux », « Consents default » (first « Cookie Banners », renamed by the
  user on 2026-10-23).
- **Noticed by**: the user, 2026-10-23. **Priority**: P2.
- **Proposed placement** (to check in the spec):
  - Général: data retention (`retentionMonths`), export default
    (`exportConsentedOnlyByDefault`), import caps and USD→EUR rate,
    sender address and new-lead notifications; plus the new admin
    settings of UX-03 (background, variant, frequency).
  - Entités légales: legal status panel, « Opérateur de l'installation »
    (whose name UX-02 shows in the admin), « Sous-traitants ».
  - Textes légaux: « Textes juridiques » (`legalTexts`).
  - Consents default: default consent text of the lead forms
    (`defaultConsentPurposeText`) and the cookie-banner text per language
    (`cookieBannerTranslations`) — decided 2026-10-23.
- **Notes**: Payload unnamed tabs only change the layout — stored data and
  the API stay the same, no migration. While at it, give the fields that
  still show raw English names (`senderEmail`, `notifyOnNewLead`,
  `defaultConsentPurposeText`…) French labels.

### UX-07 — Admin left menu: bigger section headings, resizable width

- **Where**: the admin's vertical menu on the left (Payload nav).
- **Today**: the section headings (groups « Content », « Leads »,
  « Workspace ») are in the same type size as the pages under them, so the
  structure is hard to read; the open menu has a fixed width.
- **Wanted**:
  - section headings in a larger type size than the page links;
  - the open menu's width can be changed (drag its right edge).
- **Noticed by**: the user, 2026-10-23. **Priority**: P2.
- **Decided** (2026-10-23):
  - width remembered per member, across devices (Payload's per-user
    preferences), with a min / max; a double-click on the edge restores the
    default;
  - type sizes as a starting point: headings 16 px bold, links 14 px
    (adjusted on screen, light and dark themes);
  - group names stay as they are (« Content », « Leads », « Workspace ») —
    not translated.

### UX-08 — Languages moves to the « Workspace » menu group

- **Where**: admin left menu — « Languages » (collection `languages`, 005).
- **Today**: Languages sits under « Content », although it is an
  installation setting changed rarely, by Administrators only.
- **Wanted**: Languages listed under « Workspace » (Workspace → Languages)
  — that group becomes « Settings » with UX-09 (Settings → Languages).
- **Noticed by**: the user, 2026-10-23. **Priority**: P3.
- **Decided** (2026-10-23): first asked as a Settings tab; the user chose
  the simpler move to the « Workspace » group instead — only the menu
  group changes (`admin.group`), the list, its form and its rules stay as
  they are.

### UX-09 — Left menu: reorder « Content » (renamed « Contents »), new « Reports » and « Imports » groups, « Workspace » renamed « Settings »

- **Where**: admin left menu (Payload nav; groups come from each
  collection's `admin.group`, order from the `collections` array in
  `payload.config.ts`).
- **Today**: « Content » holds, in this order: Domains, Languages, Pages,
  Imports de pages, Imports de sites Penpot, Experiments, Opt In Emails,
  Media, Fichiers de polices, Page stats; « Versions des pages légales »
  sits under « Leads ».
- **Wanted** (decided 2026-10-23):
  - **Contents** (renamed from « Content », 2026-10-23), in this order: Domains, Pages, Media, « Conf. emails »
    (renamed from Opt In Emails), « Legal Pages » (renamed from Versions
    des pages légales, moved from Leads), Fonts (« Fichiers de polices »
    today).
  - **Imports** (new group, right after Contents): « Pages Import »
    (Imports de pages), « Penpot Import » (Imports de sites Penpot).
  - **Reports** (new group, first in the menu, above Contents): « Pages
    Stats » (Page stats), « A/B experiments » (Experiments).
  - **Settings** (renamed from « Workspace », 2026-10-23): Users,
    Activity log, Languages (UX-08), and the Settings page itself, whose
    menu entry is renamed « Default » (Settings → Default, not Settings →
    Settings). UX-02, UX-03 and UX-06 call that page « Settings »: it is
    the same page (global `settings`).
- **Noticed by**: the user, 2026-10-23. **Priority**: P2.
- **Menu order**: Reports, Contents, Imports, Leads, Settings. The group
  was first named « Activity », renamed « Reports » (2026-10-23), which
  also avoids a clash with « Activity log » (Workspace, unchanged).
- **Note**: the renames change menu labels and page titles only; collection
    slugs, URLs and stored data stay the same.

### UX-10 — Pages Stats: one row per page with its totals over the period

- **Where**: Reports → Pages Stats (collection `page-stats`, list view).
- **Today**: the list shows the stored rows as they are — one per page
  **and per day** (unique index `page`+`date`, counters incremented by the
  page-view and lead-intake endpoints). The period picker (010-date-range-
  filters, `CollectionDateRangeFilter`) only *filters* those daily rows: a
  30-day period still shows 30 rows for one page. Each row's own ID shows
  and is easily taken for a page ID.
- **Wanted** (user, 2026-10-23): the period exists precisely to read
  totals — **one row per page**, with the views and submissions summed
  over the chosen period.
  - a dedicated « ID page » column; the stats row's ID shown nowhere;
  - storage unchanged: the daily rows stay (any period is computed from
    them); only what the list shows changes.
- **Noticed by**: the user, 2026-10-23. **Priority**: P2.
- **How** (to check in the spec): Payload's list view can only show
  stored documents, so the totals need a custom list view for
  `page-stats` (summed server-side per page for the period: SQL
  `GROUP BY page`), reusing the existing period picker.
- **Decided** (2026-10-23):
  - columns: ID page, page title, domain, views, submissions, conversion
    rate (submissions / views);
  - default period last 30 days; sorted by most views first, any column
    sortable;
  - pages with no view in the period shown with 0;
  - clicking a row opens a chart of that page's views and submissions
    day by day over the period;
  - CSV export of the totals.
- **Hourly detail** (asked and decided 2026-10-23):
  - today only daily counters are kept; the edge ledger
    `edge-view-windows` (020) holds views per page **per minute** but only
    30 days, for de-duplication; leads carry their exact time, so hourly
    submissions are available for any period;
  - a new counter per page **per hour** from now on, next to the daily
    one, kept 90 days; the last 30 days of hourly views rebuilt
    once from `edge-view-windows` at release;
  - the chart offers « Jour / Heure »; « Heure » only when the period is
    within the hourly retention and short enough to read (a few days).

### UX-11 — Admin: custom logo and favicon

- **Where**: the whole admin interface — login page, top of the left menu
  / header, browser tab.
- **Today**: no setting for either. The login page shows the « Trefle »
  text wordmark (`components/Logo.tsx`, `graphics.Logo`); the small icon
  (`graphics.Icon`) and the favicon are Payload's defaults (nothing set in
  `payload.config.ts`, no `public/` icons).
- **Wanted**: the logo and the favicon of the whole admin can be changed.
- **Noticed by**: the user, 2026-10-23. **Priority**: P3.
- **Proposed** (to check in the spec):
  - three uploads in Settings → Default, « Général » tab (next to the
    UX-03 background): logo, menu icon, favicon;
  - logo (large): replaces the wordmark on the login page; without it,
    UX-02's text (operator name, else « Trefle »);
  - menu icon (square): replaces Payload's small icon in the admin
    (`graphics.Icon`); without it, Payload's default;
  - favicon: served from a fixed admin address that reads the setting
    (Payload's `admin.meta.icons` is fixed at build time); without it,
    Payload's default;
  - accepted formats and sizes (SVG/PNG logo; PNG/ICO/SVG favicon, square,
    e.g. 32×32 minimum); one for the whole installation.
- **Decided** (2026-10-23): two separate images for the logo (large,
  login page) and the menu icon (square), plus the favicon.

## Added at spec analysis (after closing)

### US6 — Display time zone (2026-10-23)

- **Wanted**: an installation time zone setting so every admin date shows in
  it; then refined by the user the same day: each member chooses their own
  display time zone (« il peut très bien travailler sur le marché US en étant
  basé en Europe »), the installation setting being the default.
- Recorded directly in `spec.md` (US6, FR-027 → FR-031).

## Already handled elsewhere

- A/B « Rafraîchir » before the first analysis showed an error; now
  « Premières données dans N min » (018, tag `018.3-gb-id-types`).
