# Data model: Admin UX improvements (batch 1)

Migrations with a down path, one per story that changes storage (US1:
hourly table + back-fill; US4: `admin-images` + Settings fields; US5: users
avatar — US4 and US5 share `admin-images`, created by whichever ships
first). Settings tabs, menu groups, renames and search fields change no
stored shape.

## New: `page-stats-hourly` (hidden collection)

| Field | Type | Notes |
|---|---|---|
| page | relationship → pages | required |
| hour | date | UTC hour bucket (`…T14:00:00.000Z`) |
| views | number | default 0 |
| submissions | number | default 0 |

- Unique index (`page`, `hour`). Written only by `incrementPageStat` (upsert,
  like `page_stats`); never through the admin (`access` all false, `hidden`).
- Retention: rows with `hour` older than 90 days deleted by the existing
  retention sweep.
- Migration up back-fills from the earliest `edge_view_windows` row (≤ 30
  days; edge counting started 2026-10-12): views from `applied` (page → count
  per minute window, summed per hour), submissions from `leads.submitted_at`
  over the same span (count per page per hour). Down: drop the table.
- Deleting a page used to delete its stats (hook `pages-stats-cascade`,
  because `page_stats.page_id` was NOT NULL with an `ON DELETE SET NULL` FK).
  Corrected during implementation (2026-10-23): the hook is removed and
  `page_stats.page_id` becomes nullable, so a deleted page's counters stay
  (page → null) and Pages Stats sums them on « Pages supprimées »;
  `page_stats_hourly.page` follows the same rule. Down: null-page rows are
  deleted before NOT NULL is restored.

## New: `admin-images` (hidden upload collection)

| Field | Type | Notes |
|---|---|---|
| (upload) | file | image MIME types only, ≤ 1 MB; `width`/`height` stored by Payload |
| (no resized sizes) | — | avatars cropped square at display (`object-fit`); Payload runs without sharp, so no image processing on upload |
| uploadedBy | relationship → users | set by hook on create |

- Stored in Garage via `s3Storage`, public file URL like `media`.
- Access: read files public; create any active member; update/delete
  Administrator or `uploadedBy`. Not in the nav, never offered by page
  pickers (pickers target `media`).

## Changed: `settings` (global) — tab « Général »

| Field | Type | Notes |
|---|---|---|
| adminLogo | upload → admin-images | optional, login page |
| adminIcon | upload → admin-images | optional, square |
| adminFavicon | upload → admin-images | optional, square |
| adminPattern | upload → admin-images | optional, wallpaper tile |
| adminVariant | upload → admin-images | optional; same width/height as `adminPattern` (hook) |
| variantMode | select `perScreen` \| `oneIn` | default `perScreen` |
| variantCount | number 1–100 | default 1, shown when `perScreen` |
| variantOneIn | number 2–1 000 000 | default 1000, shown when `oneIn` |
| adminTimezone | select (IANA time zones) | installation default, `Europe/Paris` (US6; own migration) |

Existing fields move into the four unnamed tabs (FR-012) — no data change.
`admin.group: "Settings"`, `label: "Default"`.

## Changed: `users`

| Field | Type | Notes |
|---|---|---|
| avatar | upload → admin-images | optional; field update: self or Administrator |
| displayTimezone | select (IANA time zones) | optional, empty = installation default; field update: self or Administrator (US6) |

Menu width is **not** a field: stored in Payload's `payload-preferences`
(key `nav-width`, per user).

## Changed: `incrementPageStat(payload, page, field, by, { at, db })`

`at` (Date, default now) replaces `day`; the function upserts the day row
(`dayBucket(at)`) and the hour row (`hourBucket(at)`).

## Unchanged

`page_stats` (daily rows), `edge_view_windows`, every collection slug and URL.
