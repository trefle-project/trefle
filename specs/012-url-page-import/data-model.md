# Data Model: Import a page from a URL (012)

All schema changes go through one Payload migration
(`2026MMDD_page_imports`), **expand-only**: new table, new nullable columns,
one `NOT NULL` dropped. Down path: drop the new table/columns and restore
`NOT NULL` on `media.alt` after backfilling empty values with the file name
(documented in the migration).

---

## New collection: `page-imports`

One document per import attempt (spec: Import request + Import report).

| Field | Type | Rules |
|---|---|---|
| `sourceUrl` | text, required | As typed by the editor, trimmed. `http`/`https` only (FR-002). |
| `finalUrl` | text | Address actually loaded after redirects. |
| `pageType` | select `subscription` \| `free` \| `confirmation`, required | From the wizard. |
| `title` | text, required | From the wizard (page title to create). |
| `domain` | relationship → `domains` | Optional, from the wizard. |
| `path` | text | Optional, from the wizard, normalised with leading `/`. |
| `language` | relationship → `languages` | From the wizard. |
| `status` | select `queued` \| `running` \| `completed` \| `failed` \| `cancelled`, required, default `queued` | See state machine. |
| `step` | select `render` \| `convert` \| `images` \| `build` \| `check` \| `save` | Current step, for progress display (FR-004). |
| `progress` | number 0–100 | Coarse progress for the wizard bar. |
| `cancelRequested` | checkbox, default false | Set by the cancel endpoint; the job checks it between steps and between images. |
| `errorCode` | select (see contracts/import-api.md §Errors) | Machine-readable failure reason. |
| `errorMessage` | text | Plain-language French message shown to the editor (FR-020). |
| `costUsd` | number (4 decimals) | 0 until the AI step returns; set even on failure/cancel after that step. |
| `costEur` | number (4 decimals) | `costUsd × settings.importUsdToEurRate` at the time of the import. |
| `aiModel` | text | Model id that actually served the request (fallbacks may change it). |
| `startedAt` | date, required | Set at creation; used for the monthly total (Europe/Paris month). |
| `finishedAt` | date | Set on any terminal status. |
| `createdBy` | relationship → `users`, required | Importing user. |
| `page` | relationship → `pages` | Set on `completed` only. |
| `media` | relationship → `media`, hasMany | Media created by this import; deleted on `failed`/`cancelled`. |
| `report` | json | Import report, see below. Set on `completed`. |
| `reportDismissed` | checkbox, default false | Set when the editor dismisses the report on the page (FR-019). |

**Access**
- `read`: `isAdminOrEditor` (editors poll their own import; the list and
  costs are visible to both roles, only admins see the budget banner).
- `create` / `update` / `delete`: nobody through the REST API
  (`() => false`), except field-level `update` on `reportDismissed` for
  `isAdminOrEditor`. Creation goes through `POST /api/page-imports/start`,
  status changes through the job (`overrideAccess: true`), cancel through
  `POST /api/page-imports/:id/cancel`.
- Admin UI: group "Content", label "Imports de pages", list columns
  `sourceUrl, status, createdBy, startedAt, costEur, page` (`page` as a link
  to the draft; `errorMessage` on the document view — FR-004a); a `beforeListTable`
  banner shows the month's global total vs cap and, for admins, each user's
  month total vs their budget (FR-027a, FR-027f).

**State machine**

```text
queued ──job starts──▶ running ──all steps ok──▶ completed
   │                     │  └──error / timeout (never budget)──▶ failed
   │                     └──cancelRequested seen──▶ cancelled
   └──cancelRequested before start──▶ cancelled
```

Budgets are checked only by the start endpoint, before the document is
created; the job never reads them and never stops for budget reasons
(FR-027c). Terminal states (`completed`, `failed`, `cancelled`) never change again. On
`failed`/`cancelled`: every `media` item created by the import is deleted
and no page exists (FR-020, Assumptions). A `running` import older than
5 minutes is marked `failed` (`timeout`) by the job's safety sweep (FR-021).

