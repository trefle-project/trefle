---

description: "Task list for 022 — Admin UX improvements (batch 1)"
---

# Tasks: Admin UX improvements (batch 1)

**Input**: Design documents from `/specs/022-ux-improvement/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: included where the constitution (Principle IV) requires them —
aggregation and back-fill (data transformations), endpoints, **every custom
hook**, access rules, retention, the legal builder, the wallpaper placement
and time-zone helpers; e2e + axe for the new admin views.

**Organization**: by user story, in spec priority order (US1 P1; US2, US3,
US6 P2; US4, US5 P3). Stories are independent; build order US3 → US6 → US1 → US2 → US4 → US5.
**Delivery: all of 022 in one release** (user, 2026-10-23).

**Who runs what**: tasks marked **(user)** are owner steps (release on the
VPS, production checks with prod access).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Admin stylesheet: create `apps/cms/src/app/(payload)/custom.css` (plain CSS, done with US6) (empty sections for nav, footer, veil) and import it in `apps/cms/src/app/(payload)/layout.tsx` after `@payloadcms/next/css`; check it loads on the login page and a list view

---

## Phase 2: Foundational (shared by US4 and US5)

- [X] T002 Collection `apps/cms/src/collections/AdminImages.ts` (`admin-images`): upload, `mimeTypes: ["image/*"]`, `imageSizes: [{ name: "avatar", width: 96, height: 96, position: "centre" }]`, field `uploadedBy` (relationship → users, set on create by a `beforeChange` hook from `req.user`, ignoring any client value, read-only), `admin.hidden: true`; access: read public, create any active member, update/delete Administrator or `uploadedBy`; `beforeValidate` hook refusing a file > 1 MB with « L'image dépasse 1 Mo. » and a non-image with « Choisissez une image (PNG, JPEG, WebP, GIF, SVG). »; register in `apps/cms/src/payload.config.ts` (collections, and `s3Storage.collections["admin-images"]` with the same public `generateFileURL` as `media`)
- [X] T003 [P] Tests `apps/cms/tests/admin-images.test.ts`: access matrix (anonymous read file OK, create member OK, update/delete other's refused for Editor, allowed for Administrator); 1 MB and MIME refusals; `uploadedBy` set from the signed-in member on create and a client-supplied value ignored
- [X] T004 Migration `apps/cms/src/migrations/<date>_admin_images.ts` (generated, then checked by hand): table `admin_images` + sizes; down drops it; regenerate types (`npm run generate:types`) and import map

**Checkpoint**: images can be stored for branding and avatars; nothing visible yet.

---

## Phase 3: User Story 1 — Pages Stats totals per page (P1) 🎯 MVP

**Goal**: one row per page (+ « Pages supprimées ») with totals over the period, day/hour chart, CSV export (contracts/page-stats.md).

**Independent Test**: quickstart V1–V3.

**Note**: day cutting uses `lib/admin-time.ts` (T055) and the member's effective zone. If US1 ships before US6, create that helper here (T055 moves into this phase) with the constant `Europe/Paris` as the zone; US6 then swaps in the effective zone.

### Tests

- [X] T005 [P] [US1] `apps/cms/tests/db/page-stats-totals.test.ts`: totals = Σ daily rows (UTC basis) and Σ hourly rows (zone basis); one row per page; published page with no stats → 0; unpublished page with stats listed; stats with `page_id` null summed on one « Pages supprimées » row (absent when zero); each `sort` value; conversion « — » when views = 0
- [X] T006 [P] [US1] `apps/cms/tests/db/page-stats-series.test.ts`: day points fill gaps with 0; `dayBasis` zone vs utc around `hourlyFrom`; America/New_York cuts days at 05:00/04:00 UTC; Europe/Paris DST days give 23 and 25 hour points and exact day totals; `step=hour` refused (400 `hour_range`) for > 7 days or `from` older than 90 days; hours before `hourlyFrom` are `null`; `page=deleted` series; zone taken from the signed-in member, never from a query parameter; 403 without access; 404 unknown page
- [X] T007 [P] [US1] `apps/cms/tests/db/page-stats-export.test.ts`: same rows/totals as the totals query (incl. « Pages supprimées »); first comment line (period, zone, day basis); headers `text/csv; charset=utf-8` and `attachment; filename="pages-stats_{from}_{to}.csv"`
- [X] T008 [P] [US1] Extend `apps/cms/tests/db/page-stats-atomic.test.ts` and `page-views-batch.test.ts`: day **and** hour rows incremented; concurrent calls add up; edge batch uses the window's hour; lead intake uses now
- [X] T009 [P] [US1] `apps/cms/tests/db/page-stats-hourly-migration.test.ts`: ledger seeded over the last 20 days, leads over 40 days → hourly rows start at the earliest ledger window for views **and** submissions, sums per hour match, older leads not back-filled; down drops the table
- [X] T010 [P] [US1] Retention test in `apps/cms/tests/retention.test.ts`: hourly rows older than 90 days removed, daily rows untouched

### Implementation

- [X] T011 [US1] Collection `apps/cms/src/collections/PageStatsHourly.ts` (`page-stats-hourly`): `page` (relationship → pages, required, FK `ON DELETE SET NULL` like `page_stats`), `hour` (date, UTC hour bucket), `views`/`submissions` (number, default 0), unique index (`page`, `hour`), `admin.hidden: true`, access all false; register in `payload.config.ts`
- [X] T012 [US1] `apps/cms/src/lib/page-stats.ts`: `hourBucket(at)`; `incrementPageStat(payload, page, field, by, { at, db })` — `at` (Date, default now) replaces `day`, upserts the day row and the hour row (`ON CONFLICT (page_id, hour)`) in the same executor; update callers `apps/cms/src/endpoints/pageViewsBatch.ts` (pass `new Date(start)`), `pageView.ts`, `leadIntake.ts`
- [X] T013 [US1] Migration `apps/cms/src/migrations/<date>_page_stats_hourly.ts`: table + unique index; back-fill from `min(window_start)` of `edge_view_windows` to now — views: `jsonb_each_text(applied)` summed per `date_trunc('hour', window_start)` and page (existing pages only); submissions: `leads` count per page per `date_trunc('hour', submitted_at)` **from the same start**; down: drop table; regenerate types
- [X] T014 [US1] `apps/cms/src/lib/retention.ts`: delete `page_stats_hourly` rows with `hour` < now − 90 days in the existing sweep
- [X] T015 [US1] Queries in `apps/cms/src/lib/page-stats.ts`: `hourlyFrom()` (min `hour`); `pageStatsTotals({ from, to, sort, tz })` — zone basis (hourly rows between `zoneDayBounds`) when `from` ≥ `hourlyFrom`, else UTC basis (daily rows); published pages ∪ pages with stats, `LEFT JOIN`, `domains` hostname, null-page rows summed as « Pages supprimées »; `pageStatsSeries({ page | "deleted", from, to, step, tz })` per contract
- [X] T016 [P] [US1] Endpoint `apps/cms/src/endpoints/pageStatsSeries.ts` — `GET /api/page-stats/series` per contract (Administrator or Editor; validation; `hour_range` rule: `to − from ≤ 7 days` and `from` within 90 days; zone = member's effective zone); register in `payload.config.ts`
- [X] T017 [P] [US1] Endpoint `apps/cms/src/endpoints/pageStatsExport.ts` — `GET /api/page-stats/export` using `apps/cms/src/lib/csv.ts` like `leadsExport.ts`, first comment line, zone = member's effective zone; register
- [X] T018 [US1] Server view `apps/cms/src/components/PageStatsView.tsx`: reads `from`/`to`/`sort` (defaults last 30 days in the member's zone, `-views`), columns ID page · Page (link) · Domaine · Vues · Soumissions · Conversion, « Pages supprimées » row last (no ID/link); sortable headers (URL `sort`); period picker reusing `DateRangePicker.client.tsx` with zone day bounds, writing `from`/`to` to the URL; notice « Jours comptés en UTC pour cette période » when UTC basis; « Exporter CSV » link; empty state « Aucune page »; error state in French; no stats-row ID anywhere
- [X] T019 [US1] Client chart `apps/cms/src/components/PageStatsChart.client.tsx`: inline SVG, two series (views, submissions), axis labels, value on hover/focus, « Jour / Heure » toggle (Heure disabled with a hint when the period breaks the rule), « pas de données horaires » for `null`, hour labels with offset on DST days, loading/error states, note with the zone and day basis; toggled by clicking a row in `PageStatsView`
- [X] T020 [US1] `apps/cms/src/collections/PageStats.ts`: `admin.components.views.list.Component` → `PageStatsView`; remove the now-unused `beforeListTable` date filter and `defaultColumns`; regenerate the import map
- [X] T021 [US1] e2e `apps/web/tests/e2e/admin-page-stats.spec.ts` (existing Playwright setup, shared admin token): seeded stats → one row per page with totals, « Pages supprimées » after deleting a page, sort, period change, chart opens with day points, hour toggle on 2 days, CSV download; axe on the view
  - *2026-10-23*: US1 done. Correction found in the code: deleting a page deleted its stats (`pages-stats-cascade` hook) — removed, `page_stats.page_id` made nullable (migration `…_page_stats_hourly`, which also back-fills via `backfillHourlyStats`; up/down/up checked locally) so « Pages supprimées » can exist. Endpoints on the collection (`/api/page-stats/series`, `/export`). Row chart opened by a « Graphique de … » button (`aria-expanded` is not allowed on `<tr>`); headers darkened for contrast. Tests: cms 734 + db 33 green; e2e `admin-page-stats.spec.ts` green with axe. A/B period filter still on UTC days (T060 note).

**Checkpoint**: US1 shippable alone (`022.x-page-stats`).

---

## Phase 4: User Story 2 — Admin organisation (P2)

**Goal**: menu groups/order/names, larger headings, resizable width, Settings tabs, multi-field search (contracts/admin-ui.md).

**Independent Test**: quickstart V4.

- [X] T022 [US2] `apps/cms/src/payload.config.ts`: reorder `collections` — PageStats, Experiments, Domains, Pages, Media, OptInEmails, LegalVersions, Fonts, PageImports, SiteImports, Leads, ConsentRecords, DataSubjectRequests, Users, ActivityLog, Languages, then hidden ones
- [X] T023 [P] [US2] Groups and labels per contract: `PageStats.ts` (group « Reports », labels « Pages Stats »), `Experiments.ts` (« Reports », « A/B experiments »), `Domains.ts`/`Pages.ts`/`Media.ts` (« Contents »), `OptInEmails.ts` (« Contents », « Conf. emails »), `LegalVersions.ts` (« Contents », « Legal Pages »), `Fonts.ts` (« Contents », « Fonts »), `PageImports.ts` (« Imports », « Pages Import »), `SiteImports.ts` (« Imports », « Penpot Import »), `Users.ts`/`ActivityLog.ts`/`Languages.ts` (« Settings »); `apps/cms/src/globals/Settings.ts` group « Settings », label « Default » — slugs untouched
- [X] T024 [P] [US2] `listSearchableFields` per research R7 in each collection file (Users: email, name; Leads: email, domainHostname; Pages: title, path; Domains: hostname, label; Media: filename, alt; OptInEmails: subject, body; LegalVersions: hostname, version; Fonts: family, filename; PageImports: title, sourceUrl; SiteImports: fileName; Experiments: name; ActivityLog: type, targetType; ConsentRecords: email; DataSubjectRequests: email; Languages: code, label)
- [X] T025 [US2] `apps/cms/src/globals/Settings.ts`: wrap fields in a `tabs` field with **unnamed** tabs « Général » (retentionMonths, exportConsentedOnlyByDefault, import caps and rate, senderEmail, notifyOnNewLead, notifyEmails), « Entités légales » (operatorLegalStatus, operator, suppliers), « Textes légaux » (legalTexts), « Consents default » (defaultConsentPurposeText, cookieBannerTranslations); hidden fields stay hidden; French labels for every field still shown by its name; confirm `npm run generate:types` shows no shape change and no migration is generated
- [X] T026 [P] [US2] Test `apps/cms/tests/settings-tabs.test.ts`: Settings data shape unchanged (same top-level keys), hooks still run (French banner row, French legal texts, at most one host)
- [X] T027 [P] [US2] Nav styles in `apps/cms/src/app/(payload)/custom.css`: `.nav-group__toggle` 16 px bold, entries 14 px, both themes
- [X] T028 [US2] `apps/cms/src/components/NavResize.client.tsx` in `admin.components.beforeNavLinks`: handle on the nav's right edge (`col-resize`, visible on hover/focus, focusable, ←/→ ±16 px, Enter or double-click reset to 275 px), sets `--nav-width` on `<html>`, clamp 200–480 px and ≤ 50 % viewport, saves `usePreferences().setPreference("nav-width", px)` on drag end, applies stored value on load (localStorage copy only to avoid a flash, wrapped in try/catch); regenerate the import map
- [X] T029 [US2] Update existing e2e selectors that use old menu labels (`grep -rn` on « Opt In Emails », « Imports de pages », « Versions des pages légales », « Page stats », « Experiments », « Fichiers de polices », « Settings ») in `apps/web/tests/e2e/`
- [X] T030 [US2] e2e `apps/web/tests/e2e/admin-organisation.spec.ts`: menu groups and entries in order; old URLs open; Settings four tabs, edit in « Général » + save from « Textes légaux » keeps both; drag width → re-login in a new context → same width, double-click → 275 px; Users search by a name fragment; **the search box hint names the fields** (if Payload's does not, add Trefle's hint via the list's `beforeListTable` and re-run)
  - *2026-10-23*: US2 done. Payload's own search hint already names the fields (« Search by Email Or Name ») — no Trefle hint needed. The resize handle is portaled to `<body>` and fixed on the menu edge (inside the menu, the page content covered it); shown only while the menu is open (`body:has(.template-default--nav-open)`). Payload remembers the last Settings tab and the menu open state per member (tests open them explicitly). e2e `admin-organisation.spec.ts` (4 tests) stable over repeated runs; `us5-roles.spec.ts` expects « Default » hidden for Editors. No migration (checked with `migrate:create`: « No schema changes »).

**Checkpoint**: US2 shippable alone.

---

## Phase 5: User Story 3 — Legal pages without empty headings (P2)

**Goal**: no heading over nothing (contracts/legal.md).

**Independent Test**: quickstart V5.

- [X] T031 [P] [US3] Tests in `apps/cms/tests/legal-build.test.ts`: the four cases of contracts/legal.md (h2 emptied → removed; one paragraph kept → kept; h2 › empty h3 › filled h3; all empty → all removed) + regression on the default French texts with an empty owner (no « Qui est responsable de vos données » / « Éditeur du site »)
- [X] T032 [US3] `apps/cms/src/lib/legal/build.ts`: after `fill()`, a pass over root children removing a heading when only removed deeper headings follow before the next heading of the same or higher level (process deepest levels first); keep the version hash on the final HTML
  - *2026-10-23*: done (`dropEmptyHeadings`, backward scan per heading level). CMS 710 tests green, lint + typecheck clean; 4 new tests fail without the fix. Checked on the local stack (cms rebuilt, web recreated): site-a.localhost (empty owner) no longer shows « Qui est responsable de vos données » / « Éditeur du site »; host.docker.internal (owner filled) keeps « Éditeur du site ». **Release note**: the renderer caches legal pages by tag (`settings`, `domain:N`) with no time limit, and a CMS-only release does not recreate the web container — after releasing, open Settings → « Enregistrer » once (revalidates every legal page); the new HTML gets a new version hash, archived once per domain/kind/language (021).

**Checkpoint**: US3 shippable alone (smallest; suggested first release).

---

## Phase 6: User Story 4 — Operator identity in the admin (P3)

**Goal**: name, logo, icon, favicon, wallpaper with variant, version footer (contracts/admin-ui.md « Branding rendering »).

**Independent Test**: quickstart V6.

**Depends on**: Phase 2.

### Tests

- [X] T033 [P] [US4] `apps/cms/tests/wallpaper.test.ts` for `lib/wallpaper.ts`: `perScreen` gives exactly K distinct cells, capped by the grid; `oneIn` frequency within tolerance over many draws; seeded RNG deterministic; grid = ⌈viewport / tile⌉
- [X] T034 [P] [US4] `apps/cms/tests/settings-branding.test.ts`: variant of another size refused with « La variante doit avoir la même taille que le motif (L×H px). »; branding fields not updatable by an Editor; `GET /api/globals/settings` still refused without sign-in; Settings `afterChange` hook re-applies the operator name to the title-suffix and 2FA-issuer objects (« Trefle » when emptied)
- [X] T035 [P] [US4] `apps/cms/tests/admin-favicon.test.ts`: 302 to the uploaded favicon URL; 302 to the default when none; `Cache-Control: max-age=300`; public

### Implementation

- [X] T036 [US4] `apps/cms/src/globals/Settings.ts` tab « Général », heading « Apparence de l'admin »: `adminLogo`, `adminIcon`, `adminFavicon`, `adminPattern`, `adminVariant` (upload → `admin-images`), `variantMode` (select `perScreen` | `oneIn`, default `perScreen`), `variantCount` (number 1–100, default 1, shown when `perScreen`), `variantOneIn` (number 2–1 000 000, default 1000, shown when `oneIn`); `beforeValidate` hook comparing pattern/variant `width`/`height`
- [X] T037 [US4] Migration `apps/cms/src/migrations/<date>_admin_branding.ts`: Settings columns per data-model.md; down drops them; regenerate types
- [X] T038 [P] [US4] `apps/cms/src/lib/wallpaper.ts`: pure `placeVariants({ cols, rows, mode, count, oneIn, random })` → set of cell indexes
- [X] T039 [P] [US4] `apps/cms/src/lib/branding.ts`: `readBranding(payload)` (Settings with `overrideAccess`, depth 1: operator name, image URLs and sizes, variant settings) and `applyBrandingToConfig(payload, branding)` setting `admin.meta.titleSuffix` to « · {name} » and the payload-totp options object's `issuer` (« Trefle » when the name is empty)
- [X] T040 [US4] `apps/cms/src/payload.config.ts`: keep a reference to the payload-totp options object (`totpOptions`) passed to `payloadTotp`; call `applyBrandingToConfig` in `onInit`; Settings `afterChange` calls it too; **verify** that Payload's page title and payload-totp read the mutated objects (log + manual check) — if not: provider fixes `document.title` client-side and the issuer stays « Trefle » (FR-018 fallback; write the outcome here and tell the user)
- [X] T041 [P] [US4] `apps/cms/src/components/Logo.tsx`: server component — uploaded logo (`<img>` with alt = operator name, max height 64 px) else operator name else « Trefle » wordmark
- [X] T042 [P] [US4] `apps/cms/src/components/Icon.tsx`: server component — uploaded menu icon (square, 24 px) else Payload's default `Icon` from `@payloadcms/ui`; register `graphics.Icon`
- [X] T043 [P] [US4] Endpoint `apps/cms/src/endpoints/adminFavicon.ts` — `GET /api/admin-branding/favicon` (public, 302 to upload or Payload's default icon URL, `Cache-Control: max-age=300`); `admin.meta.icons` in `payload.config.ts` → that URL
- [X] T044 [US4] Provider `apps/cms/src/components/AdminChrome.tsx` (server, added to `admin.components.providers` beside US6's): `readBranding`, `process.env.RELEASE ?? "dev"`, version from `apps/cms/package.json`; renders `AdminChrome.client.tsx` around `children`
- [X] T045 [US4] `apps/cms/src/components/AdminChrome.client.tsx`: fixed `<canvas>` behind the admin (z-index under content) drawing pattern tiles and `placeVariants` cells for the viewport, redrawn on `usePathname` change and debounced resize; veil (theme background ~85 % opacity) in `custom.css`; image load failure → no wallpaper; footer « Powered by Trefle v {version} - r {release} » (small, muted, bottom, also on the login page, not over the nav); GrapesJS canvas iframe untouched
- [X] T046 [US4] 2FA setup screen note « Les applications d'authentification déjà configurées gardent l'ancien nom. » (via the existing `totp-setup-hint` mechanism in `apps/cms/src/lib/totp-setup-hint.ts`)
- [X] T047 [US4] e2e: extend the existing `apps/web/tests/e2e/admin-branding.spec.ts` (003 FR-021 test « Trefle » wordmark stays valid as the no-name fallback; with an operator name set it shows the name): upload logo/icon/favicon/15×15 pattern+variant (K = 1); logged out: login page logo, canvas present, footer text; logged in: footer, icon, favicon link, tab title suffix; navigate → variant position changes; mode « 1 sur N »; remove images → today's look; axe on the login page

**Checkpoint**: US4 shippable (after Phase 2).

---

## Phase 7: User Story 5 — Member avatars (P3)

**Goal**: avatar upload, display, initials fallback (contracts/admin-ui.md « Avatars »).

**Independent Test**: quickstart V7.

**Depends on**: Phase 2.

- [X] T048 [P] [US5] `apps/cms/tests/users-avatar.test.ts`: member sets own avatar; Editor cannot set another's; Administrator can; removing works; initials function (name → 2 letters, e-mail fallback) and stable colour per user ID
- [X] T049 [US5] `apps/cms/src/collections/Users.ts`: field `avatar` (upload → `admin-images`, `filterOptions` to the user's own uploads), field-level `access.update` self or Administrator; migration `apps/cms/src/migrations/<date>_users_avatar.ts` (column + down); regenerate types
- [X] T050 [US5] `apps/cms/src/components/Avatar.tsx`: `UserAvatar` (image `sizes.avatar` or initials disc, fixed palette of 8 with AA contrast) + `admin.avatar: { Component }` in `payload.config.ts` (24 px account button)
- [X] T051 [P] [US5] Cells: avatar column in Users (`admin.components.Cell` on `avatar`, 24 px, added to `defaultColumns`) and 20 px avatar before the actor's name in `ActivityLog.ts` `actor` cell (the admin's only « modifié par »)
- [X] T052 [US5] e2e `apps/web/tests/e2e/admin-avatars.spec.ts`: upload on own account → account button, Users column, Activity log; member without avatar → initials; page image picker does not list avatars
  - *2026-10-23*: Phase 2 + US4 + US5 done (one migration `…_admin_images_branding_avatar`, up/down/up checked). Deviations, see research « Implementation notes »: favicon and tab title via the admin page's `generateMetadata` (no T043 endpoint); 2FA issuer via a cached getter; no `imageSizes` (no sharp); `.template-default__wrap` made transparent so the wallpaper shows; avatar/date cells build the record link when first column. e2e: `admin-branding.spec.ts` (3 tests) green; full suite green 3× after adding the `shared-state` project (one worker) and a hydration wait in `admin-members.spec.ts`.

**Checkpoint**: US5 shippable.

---

## Phase 8: User Story 6 — Display time zone: installation default + per-member choice (P2)

**Goal**: an installation default and a per-member display zone; every admin date, period picker and export in the member's effective zone (contracts/admin-ui.md « Time zone », research R12).

**Independent Test**: quickstart V7b.

### Tests

- [X] T053 [P] [US6] `apps/cms/tests/admin-time.test.ts`: `effectiveZone` (member choice wins, else installation default, login → default); `formatAdminDate` in Europe/Paris, America/New_York, Asia/Tokyo; `zoneDayBounds` on a normal day and on Europe/Paris DST days (23 h and 25 h); `zoneOffset`; `isoInZone`
- [X] T054 [P] [US6] `apps/cms/tests/admin-dates-config.test.ts`: walks the built config — every `date` field and every `createdAt`/`updatedAt` of every collection/global has the zone-aware Cell (and Field when read-only); editable date fields carry the « heure de votre ordinateur » note; access: Settings `adminTimezone` refused for an Editor; a member can set their own `displayTimezone`, not another member's; an Administrator can set anyone's

### Implementation

- [X] T055 [US6] `apps/cms/src/lib/admin-time.ts` (pure, `Intl.DateTimeFormat` with `timeZone`, no dependency): `effectiveZone(user, settings)`, `formatAdminDate(date, tz, style)` (`dd/MM/yyyy HH:mm` like `admin.dateFormat`), `zoneDayBounds(day, tz)`, `zoneOffset(date, tz)`, `isoInZone(date, tz)` (ISO 8601 with offset)
- [X] T056 [US6] Fields + migration: `apps/cms/src/globals/Settings.ts` « Général » `adminTimezone` (select of `Intl.supportedValuesOf("timeZone")`, label « Fuseau horaire par défaut », default `Europe/Paris`, Administrators only); `apps/cms/src/collections/Users.ts` `displayTimezone` (optional select, first option « Par défaut de l'installation », label « Fuseau horaire d'affichage », field-level `access.update` self or Administrator); migration `apps/cms/src/migrations/<date>_display_timezone.ts` (both columns + down); regenerate types
- [X] T057 [US6] Provider `apps/cms/src/components/AdminTimezone.tsx` (server, `admin.components.providers`) reading the signed-in user and Settings with `overrideAccess`, computing `effectiveZone`, exposing `useAdminTimezone()` through a client context; refreshes after the member saves their account (router refresh)
- [X] T058 [US6] `apps/cms/src/components/AdminDate.client.tsx`: `AdminDateCell` and read-only `AdminDateField` formatting with `useAdminTimezone()`, tooltip « Heure de {zone} (UTC±hh:mm) »; editable-field note « heure de votre ordinateur »
- [X] T059 [US6] Config pass in `apps/cms/src/payload.config.ts` (`withAdminDates`): for every collection/global, set the Cell (and Field when read-only) on every `date` field, recursing into groups/arrays/tabs, and on `createdAt`/`updatedAt` (redeclare the timestamp fields with `admin` components if Payload requires it); regenerate the import map
- [X] T060 [US6] Period pickers: `apps/cms/src/lib/dateRangeBounds.ts` gains `zoneDayRangeBounds(from, to, tz)`; `CollectionDateRangeFilter.client.tsx` and `ExperimentPeriodFilter.client.tsx` use it with `useAdminTimezone()` instead of `localDayRangeBounds` (Pages Stats: T015/T018)
  - *2026-10-23*: lists' period filters (`CollectionDateRangeFilter`) cut days in the member's zone; `utcDay` fields keep UTC days. The A/B period filter (`ExperimentPeriodFilter`) still reads UTC days: A/B totals come from the daily `page_stats` rows — it moves to zone days with US1's hourly data (same rule as Pages Stats, FR-030).
- [X] T061 [US6] Exports in the exporting member's effective zone with offset (`isoInZone`, zone from `req.user` + Settings): `apps/cms/src/endpoints/leadsExport.ts`, `dsrExport.ts`, Pages Stats export (T017); tests next to the existing export tests
  - *2026-10-23*: leads export done (+ tests). `dsrExport.ts` left in UTC on purpose: it is the data subject's portability file (JSON), not an admin display. Pages Stats export follows with T017.
- [X] T062 [US6] Check Payload's document-header dates (« Dernière modification », « Créé »): if a supported slot replaces them, use `AdminDateCell`'s formatter; if not, record the known exception in `specs/022-ux-improvement/research.md` R12 and tell the user
  - *2026-10-23*: checked — Payload 3.88 draws « Last Modified / Created » in `DocumentControls` with no replaceable slot (seen on a lead: browser zone, with seconds). User chose (b): Payload's pair hidden in `app/(payload)/custom.css` (`.doc-controls__value-wrap`), `AdminDocumentDates` shows « Modifié / Créé » in the member's zone through `edit.beforeDocumentControls` (added by `withAdminDates`). **Check this header after every Payload upgrade** (class rename = both pairs shown). e2e covers it.
- [X] T063 [US6] e2e `apps/web/tests/e2e/admin-timezone.spec.ts`: browsers `timezoneId: "Asia/Tokyo"`, installation default Europe/Paris; member A sets America/New_York → a lead's submission time, an Activity log entry, a page's « publié le » in New York time, « today » filter bounds at New York midnight, export offset `-04:00`/`-05:00`; member B (no choice) sees Paris time; A clears → Paris; changing the default moves B, not A
  - *2026-10-23*: `apps/web/tests/e2e/admin-timezone.spec.ts` green on the local stack (browser Asia/Tokyo; default Europe/Paris; member America/New_York; default change does not move a member who chose; account field shown; export offset). Screens checked: leads list in Paris time from a Tokyo browser, Settings shows « Fuseau horaire par défaut ».

**Checkpoint**: US6 shippable alone.

---

## Phase 9: Polish & release

- [X] T064 Lint + typecheck + `npm test` + `npm run test:db` for `apps/cms`; e2e suite; fix or delete any flaky test the same day
- [X] T065 [P] Run quickstart V1–V7b locally (both compose files) and write the manual checks in each PR body; **measure** SC-006: wallpaper draw time on a 3840×2160 viewport (< 50 ms, `performance.now()` around the draw) and Pages Stats render for 90 days × all seeded pages (< 1 s); axe contrast on a list over the veil
- [X] T066 [P] Docs: update `infra/deploy/README*.md` only if a release step changes (none expected); note in `specs/022-ux-improvement/quickstart.md` any deviation found
  - *2026-10-23*: T064 — cms 752 unit + 33 db green, lint + types clean (cms, web e2e files); full e2e suite green 3× (100 tests). T065 — wallpaper on 3840×2160 with 15×15 tiles (36 864 draws): 37.5 ms (< 50 ms); Pages Stats 90 days over 1 093 local pages: 56 ms (< 1 s). T066 — no release-step change; post-release actions listed under T067.
- [X] T067 **(user)** Release each story with `release.sh` (tags `022.N-…`), then quickstart V8 on production (footer tag, page 19 totals vs its rows by read-only SQL, legal pages of every domain, branding on `admin.example.com`, dates in the chosen zones)
  - Release notes (one release for all of 022): 5 migrations run by `release.sh` (display time zone, hourly stats + back-fill, admin images/branding/avatar, veil opacity, branding defaults; US2 needs none). Admin appearance needs no upload: empty slots show Trefle's clover (files in the CMS image, `/branding/*`), « 1 sur 100 », veil 60 %. After the release: (1) Settings → Default → « Enregistrer » once — the renderer caches legal pages by tag, a CMS-only change does not refresh them (US3); (2) optionally fill « Apparence de l'admin » and each member's « Fuseau horaire d'affichage »; (3) the 2FA name only changes for new enrolments. Pages Stats days stay UTC for periods starting before the first hourly data (edge ledger, ≤ 30 days back).
- [X] T068 Update memory `trefle-022-ux-improvement-state.md` after each release (what is live, what is left)
  - *2026-10-23*: released as ONE tag, `022-ux-improvement` (PR #73, merge 833054f), not per story. V8: migrations batch 17 all ran; cms/web healthy, no error in the logs; login page served Trefle's bundled clover branding (« 1 sur 100 », veil 60 %: prod Settings were untouched, so the defaults applied); footer release tag in the page; legal pages of both domains 200; admin screens checked by the user (Access); Settings re-saved after the release. Page 19 totals vs rows by SQL: not run (optional).

---

## Dependencies & Execution Order

- Phase 1 → everything (only T001's stylesheet is shared: US2, US4).
- Phase 2 → US4, US5 only.
- US1 uses `lib/admin-time.ts` (T055): build it with US6, or inside US1 if
  US1 ships first (see the note in Phase 3).
- US1, US2, US3, US6 independent of each other otherwise and of Phase 2.
- Within a story: tests [P] first or alongside; collection/migration before
  queries; queries before endpoints/views; e2e last.
- T022/T023 (menu), T036 (branding fields), T056 (time-zone fields), T049
  (avatar) and T059 (config pass) touch `payload.config.ts`, `Settings.ts`,
  `Users.ts` or collection files touched by other stories: do them in
  delivery order or rebase carefully.

## Parallel examples

- **US1**: T005–T010 together; then T016 and T017 together after T015.
- **US2**: T023, T024, T027 together after T022.
- **US4**: T033–T035 together; T038, T039, T041, T042, T043 together after T036–T037.
- **US5**: T048 and T051 alongside T050.
- **US6**: T053, T054 together; T057 and T058 together after T055–T056.

## Implementation Strategy

1. **US3 first** (T031–T032): one small builder change, a visible public fix.
2. **US6** (T053–T063): the zone helper that US1's days rely on.
3. **US1** (the feature's main value): Phase 3 → release.
4. **US2**: menu + tabs + search → release.
5. **Phase 2 + US4**, then **US5** → releases.

Each release: lint, types, tests, quickstart part, then T067 by the user.
