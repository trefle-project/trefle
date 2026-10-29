# Phase 1 Data Model: Page types (subscription / free / confirmation)

One schema change: a new required field on the existing `pages` collection.
No new collection — see `specs/001-landing-page-lead-capture/data-model.md`
and `specs/003-post-launch-improvements/data-model.md` for everything else
about `pages`, unchanged here.

---

## Collection: `pages` — new field `pageType`

| Field | Type | Notes |
|---|---|---|
| `pageType` | select (`subscription` \| `free` \| `confirmation`) | required; default `subscription` (FR-012); sidebar-positioned; internal/editor-facing only — MUST NOT appear in any data the renderer exposes to a visitor (FR-002) |

**Placement**: sidebar group, alongside `status`/`confirmationPage`.

**Access**: inherits the collection's existing `read`/`update` access — no
new access rule. The renderer's `service` user can read it like any other
field (it needs `status` for the same reason already), but `apps/web`'s own
code never surfaces it — see research.md §7.

**Validation**: Payload's own `select` enum validation (one of the three
values); no custom `validate` function needed.

**Mutability**: freely editable at any time via the normal edit form
(FR-013) — not `admin.readOnly`, no field-level lock. Changing it never
touches any other field's stored value; it only changes which
`pages-publish-guard.ts` branch the *next* save is checked against.

**Hooks**: read by two hooks, written by none directly:
- `applyStarterTemplate` (new, `beforeValidate`, create-only) — reads
  `data.pageType` to pick the starter template (research.md §5).
- `publishGuard` (existing, extended) — reads `data.pageType ??
  originalDoc.pageType` to select which rule branch applies (research.md
  §2).

---

## Publish-rule matrix (extends `pages-publish-guard.ts`)

| Check | `subscription` | `free` | `confirmation` |
|---|---|---|---|
| Domain assigned | required | required | required |
| Path assigned | required | required | required |
| `builder.html` non-empty | required | required | required |
| `(domain, path)` unique among published pages | required | required | required |
| Lead-form block count | exactly 1 | **exactly 0** | **exactly 0** |
| Exactly one email form field | required | n/a (FR-007) | n/a |
| Form field name/label present | required | n/a | n/a |
| `successMessage`/`consentPurposeText`/`privacyNoticeUrl`/`privacyNoticeVersion` set | required | n/a | n/a |
| `{{unsubscribeUrl}}` placeholder present in `builder.html` | n/a | n/a | **required** |

Rows marked **bold** are new in this feature; everything else is the
existing, unchanged `subscription` rule set (which every page effectively
followed before this feature, since every page was implicitly
`subscription`-shaped).

---

## Migration

One migration, `page_type` column on `pages`:

```sql
ALTER TABLE "pages" ADD COLUMN "page_type" text;
UPDATE "pages" SET "page_type" = 'subscription' WHERE "page_type" IS NULL;
ALTER TABLE "pages" ALTER COLUMN "page_type" SET NOT NULL;
```

`down()`: drops the column (data loss on rollback is this repo's existing
convention for column-drop downs — see prior migrations).

No index needed: `pageType` is never queried/filtered on by domain/path
resolution or by the renderer; it's read only as a sibling of the document
already being loaded by its `id`.

---

## Non-schema state: the starter-template registry

`STARTER_TEMPLATES` (`apps/cms/src/fields/grapesjs/starterTemplates.ts`) is
a **code-level constant**, not a database entity — `{ subscription: [...],
free: [...], confirmation: [...] }`, each value a list of `{ id, label,
projectData, html, css }` (today always one entry per type). Nothing new is
persisted for it; a page's `builder.projectData`/`html`/`css` are still just
the same fields 001/003 already defined, populated *from* one of these
templates at creation time and then fully independent of it afterward (an
edited page never "points back" to the template it started from).

## Non-schema state: the creation-wizard handoff

The guided step's answers (`pageType`, `templateId`, `domain`, `path`,
`title`) travel from the wizard view to the standard create form via one
`sessionStorage` key, consumed and cleared on arrival — see research.md §9.
Nothing server-side tracks that a handoff happened or is pending; if it's
lost (a new tab, a cleared session), the create form simply behaves as it
did before Phase 4 (Phase 3's server-side fallback template still applies).