**Report shape** (`report` json, rendered by the page's report panel)

```ts
type ImportReport = {
  finalUrl: string;
  reproduced: { sections: number; columns: number; blocks: Record<BlockType, number>; images: number };
  simplified: { what: string; how: string }[];      // e.g. carousel → first slide
  omitted: { what: string; reason: string }[];       // video, map, iframe, table, extra form…
  failedImages: { sourceUrl: string; reason: "unreachable" | "too-large" | "not-an-image" }[];
  fontSubstitutions: string[];                        // source font families replaced by the system font
  accessibility: { kind: "missing-alt" | "low-contrast" | "heading-skip" | "empty-link" | "contrast-unverifiable"; where: string; detail?: string }[];
  deviceChecks: { device: "desktop" | "tablet" | "mobileLandscape" | "mobilePortrait"; kind: "horizontal-scroll" | "small-text" | "small-target" | "overflow"; where: string; detail?: string }[];  // FR-011c
  sourceHadMobileLayout: boolean;                     // FR-011b
  actionsBeforePublish: string[];                     // e.g. "Ajouter un bloc Formulaire", "Décrire 3 images"
  formFieldsUnmapped?: string[];                      // Story 4: source fields with no supported type
};
```

---

## Changed collection: `pages`

| Field | Change |
|---|---|
| `importedFrom` | **New** relationship → `page-imports`, optional, read-only in the admin, sidebar. Links the page to its import and report. |
| `builder.*`, `form.*` | Unchanged shape. The import fills them exactly as an editor would. |

New admin UI component `ImportReportPanel` at the top of the edit view,
shown when `importedFrom` is set and its `reportDismissed` is false.

No hook changes: `applyStarterTemplate` leaves non-default builders alone,
`recomputeBlockCount` counts the new `section`/`columns`/`column` markers
(harmlessly — only `leadForm` drives publish rules), `publishGuard` unchanged
(FR-010, FR-031).

---

## Changed collection: `media`

| Field | Change |
|---|---|
| `alt` | `required: true` → custom `validate`: required unless `altPending` is true. Column becomes nullable. |
| `altPending` | **New** checkbox, default false, label "À décrire". Set by imports for source images without alternative text; the editor clears it by writing a description (a `beforeChange` hook unsets it when `alt` becomes non-empty). Shown as a list column. |
| `importedBy` | **New** relationship → `page-imports`, optional, read-only. |

---

## Changed collection: `users`

| Field | Change |
|---|---|
| `importMonthlyBudgetEur` | **New** number, optional, min `0`, label "Budget IA mensuel (€)", description "Vide = budget par défaut des réglages. 0 = pas d'import." Field access `update: adminFieldOnly` (existing helper); readable by admins and by the user themself (existing `readSelf`). Shown in the user's sidebar. |

---

## Changed global: `settings`

| Field | Change |
|---|---|
| `importMonthlyCapEur` | **New** number, required, default `20`, min `0`. `0` disables imports. Admin-only (global's existing `update: isAdmin`). |
| `importUsdToEurRate` | **New** number, required, default `0.92`, min `0.01`. Used to convert the AI's USD cost. |
| `importDefaultUserBudgetEur` | **New** number, required, default `10`, min `0`. Monthly budget of every user whose `importMonthlyBudgetEur` is empty. |

---

## Changed shared constant: `@trefle/shared` `BLOCK_TYPES`

Adds `"section"`, `"columns"`, `"column"`. `countBlocks` needs no other
change. The renderer allow-list moves from `apps/web/src/lib/render.ts` to
`@trefle/shared` (`ALLOWED_TAGS`, `ALLOWED_ATTR`) so the serializer's tests
can assert it only emits allowed markup (FR-008) against the very list the
renderer uses.

---

## Non-persisted structures

- **DOM extract** (job-internal, never stored): `{ url, viewport, texts:
  [{ id, tag, html, box, style, devices: { tablet?, mobile? } }], images:
  [{ id, kind: "img"|"background", candidates[], alt, box, devices }], forms: [{ id, box, fields: [{ label, type,
  required }] }], unsupported: [{ kind, box }], fonts: string[] }`.
  `devices.tablet` / `devices.mobile` hold, per element, the box, a `hidden`
  flag and only the computed styles that differ from desktop (same DOM
  resized, so ids are shared across devices). Texts keep only safe inline markup (`b strong i em u s br a[href]`), hrefs made
  absolute.
- **Import IR**: the AI's output, see contracts/import-ir.md.
