# Research: Admin UX improvements (batch 1)

Every decision below was checked against the code on 2026-10-23 (Payload
3.88.0, `@payloadcms/ui`/`next` 3.88.0, payload-totp 3.0.6, Next 16.3.4).

## R1 — Pages Stats: a custom list view, totals in SQL

- **Decision**: replace the `page-stats` list view with a custom server view
  (`admin.components.views.list.Component`). It reads `from`/`to`/`sort` from
  the URL, sums `page_stats` per page in one SQL query (`GROUP BY page_id`,
  joined to `pages` and `domains`), and lists every published page plus any
  page with stats in the period (`LEFT JOIN`, 0 when none); stats whose
  `page_id` is null are summed on one « Pages supprimées » row. (Correction,
  2026-10-23: deleting a page used to delete its stats through a hook; the
  hook is removed and `page_id` made nullable so they stay — data-model.md.)
  Endpoints live on the `page-stats` collection (`/series`, `/export`) so
  they never collide with its `/:id` route. Period picker:
  the existing `DateRangePicker` (010) driving URL params. Clicking a row
  expands a chart under it, fed by a JSON endpoint. CSV through a GET
  endpoint, using `lib/csv.ts` like `leadsExport`.
- **Rationale**: Payload's list only shows stored documents — no aggregation.
  The view keeps Payload's chrome (nav, header) and access; one query per
  render is cheap at our volume (a few hundred pages × days).
- **Alternatives**: a stored « totals per page » table (stale for any period
  other than the one precomputed); keeping the list and adding a panel above
  it (`PageStatsPanel` already does a lifetime total above Pages — it stays
  as is, out of scope).

## R2 — Chart without a new dependency

- **Decision**: a small client component drawing an inline SVG (two lines or
  bars: views, submissions; axis labels; hover value). No chart library.
- **Rationale**: Principle II — one chart, two series; an SVG of ~100 lines
  beats a dependency.
- **Alternatives**: Recharts/Chart.js (weight and upgrade cost for one chart).

## R3 — Hourly counts: new counter written next to the daily one

- **Decision**: new hidden collection `page-stats-hourly` (unique `page` +
  `hour`, UTC hour bucket). `incrementPageStat` upserts both rows in the same
  call (same transaction when given one); its `day` option becomes `at` (a
  timestamp) — edge batches pass the window start, lead intake « now ». The
  retention sweep deletes hourly rows older than 90 days. The migration
  back-fills from the **earliest `edge_view_windows` row** (edge counting
  started 2026-10-12; the ledger keeps 30 days) to now: views from
  `edge_view_windows.applied` (per-minute, per-page counts already added),
  summed per hour; submissions from `leads.submitted_at` over the **same
  span** — so views and submissions start together.
- **Rationale**: same proven upsert path (020 R8) — no second counting
  mechanism; the ledger is the only source of past hourly views.
- **Alternatives**: deriving hours from `edge_view_windows` at read time (only
  30 days, and it is a de-duplication ledger, not a report); Cloudflare
  Analytics Engine queries from the admin (external call per chart, token
  in the CMS).
- **Hourly start** (`hourlyFrom`): the earliest `hour` in `page_stats_hourly`
  (all pages). Approximation accepted: if the first hours had no event at all,
  they read « pas de données » instead of 0. Moves forward with retention.
- **Display and day boundaries** (with R12): hours in the installation's time
  zone. Days: when `from` (00:00 in that zone) ≥ `hourlyFrom`, totals and day
  points are summed from hourly rows cut at the zone's midnights (exact days,
  23/25-hour days on DST changes); otherwise from the stored UTC daily rows,
  with the notice « Jours comptés en UTC pour cette période ». Hours before
  `hourlyFrom` show « pas de données horaires », not 0.

## R4 — Menu order, groups, names

- **Decision**: Payload groups nav entries by `admin.group` in order of first
  appearance across `collections` then `globals`
  (`@payloadcms/ui` `groupNavItems`). So: reorder the `collections` array
  (Reports → Contents → Imports → Leads → Settings), set each `admin.group`,
  rename with `labels`/`label`. The `settings` global goes to group
  « Settings » with label « Default » — globals come after collections, so it
  is last in its group. Slugs untouched → URLs and data unchanged.
- **Alternatives**: a custom `Nav` component (reimplements Payload's nav;
  rejected).

## R5 — Headings size and resizable menu

- **Decision**: a `custom.css` imported by the admin layout styles
  `.nav-group__toggle` (16 px, bold) vs entries (14 px). Width: Payload lays
  the admin out with the CSS variable `--nav-width` (default 275 px). A client
  component in `admin.components.beforeNavLinks` renders a drag handle on the
  nav's right edge, sets `--nav-width` on `<html>` (clamped 200–480 px and to
  the viewport), double-click resets, and stores the value with Payload's
  `usePreferences` (`payload-preferences`, per user, server-side → follows the
  member across devices). A `localStorage` copy only avoids a flash on load.
