# Contract: the `languages` collection and its two referencing fields

Internal admin-surface contract — `languages` is read via the standard
Payload REST API (`/api/languages`) by the admin UI (the page editor's
`language` picker, the wizard's `language`/`domain` selects) and by
`leadIntake.ts` indirectly (through `pages.language`, already resolved at
`depth: 1`). No public/renderer-facing endpoint is added or changed.

## `GET /api/languages` (existing Payload REST, no custom endpoint)

Used by: the page editor's `language` field picker; `PageCreateWizard.tsx`.

Callers MUST filter to `isActive: true` when populating a selection UI —
mirroring `PageCreateWizard.tsx`'s existing `domain` fetch
(`/api/domains?limit=200&depth=0&sort=hostname`):

```
GET /api/languages?where[isActive][equals]=true&limit=50&depth=0&sort=code
```

Response (Payload's standard list shape):

```json
{
  "docs": [
    { "id": 1, "code": "fr", "label": "Français", "isActive": true },
    { "id": 2, "code": "en", "label": "English", "isActive": true }
  ]
}
```

## Write rules enforced server-side (not just admin UI affordance)

| Attempt | Result |
|---|---|
| `POST /api/languages` with a `code` that already exists (case/whitespace-insensitive — normalized before comparison) | `400`, duplicate rejected |
| `PATCH` an active language to `isActive: false` when it is the only active language left | `400`, rejected — "at least one active language must remain" |
| `DELETE` a language still referenced by any `pages.language` or `domains.defaultLanguage` | `400`, rejected — names the referencing page(s)/domain(s), same message shape as `pages-confirmation-guard.ts`'s existing delete guard |
| `DELETE` a language only ever referenced by `leads.language` (the text copy) | Allowed — leads keep their already-captured code string regardless (data-model.md, `leads.language`) |

## `pages.language` / `domains.defaultLanguage`

Both are ordinary Payload `relationship` fields to `languages` — no custom
endpoint. The one behavioral contract worth stating explicitly: a
`pages.language` value that points at a now-`isActive: false` language is
**valid and stays valid** — the collection's `filterOptions` only affect
what a *fresh* pick offers, never re-validate an already-stored value
(research.md §6, spec.md Clarifications).
