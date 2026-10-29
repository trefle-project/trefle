# Phase 1 Data Model: Content language tagging

One new collection, three extended ones. See research.md §5 for the single
hand-augmented migration that lands all four together.

---

## New collection: `languages`

| Field | Type | Notes |
|---|---|---|
| `code` | text | required, unique, indexed; lowercase, matches `^[a-z]{2}$` (ISO 639-1); normalized (trim + lowercase) on `beforeValidate` the same way `domains.hostname` normalizes today |
| `label` | text | required; human-readable display name (e.g. "Français") |
| `isActive` | checkbox | default `true`; `false` removes it from selection for *new* content only (FR-004) — never alters existing references |

**Admin**: `group: "Content"`, `useAsTitle: "label"`, default columns
`["code", "label", "isActive"]` — mirrors `domains.ts` exactly.

**Access**: `read: isStaffOrService` (any editor needs to read the active
list to tag a page), `create/update/delete: isAdmin` — identical shape to
`domains.ts`'s access block (administrator-managed structural data, not
day-to-day content).

**Hooks**:
- `beforeChange` — rejects flipping `isActive: true → false` when it would
  leave zero active languages (FR-004a).
- `beforeDelete` — rejects deleting a language still referenced by any
  `pages.language` or `domains.defaultLanguage` (research.md §6); `leads`
  are not checked (§2 below — `leads.language` is a frozen copy, not a
  reference).

**Seed data** (FR-002, via the migration — research.md §5, step 2):

| code | label | isActive |
|---|---|---|
| `fr` | Français | true |
| `en` | English | true |
| `es` | Español | true |
| `de` | Deutsch | true |

---

## Collection: `pages` — new field `language`

| Field | Type | Notes |
|---|---|---|
| `language` | relationship (`languages`) | required — no `defaultValue`; blocks every save (draft included) until explicitly chosen, unless pre-filled by the creation wizard from the page's domain's `defaultLanguage` (FR-005/FR-006) |

**Placement**: sidebar, alongside `pageType`/`status`/`confirmationPage`.

**Filtering**: the field's admin `filterOptions` restrict the picker to
`isActive: true` — an already-assigned-but-now-inactive language stays
displayed on the page it's on (the relationship itself is untouched by
deactivation), just not offered again for a fresh pick.

**Mutability**: freely editable at any time (like `pageType`) — changing it
only affects future leads captured from the page; leads already captured
keep their own frozen copy (see `leads.language` below).

**Migration backfill**: every pre-existing page gets `fr` (research.md §5,
steps 3-5) — nothing else about the row changes (SC-005).

---

## Collection: `domains` — new field `defaultLanguage`

| Field | Type | Notes |
|---|---|---|
| `defaultLanguage` | relationship (`languages`), optional | pre-fills a new page's `language` in the creation wizard when this domain is chosen there (FR-006); no effect on existing pages |

**Placement**: alongside the existing top-level fields (`isActive`,
`label`), not inside `branding`.

**Migration**: column added nullable, no backfill — optional field, no
domain currently has one, matching FR-006's "MAY."

---

## Collection: `leads` — new field `language`

| Field | Type | Notes |
|---|---|---|
| `language` | text | required; the source page's language **code** (e.g. `"fr"`), copied once by `leadIntake.ts` at the moment of creation (FR-007); never written to again |

**Not** a relationship — see research.md §2. Read-only in practice (no UI
affordance edits it; `leads.update` access already stays Administrator-only
for rectification, same as every other captured field).

**Survives erasure**: like `domainHostname`, `consentStatus`,
`submittedAt`, and `isDuplicate`, `language` is not personal data and is
**not** nulled by the erasure-in-place hook that clears
`email`/`fieldValues`/`metadata` — consistent with how those other
capture-time facts already behave today.

**Admin**: added to `defaultColumns` (alongside `email`, `page`,
`consentStatus`, ...) and made a `where`-filterable column so staff can
filter the list by language (FR-009); no change to `listSearchableFields`
(free-text search stays on `email`).

**Export**: `leadsExport.ts`'s `HEADERS` gains a `language` column, and the
per-row `csvRow(...)` call includes `d.language` (FR-010) — the endpoint
already reads `leads` at `depth: 0`, so this is the raw stored code, no
extra resolution needed.

**Migration backfill**: every pre-existing lead is backfilled from its
(now `fr`-backfilled) page's language, falling back to `fr` directly for
orphaned leads whose page no longer exists (research.md §5, steps 7-9).

---

## Relationships at a glance

```text
languages (new)
  ← pages.language            (required, many pages per language)
  ← domains.defaultLanguage   (optional, many domains per language)

pages.language ──(copied once, at lead-intake time)──> leads.language
```

`leads.language` is deliberately **not** an arrow from `languages` — it has
no live foreign key, by design (research.md §2).
