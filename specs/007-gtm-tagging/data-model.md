# Phase 1 Data Model: Google Tag Manager tagging & cookie consent

No new collection and no migration touching `pages`/`leads`. Two existing
Payload entities gain fields; one client-side, non-Payload entity is
introduced.

## `domains` (extended)

| Field | Type | Notes |
|---|---|---|
| `gtmContainerId` | text, optional | Format-validated `GTM-XXXXXXX` (case-insensitive on input, stored uppercase-normalized, mirroring `hostname`'s own normalize-on-`beforeValidate` pattern). Empty by default (FR-001). |
| `consentBannerEnabled` | checkbox | Default `true` (FR-005; spec.md Assumptions). Independent of `gtmContainerId` — neither field's admin UI condition depends on the other. |

Both fields follow `senderName`/`senderEmail`'s existing precedent on this
same collection: plain, optional, no relationship, editable by `isAdmin`
only (the collection's existing `update: isAdmin` access rule covers
these too — no new access rule needed).

## `settings` (global, extended)

| Field | Type | Notes |
|---|---|---|
| `cookieBannerTranslations` | array | One entry per language the banner has copy for. |
| `cookieBannerTranslations[].language` | relationship → `languages` | `filterOptions: { isActive: { equals: true } }`, mirroring `pages.language`. |
| `cookieBannerTranslations[].title` | text | Banner heading. |
| `cookieBannerTranslations[].body` | textarea | Banner explanatory text. |
| `cookieBannerTranslations[].acceptLabel` | text | Defaults seeded to "Accepter" (fr) etc. |
| `cookieBannerTranslations[].rejectLabel` | text | Defaults seeded to "Refuser" (fr) etc. |
| `cookieBannerTranslations[].revisitLabel` | text | Text for the persistent revisit control (FR-007), e.g. "Préférences cookies". |

Seeded at launch with four entries (fr/en/es/de), matching
`005-content-language-tagging`'s seeded Languages — the French entry is
the ultimate fallback FR-014 requires and therefore MUST always exist
(field-level `validate` on the array, or a migration-time guarantee,
prevents removing the last `fr` entry — mirrors `languages-lifecycle.ts`'s
`preventLastActiveDeactivation` shape at the design level; exact
enforcement point is an implementation decision for `tasks.md`, not a
data-model concern).

## `pages` / `PublishedPage` (renderer-side read, no schema change)

`005-content-language-tagging` already added `pages.language` in the CMS;
this feature is the first to have the **renderer** read it.
`apps/web/src/lib/payload-client/index.ts`'s `PublishedPage` interface
gains:

| Field | Type | Notes |
|---|---|---|
| `language` | `{ code: string } \| undefined` | Read-only from the renderer's side; `getPublishedPage` already fetches at `depth: 1`, so no query change — only the TypeScript shape gains the field. `getPageForSubmission`'s `Pick<...>` grows to include it and its fetch depth changes `0 → 1` (research.md §3). |

## Consent choice (client-side only — not a Payload entity)

| Field | Type | Notes |
|---|---|---|
| choice | `"accepted" \| "rejected"` | The visitor's latest decision for the current domain. |
| decidedAt | ISO timestamp | Used to compute the 6-month expiry (FR-006). |

Stored as one first-party cookie (research.md §9), scoped to the exact
host by the browser's own same-origin cookie rules — no `domainId` needs
to be encoded in it, and no server-side record is created. Deliberately
**not** a Payload collection: it is not a legal evidentiary record (unlike
`consent-records` from `001-landing-page-lead-capture`, which remains
untouched), has no admin-visible lifecycle, and never needs querying,
filtering, or exporting.

## Relationships summary

```text
domains
 ├── gtmContainerId          (new, scalar)
 ├── consentBannerEnabled    (new, scalar)
 └── defaultLanguage ──────► languages   (existing, 005 — now also the
                                          fallback language for domains
                                          with no page-specific one, e.g.
                                          /unsubscribe, /confirm)

settings (global)
 └── cookieBannerTranslations[] ──► languages   (new array, per-language copy)

pages
 └── language ──────► languages   (existing, 005 — now also read by
                                    apps/web for the banner's language)
```