- **Alternatives**: a custom `Nav` (rejected, R4).

## R6 — Settings tabs

- **Decision**: wrap the Settings fields in a Payload `tabs` field with
  **unnamed** tabs (« Général », « Entités légales », « Textes légaux »,
  « Consents default »). Unnamed tabs do not nest data → no migration, hooks
  and API unchanged. French labels added to the fields still shown by name.
- **Alternatives**: named tabs (would nest data and need a migration).

## R7 — List search on several fields

- **Decision**: `admin.listSearchableFields` per collection (native; Payload
  ORs the fields and its search hint lists them). Fields **validated by the
  user on 2026-10-23** (Conf. emails: body added):

  | List | Search fields |
  |---|---|
  | Users | email, name |
  | Leads | email, domainHostname |
  | Pages | title, path |
  | Domains | hostname, label |
  | Media | filename, alt |
  | Conf. emails | subject, body (HTML text: a search can also match markup) |
  | Legal Pages | hostname, version |
  | Fonts | family, filename |
  | Pages Import | title, sourceUrl |
  | Penpot Import | fileName |
  | A/B experiments | name |
  | Activity log | type, targetType |
  | Consent records | email |
  | Data-subject requests | email |
  | Languages | code, label |
  | Pages Stats | (custom view, R1) page title or ID |

## R8 — Branding: where it is stored, how the login page reads it

- **Decision**: new fields on the Settings global (tab « Général »): uploads
  `adminLogo`, `adminIcon`, `adminFavicon`, `adminPattern`, `adminVariant`;
  `variantMode` (`perScreen` | `oneIn`), `variantCount` (1–100),
  `variantOneIn` (2–1 000 000). Uploads point to a new hidden upload
  collection `admin-images` (also used for avatars, R10), stored in Garage
  through the existing `s3Storage` plugin, public file URLs like `media`.
  Every admin view and the login page are rendered by server components that
  read Settings with `overrideAccess` on the server — nothing becomes readable
  through the API without sign-in (FR-023); only the image files are public.
- **Pattern/variant same size**: Payload stores `width`/`height` on upload
  docs; a Settings `beforeValidate` hook refuses a variant whose size differs.
- **Alternatives**: the `media` collection (would show in page pickers —
  rejected by the spec); a public « branding » endpoint (unneeded: server
  components read it directly).

## R9 — Where each piece renders

- **Logo / icon**: existing slots `admin.components.graphics.Logo` (login
  page) and `graphics.Icon` (nav) — server components reading Settings;
  fallbacks: operator name / « Trefle » wordmark, Payload's icon.
- **Background, veil, footer**: one server provider
  (`admin.components.providers`) wraps the whole admin including the login
  page; it reads Settings + `process.env.RELEASE` (already set by
  `release.sh` in `infra/.env` → compose; used by `after-error.ts`) + the CMS
  `package.json` version, and renders a client child that draws the
  wallpaper on a `<canvas>` sized to the viewport (fixed background), redraws
  on route change (`usePathname`) and resize, applies the veil, and shows the
  footer « Powered by Trefle v {version} - r {RELEASE} » (« dev » locally).
  The GrapesJS canvas is an iframe with its own background: untouched.
- **Favicon**: `admin.meta.icons` is static, so it points to a fixed endpoint
  `GET /api/admin-branding/favicon` that redirects to the uploaded file, or
  to Payload's default icon (exact default URL checked at implementation).
- **Tab title suffix and 2FA issuer**: both are static config values read at
  use time (`meta.titleSuffix`; payload-totp reads
  `pluginOptions.totp.issuer` on each call). Keep a reference to each object,
  set them from Settings in `onInit` and in Settings' `afterChange` (single
  CMS process). To verify at implementation: that Payload/payload-totp read
  the same object (not a copy); fallback if not — title fixed client-side by
  the provider, issuer left « Trefle » and the user told (spec FR-018 accepts
  this fallback).
- **Version number**: `apps/cms/package.json` `version` (0.1.0), changed only
  when the user says so (memory rule); no `release.sh` change needed.

## R10 — Avatars

- **Decision**: `users.avatar` upload → `admin-images`, with a 96×96 centre
  crop (`imageSizes`), image MIME types only, 1 MB max (checked in a
  `beforeValidate` hook on `admin-images` using the uploaded file size).
  Field access: update allowed to self or Administrator. Shown via
  `admin.avatar: { Component }` (account button), a `Cell` in Users and on
  Activity log's `actor` column — the admin's only « modifié par »: pages and
  other collections have no Payload versions (checked: no `versions` in
  `Pages.ts`). Initials
  fallback: from `name` else e-mail, disc colour from a hash of the user ID.
- **Alternatives**: Gravatar (external request, privacy); storing in `media`
  (rejected by the spec).

## R11 — Legal pages: drop empty sections' headings

- **Decision**: in `lib/legal/build.ts`, after `fill()`, a pass over the
  root's children removes a heading when nothing but headings of a deeper
  level follow it before the next heading of the same or higher level
  (recursive by construction: deepest first). The page title is not part of
  the text tree and stays.
