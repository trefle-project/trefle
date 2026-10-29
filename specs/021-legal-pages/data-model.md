# Data model: Legal pages per domain

**Feature**: 021-legal-pages | **Research**: [research.md](research.md)

## Settings (global) — new fields (Administrators only, R1)

| Field | Type | Rules |
|---|---|---|
| `operator.name` | text | required for completeness |
| `operator.legalForm` | text | |
| `operator.registration` | text | SIREN / RCS / other |
| `operator.address` | textarea | required for completeness |
| `operator.email` | email | required for completeness |
| `operator.phone` | text | |
| `suppliers[]` | array | `name` (required), `role` (required), `location`, `safeguards`, `isHost` (checkbox, at most one), `address`, `phone` (for the host); ordered |
| `legalTexts[]` | array | `language` → languages (active, unique per row), `privacyPolicy` (rich text), `legalNotice` (rich text), `policyLinkLabel` (text), `noticeLinkLabel` (text); **a French row is required** (beforeChange hook, like the banner texts) |

Unchanged but no longer used for new forms: `defaultPrivacyNoticeUrl`,
`defaultPrivacyNoticeVersion` (hidden in the admin; removed in a later
release — Principle III).

## Domains — new fields (Administrators, as today; Editors read)

| Field | Type | Rules |
|---|---|---|
| `owner.name` | text | required for completeness |
| `owner.legalForm` | text | |
| `owner.registration` | text | |
| `owner.address` | textarea | required for completeness |
| `owner.email` | email | data-protection contact; required for completeness |
| `owner.director` | text | publication director; required for completeness |
| `ownPrivacyPolicyUrl` | text (URL) | optional; when set, links go there and `/confidentialite` redirects there |
| `ownLegalNoticeUrl` | text (URL) | same for `/mentions-legales` |
| `legalExtras[]` | array | `language` (unique per row), `privacyParagraph` (rich text), `noticeParagraph` (rich text) — both optional |

## New collection `legal-versions` (R5)

Read: Administrators and Editors (second factor, like the rest of the
admin). Create/update/delete: nobody (written by code with
`overrideAccess`).

| Field | Type | Rules |
|---|---|---|
| `domain` | relationship → domains | required |
| `kind` | select `privacy` \| `notice` | required |
| `language` | text (code) | required |
| `version` | text | 12 hex chars (SHA-256 of `html`), required |
| `html` | textarea | the page body as published |
| `createdAt` | date | Payload default = first publication |

Unique index (`domain`, `kind`, `language`, `version`).

## ConsentRecords — unchanged fields, new meaning

`privacyNoticeUrl` / `privacyNoticeVersion` now receive the **effective**
link and version (R6). A UI field « Politique acceptée » links to the
`legal-versions` row matching (domain of the lead's page, `privacy`, version)
when it exists.

## Pages (form group) — behaviour change

`form.privacyNoticeUrl` / `privacyNoticeVersion`: no default from Settings
any more; empty = « the domain's policy ». Migration clears them where they
equal the Settings defaults (R6).

## Placeholders (R2)

`operator.*`, `owner.*`, `host.name`, `host.address`, `host.phone`, `site`, `retention.leads`, `suppliers`,
`cookieBanner`, `extra`, `measurementPage`. A block containing an empty or
unknown placeholder is dropped.
