# Data Model: Custom code and direct HTML editing

All changes are on the existing `pages` collection plus one shared constant
list. One expand-only Payload migration.

## `pages.customCode` (new group)

Access (whole group, field-level — [research R1](research.md#r1--where-page-code-lives-and-how-admins-only-is-enforced)):

| Operation | Allowed |
|---|---|
| read | active admin, renderer service account |
| create / update | active admin |

Editors: the group is absent from every read and ignored on every write.

```text
customCode (group, admin: collapsible « Scripts », after `seo`)
├── scriptsWarning      ui     → ScriptsConsentWarning (FR-008b)
├── head (group)
│   ├── code            textarea  maxLength 50 000, optional
│   └── consent         select    "consent" | "essential", default "consent"
├── bodyEnd (group)
│   ├── code            textarea  maxLength 50 000, optional
│   └── consent         select    "consent" | "essential", default "consent"
└── blocks (array, admin.hidden — edited from the GrapesJS block, R9)
    ├── codeId          text      required, unique within the page (uuid)
    ├── code            textarea  maxLength 50 000
    └── consent         select    "consent" | "essential", default "consent"
```

Labels (French, admin UI): « Dans l'en-tête de la page », « En fin de page »,
« Consentement » → « Nécessite le consentement cookies » / « Essentiel ».

### Validation rules

- `code` ≤ 50 000 characters each (FR-021) — Payload `maxLength`, French
  message giving the limit.
- `blocks[].codeId` unique within the page (validate on the array).
- Empty `code` = snippet absent; nothing is rendered.
- No content validation of `code` (spec Assumptions).

### Lifecycle

- **Admin save**: orphan `blocks` rows (id not referenced by any
  `data-code-id` in `builder.html`) are dropped by
  `pagesCustomCodeGuard` ([R6](research.md#r6--refusing-an-editor-introduced-code-reference-fr-018)).
- **Editor save**: `customCode` untouched (field access); a new
  `data-code-id` absent from the stored rows → `ValidationError`, save
  refused.
- **Duplicate** (Payload built-in): copies `customCode` when run by an admin;
  refused for an editor if the page has code blocks (R6).
- **A/B variant** (`createTestVariant`): `customCode` copied server-side,
  array row ids stripped (FR-006).

## `pages.builder.html` — custom-code placeholder

Marker emitted by the GrapesJS `custom-code` component:

```html
<div data-block="custom-code" data-code-id="7f3c…" id="…" class="…" style="…"></div>
```

- `custom-code` is added to `BLOCK_TYPES` (`@trefle/shared/blocks.ts`) so
  it is counted like other blocks; it plays no role in the lead-form rule.
- Survives `sanitizeHtml` (a `div` with `data-*`, `id`, `class`, `style`).
- The renderer replaces it with the row whose `codeId` matches; no match →
  empty (never an error on the public page).

## `activity_log.type` — new value

`page-code-changed` (added to `ActivityType` in `@trefle/shared` and to the
`ActivityLog` select options). Written by `pageActivity` when any of
`customCode.head`, `customCode.bodyEnd`, `customCode.blocks` differs;
`meta = { path, domainId, parts: ("head" | "bodyEnd" | "blocks")[] }`,
`actor` = the admin (FR-023).

## Shared sanitize config (`@trefle/shared/html-allowlist.ts`)

Not persisted; the single source for publication, the « Code » view warning
and import tests (FR-015). `ALLOWED_TAGS` / `ALLOWED_ATTR` widened per
FR-011 and [R7](research.md#r7--one-sanitize-config-widened-fr-011012013015);
exported together as `SANITIZE_CONFIG`.

## `@trefle/shared/custom-code.ts` (new, constants + pure helpers)

- `CUSTOM_CODE_MARKER = "custom-code"`, `CODE_ID_ATTR = "data-code-id"`
- `CONSENT_VALUES = ["consent", "essential"] as const`
- `CUSTOM_CODE_MAX_LENGTH = 50_000`
- `withNonce(snippet, nonce): string` — adds/replaces `nonce` on every
  `<script` opening tag (R2)
- `codeIdsIn(html): string[]` — every `data-code-id` value in page HTML (R6)

## Migration `YYYYMMDD_custom_code`

Up (expand only):

- `pages`: `custom_code_head_code` text, `custom_code_head_consent`
  enum (`consent`,`essential`) default `consent`, same two for `body_end`;
  same columns on `_pages_v` if versions are enabled for pages.
- New table `pages_custom_code_blocks` (`_order`, `_parent_id` → pages,
  `id`, `code_id`, `code`, `consent`).
- `enum_activity_log_type`: add `page-code-changed`.

Down: drop the table and columns (every page script and code block is
lost — the expected undo); recreate `enum_activity_log_type` without the new
value, first folding `page-code-changed` rows into `page-content-changed` so
the audit trail survives (same approach as `20260926_090000_form_field_types`).

Generated with `payload migrate:create` against the real schema, never
hand-written column names.