- **Consequence**: the HTML changes for affected domains → a new version hash
  → one new archived version per affected domain/kind/language (021
  behaviour, expected).

## R12 — Display time zone: installation default + per-member choice

- **Today**: Payload formats dates in the **browser's** time zone
  (`@payloadcms/ui` `formatDate` uses a time zone only for fields declared
  with `timezone`); Trefle's own code mixes UTC days (`utcDayRangeBounds`,
  `page_stats`) and browser-local days (`localDayRangeBounds`); exports
  write ISO UTC.
- **Decision** (user, 2026-10-23: « l'utilisateur doit pouvoir choisir sa
  timezone d'affichage — il peut travailler sur le marché US en étant basé en
  Europe »):
  - Settings « Général »: `adminTimezone` — the **installation default**
    (select of `Intl.supportedValuesOf("timeZone")`, default `Europe/Paris`).
  - Users: `displayTimezone` — optional select, empty = « Par défaut de
    l'installation »; editable by the member themselves (field access: self
    or Administrator). A user field rather than a Payload preference: it is a
    visible account setting, server-side readable for exports and server
    views, and follows the member across devices.
  - Effective zone = `user.displayTimezone ?? settings.adminTimezone`;
    login page (no user) = installation default.
  - `lib/admin-time.ts` (pure, `Intl.DateTimeFormat` with `timeZone`, no
    dependency): `effectiveZone(user, settings)`,
    `formatAdminDate(date, tz, style)`, `zoneDayBounds(day, tz)`
    (DST-safe), `zoneOffset(date, tz)`, `isoInZone(date, tz)`.
  - A server provider `AdminTimezone` (`admin.components.providers`) reads
    the signed-in user and Settings and exposes the effective zone through a
    client context (`useAdminTimezone`). US4's provider is added beside it;
    US6 does not depend on US4.
  - Every `date` field of every collection/global — including the
    `createdAt`/`updatedAt` timestamps, redeclared where needed — gets an
    `admin.components.Cell` (lists) and, when read-only, an
    `admin.components.Field` (documents) that format with the context's zone
    and show it in a tooltip. Applied by one config-time pass in
    `payload.config.ts` over all fields (not by editing each file).
  - The few **editable** date fields (`data-subject-requests.receivedAt`,
    `activity-log.at` default) keep Payload's picker with a note « heure de
    votre ordinateur » — **known exception** (spec edge cases).
  - Period pickers and Pages Stats cut days in the effective zone; exports
    write dates in the exporting member's zone with offset; server views
    (Pages Stats) and endpoints take the zone from `req.user` + Settings, never
    from a client parameter.
  - Payload's own document-header dates (« Dernière modification »,
    « Créé ») are drawn outside fields: check at implementation whether a
    supported slot replaces them; if not, **known exception** (they follow
    the browser).
- **Rationale**: one helper, one provider, one config pass, one user field —
  no per-file edits, no dependency, stored data unchanged (UTC).
- **Alternatives**: installation zone only (first version of this item —
  replaced: members on other markets need their own zone); Payload preference
  instead of a user field (not readable on the server side for exports
  without an extra query, not visible in the account form); Payload's
  per-field `timezone` (a stored zone per date, migrations everywhere).

## Implementation notes (2026-10-23)

- **R9 revised** — Next runs the API routes and the admin pages in separate
  module instances: a config value changed in place by a Settings save does
  not reach the pages. So: the tab title and favicon are computed per request
  in the admin page's `generateMetadata` (`withBranding`, no favicon endpoint
  needed); the 2FA issuer is a getter over a per-instance cache refreshed at
  most every minute (immediately in the instance that saved Settings).
- **R10 revised** — no `imageSizes` on `admin-images`: Payload runs without
  sharp here; avatars are cropped square at display.
- **Payload list links** — the first list column's custom cell must render
  the record link itself (`link` is passed, the URL is not): done for the
  avatar and date cells.
- **e2e** — specs that change shared Settings, the shared admin account or
  members run in a `shared-state` Playwright project with one worker
  (`apps/web/playwright.config.ts`); the rest stays parallel.
- **Pages Stats search and filters** (user feedback, 2026-10-23) — the custom
  view had dropped Payload's search bar and filters: it has its own now
  (title / page ID / domain, domain, status, « avec des vues seulement »,
  clear), in the URL and applied to the CSV; breadcrumb « Pages Stats ».
- **Image edits** (user feedback, 2026-10-23) — any upload sent with
  Payload's crop / focal-point edits failed with a 500 (media too, before
  022): the storage plugin's inner save re-applied them without the file
  (`hooks/upload-edits-once.ts` fixes it). Passing `sharp` to Payload would
  make the crop real, but it changed the config's bundling and broke
  validation error details (domain fonts e2e), so it is not done: crop and
  focal point are disabled on `admin-images`; on `media` the edits are now
  accepted but not applied (follow-up to decide).
