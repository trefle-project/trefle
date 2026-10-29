# Data model: Import a website from a Penpot file

One new collection for the import itself (`site-imports`), one new upload
collection for self-hosted font files (`fonts`), a « Polices du domaine »
list on `domains`, and one relationship on `pages`.
`page-imports` (012/013) is not changed: its fields are about one page, a
source address, AI cost and budgets, none of which apply here (research P2,
P14). Two expand-only migrations, one per delivery slice:
`2026MMDD_domain_fonts` (`fonts`, `domains_fonts` + its weights and files
tables) and `2026MMDD_site_imports` (`site_imports` + its `boards` array,
`pages.site_import_id`). Each `down` drops what its `up` added, enum types
included.

## `site-imports` (new)

Admin group « Content », labels « Import de site Penpot » / « Imports de
sites Penpot », listed next to « Imports de pages » (FR-021). Same access
pattern as `page-imports`: read/update for admin + editor, `create: false`
and `delete: false` through the API. Documents are created by the analyse
endpoint and moved through their states by the job (`overrideAccess`). Every
field except `cancelRequested` is locked with the `system` field access used
by `PageImports.ts`.

| Field | Type | Notes |
|---|---|---|
| `status` | select, required | `analysed` → `queued` → `running` → `completed` \| `failed` \| `cancelled`; `analysed` → `abandoned` (sweep, P12) |
| `step` | select | `parse`, `fonts`, `images`, `build`, `check`, `save` |
| `progress` | number 0–100 | |
| `fileName` | text ≤ 200 | the uploaded file's name, cleaned like 013 `cleanFileName` |
| `penpotFileName` | text | `manifest.files[0].name` |
| `penpotPages` | json | analysis result returned to the wizard: `[{ id, name, boards: [{ id, name, width, height, proposedPath, published, thumbnail? }] }]` (`published` = the proposed path is used by a published page of the domain; thumbnail = `data:` URL ≤ 200 KB); cleared when the import ends |
| `penpotPage` | group `{ id: text, name: text }` | chosen at start |
| `domain` | relationship → `domains`, required | chosen **before** the file is analysed (FR-001), set by the analyse endpoint, never changed afterwards |
| `language` | relationship → `languages` | chosen at start, required, active languages only |
| `boards` | array | one row per **ticked** board, set at start: `boardId` (text), `name` (text), `path` (text, `validatePagePath`), `page` (relationship → `pages`, set at save), `report` (json, an `ImportReport`, set at save) |
| `media` | relationship → `media`, hasMany | Media created by this import, used to clean up on failure or cancel |
| `cancelRequested` | checkbox | the only field the cancel endpoint writes |
| `dismissedReports` | json | page ids whose report was deleted (« Supprimer le rapport »); the only field staff may PATCH |
| `errorCode` | select | see [contracts/site-import-api.md](contracts/site-import-api.md#error-codes) |
| `errorMessage` | text | French, from the code |
| `createdBy` | relationship → `users` | set by the analyse endpoint |
| `startedAt`, `finishedAt` | date | |

**Admin list columns**: `fileName`, `penpotPage.name`, `domain`, `status`,
`createdBy`, `startedAt`, and a « Pages » cell listing the created pages as
links. `useAsTitle: fileName`.

**State rules**
- `start` is accepted only from `analysed`; `cancel` only from `queued` or
  `running`. Any other state → 409.
- `completed` ⇔ every `boards[i].page` is set. On `failed`/`cancelled`, no
  row has a `page`: pages created before the failure are deleted (P15).
- The job stores `penpotPages: null` on completion, failure or cancel; the
  file on disk is deleted then too (FR-022).
- Sweep (every minute, with 012's): `running` for over **8 min** (6-minute
  deadline + margin) or `queued` for over 10 min → `failed` `timeout`, with
  the import's pages and Media deleted; `analysed` for over 1 h →
  `abandoned`; files on disk with no live import → removed.

## `fonts` (new upload collection)

Self-hosted web fonts (research P8). Stored in the asset bucket by the
existing `s3Storage` plugin, with a collection entry using the `fonts/` key
prefix and the same `ASSET_ORIGIN` URL rule as `media`. `mimeTypes:
["font/woff2"]`. Admin group « Content » with read-only fields (nobody
uploads by hand). Read access for authenticated users. The files themselves
are public through `ASSET_ORIGIN` (bucket website), like Media.

| Field | Type | Notes |
|---|---|---|
| `family` | text, required | as Google names it, e.g. `Inter Tight` |
| `weight` | number, required | 100–900 |
| `style` | select `normal` \| `italic` | |
| `subset` | select `latin` \| `latin-ext` | |
| `unicodeRange` | text | copied from Google's CSS |
| `source` | select `google` | the only source in 015 |
| `sha256` | text, indexed | of the woff2 bytes |

Unique on (`family`, `weight`, `style`, `subset`), checked in a
`beforeValidate` hook. Rows are created only by the `domains` hook
(research P8), which looks up existing rows before downloading. A file is
shared by every domain that lists its family, and is **never deleted**
automatically, not even when no domain lists it any more (a few KB, and
re-adding the font is then instant).

## `domains` (changed)

New array field `fonts`, label « Polices du domaine », at the end of the
domain settings (implemented as a plain array field: the domain form has no
tabs, and adding tabs only for this would reshuffle the whole form).
Admin-only, like the rest of the domain (FR-024).

| Row field | Type | Notes |
|---|---|---|
| `family` | text, required | Google Fonts family name, e.g. `Inter Tight` (exact Google spelling, checked on save) |
| `weights` | select, hasMany, required | `100` … `900` |
| `italic` | checkbox | also the italic style of each weight |
| `files` | relationship → `fonts`, hasMany, read-only, hidden | set by the hook |

- `beforeChange` hook: for each row, resolve and download the missing files
  (research P8), set `files`. An unknown family or weight → `ValidationError`
  on `fonts.<i>.family` / `fonts.<i>.weights`, naming it. Rows with the same
  family are merged.
- Row UI: a small client component shows « utilisée par N pages » from
  `GET /api/domains/:id/font-usage` (FR-028).
- The renderer reads `fonts.files` (depth 1) for the domain it already
  resolves. The editor reads it for the page's domain.

## `pages` (changed)

| Field | Type | Notes |
|---|---|---|
| `siteImport` | relationship → `site-imports`, sidebar, read-only | set by the job; shown only when set, like `importedFrom` |

The existing `importReport` UI field (`ImportReportPanel.client`) becomes
visible when `importedFrom` **or** `siteImport` is set. For a site import,
the panel reads `siteImport.boards[]`, takes the row whose `page` is this
page, and renders its `report` with the same layout. « Supprimer le
rapport » on a site-imported page adds the page id to the import's
`dismissedReports` (the same affordance as 012's `reportDismissed`).

Pages created by the job are ordinary: `pageType: "free"`, `status:
"draft"`, `title: "<board name>_<YYYY-MM-DD>_<HH>h<MM>"` (the page's name in Trefle), `seo.metaTitle: "<board name>"` (public title), `domain`, `path`,
`language`, `builder: { projectData, html, css }`. No `form`.

## `media` (unchanged)

Images are created through the same `createMedia` path as 012 (WebP ≤ 500 KB,
`alt` or `altPending`). `importedBy` (→ `page-imports`) stays empty for these
images. Ownership for cleanup lives in `site-imports.media`.

## Files outside the database

| What | Where | Lifetime |
|---|---|---|
| Uploaded `.penpot` | `SITE_FILES_DIR/<siteImportId>` (`$TMPDIR/trefle-site-imports`, mode 600) | from analyse until the job ends, or the 1 h sweep of `analysed` imports |
