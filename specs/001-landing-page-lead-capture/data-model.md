# Phase 1 Data Model: Landing Page Builder with GDPR-Compliant Lead Capture

All persistence is Payload collections and globals in one PostgreSQL database. `web` never
touches these tables directly — it reads via Payload's API (see `contracts/`). Field types
are Payload field types; "rel→X" is a `relationship` to collection X.

Legend: **PII** = personal data subject to erasure/retention. `req` = required.

---

## Collection: `users` (Payload auth)

| Field | Type | Notes |
|---|---|---|
| `email` | email (auth) | req, unique — **PII** (staff, not a data subject under this feature) |
| `role` | select | req, `admin` \| `editor`, default `editor` |
| `name` | text | optional |
| `isActive` | checkbox | default `true`; `false` ⇒ access denied |
| password / reset | (Payload auth internals) | onboarding via "set password" email |

**Access**: `admin` full; `editor` may read own document only; anonymous none.

**Hooks**:
- `beforeChange` / `beforeDelete` — reject if the operation would leave zero `role==='admin'
  && isActive` users (last-admin guard, FR-034a).
- `afterChange` (create) — trigger Payload's set-password email.

**Also**: one `service` user with an **API key** (no password login), read-only access to
published `pages`, `domains`, `settings`; write access limited to the `lead-intake`,
`consent-withdraw`, and `page-stats` endpoints. Used by `web`.

---

## Collection: `domains`

| Field | Type | Notes |
|---|---|---|
| `hostname` | text | req, unique, lowercase, no scheme/path (e.g. `promo.example.com`, `site.localhost`) |
| `isActive` | checkbox | default `true` — inactive ⇒ renderer returns not-found |
| `label` | text | admin-facing name |
| `branding` | group | optional: `faviconUrl`, `defaultOgImage` (rel→media), `themeTokens` (json) |
| `notFoundPagePath` | text | optional path to serve for unmatched paths on this host |

**Access**: read — `admin`, `editor`, `service`; create/update/delete — `admin` only
(FR-006a: "an Administrator registers domains").

**Hooks**: `afterChange`/`afterDelete` → revalidate tags `domain:<id>` and `page-list`.

**Validation**: `hostname` matches a host pattern; uniqueness case-insensitive.

---

## Collection: `pages`

| Field | Type | Notes |
|---|---|---|
| `title` | text | req (admin-facing + `<title>` default) |
| `domain` | rel→domains | req to publish |
| `path` | text | req; leading slash; unique per `domain`; `/` allowed |
| `status` | select | `draft` \| `published`, default `draft` |
| `publishedAt` | date | set on first transition to `published` |
| `builder` | group | GrapesJS data — see below |
| `form` | group | lead-form config — see below |
| `seo` | group | `metaTitle`, `metaDescription`, `ogImage` (rel→media) |
| `stats` | join/virtual | derived from `page-stats` (views, submissions, conversion) |

### `builder` group

| Field | Type | Notes |
|---|---|---|
| `projectData` | json | GrapesJS project (components + styles); source of truth for editing |
| `html` | textarea (generated) | GrapesJS export; **the only thing `web` renders** |
| `css` | textarea (generated) | GrapesJS export; injected scoped to the page |
| `blockCount` | json (generated) | `{ leadForm: n, ... }` cache of block tallies for the guard |

### `form` group

| Field | Type | Notes |
|---|---|---|
| `fields` | array | ordered; each: `name` (slug, req), `label` (req), `type` (`email`\|`text`\|`textarea`\|`select`\|`checkbox`), `required` (bool), `options` (for select) |
| `submitLabel` | text | default "Envoyer" |
| `successMessage` | textarea | req — shown after a valid submission |
| `consentPurposeText` | textarea | req — plain-language purpose next to the consent control; defaults from `settings` |
| `privacyNoticeUrl` | text | req — defaults from `settings` |
| `privacyNoticeVersion` | text | req — stamped onto each consent record |

Exactly one `email`-type field is required; the consent control is implicit (always rendered,
never a normal `fields` entry) so it can't be removed or pre-ticked (FR-015/020).

**State transitions**:

```
draft ──publish──▶ published ──unpublish──▶ draft
  ▲                                  │
  └───────── edit (stays draft) ─────┘   edits to a published page create an
                                          unpublished revision; live stays until re-publish
```

**Access**: read published — `admin`, `editor`, `service`; read draft — `admin`, `editor`;
create/update/delete — `admin`, `editor`; `service` never writes.

**Hooks**:
- `beforeValidate` — recompute `builder.blockCount` from `projectData`.
- `beforeChange` (on `status → published`) — reject unless `blockCount.leadForm === 1`, a
  `domain` is set, `path` is unique among published pages for that domain, and required
  `form` fields are filled (FR-002a, FR-003).
- `beforeChange` — regenerate `builder.html`/`css` from `projectData` (server-side GrapesJS
  render) so the stored markup always matches the saved project.
- `afterChange`/`afterDelete` — if published state or content changed, revalidate
  `page:<id>`, `domain:<domainId>`, `page-list`.

**Delete behaviour**: page deletion MUST NOT cascade to `leads` or `consent-records`; leads
keep pointing at a now-missing page as orphans, retained for FR-001a, FR-026, and retention.

---

## Collection: `leads`

| Field | Type | Notes |
|---|---|---|
| `page` | rel→pages | req (may point to a later-deleted page — keep as orphan) |
| `domainHostname` | text | denormalised host at capture time |
| `email` | email | req — **PII** |
| `fieldValues` | json | submitted values for the page's non-email fields — **PII** |
| `metadata` | group | `pageUrl`, `referrer`, `utm` (json: source/medium/campaign/term/content), `userAgent` — **PII-ish**, retained/erased with the lead |
| `consentStatus` | select | `consented` \| `withdrawn`, default `consented` |
| `consentRecord` | rel→consent-records | req, one-to-one |
| `isDuplicate` | checkbox | true if same `email` already submitted to this `page` |
| `submittedAt` | date | req, capture time — retention clock |
| `erasedAt` | date | set when personal fields were nulled (retention or DSR) |

**Erasure-in-place**: on retention or DSR erase, null `email`, `fieldValues`, `metadata`;
keep `page`, `submittedAt`, `isDuplicate`, `erasedAt` for statistics. A fully erased lead
never reappears in views/exports (filtered on `erasedAt == null`). The same operation also
nulls the linked `consent-records` row's `email`, `ipAddress`, and `userAgent` (retention
and DSR erase alike), keeping that record's non-personal proof fields (FR-031a).

**Access**: read + export — `admin`, `editor`; **update (rectification) — `admin` only**
(FR-034a); delete — `admin`; create — only via the `lead-intake` endpoint (service). No
anonymous access (FR-036).

**Hooks**: `beforeChange` (create) forbidden outside the intake endpoint context.

---

## Collection: `consent-records` (immutable)

| Field | Type | Notes |
|---|---|---|
| `lead` | rel→leads | req |
| `email` | email | req — **PII** (needed to answer DSR lookups even if the lead is edited) |
| `consentText` | textarea | req — exact consent control wording shown |
| `purposeText` | textarea | req — exact purpose wording shown |
| `privacyNoticeUrl` | text | req |
| `privacyNoticeVersion` | text | req |
| `capturedAt` | date | req |
| `ipAddress` | text | req — consent evidence (FR-011/017) |
| `userAgent` | text | req |
| `withdrawnAt` | date | set on consent withdrawal; the only mutable field |
| `pageSnapshotRef` | text | page id + content hash at capture time |

**Access**: read — `admin`, `editor`; create — service (intake) only; update — service
(withdrawal sets `withdrawnAt` only); **no delete**. The personal fields (`email`,
`ipAddress`, `userAgent`) are nulled when the linked lead is erased — by a DSR erasure **or
by the retention sweep** — keeping the rest as non-personal proof.

**Rule**: all fields except `withdrawnAt` are write-once (`beforeChange` rejects other
changes); the personal fields may additionally be nulled by lead erasure/retention.

---

## Collection: `data-subject-requests`

| Field | Type | Notes |
|---|---|---|
| `email` | email | req — target; **PII while open**, cleared after an erasure it covers |
| `type` | select | `access` \| `portability` \| `rectification` \| `erasure` |
| `status` | select | `received` \| `in_progress` \| `completed`, default `received` |
| `receivedAt` | date | req |
| `completedAt` | date | set on completion |
| `notes` | textarea | non-personal handling notes |
| `resultRef` | text | for access/portability: pointer/id of the generated export artifact |

**State**: `received → in_progress → completed` (no reopen; a new request is a new row).

**Access**: create / read / status progression — `admin`, `editor` (recording requests,
running access & portability exports). **Executing an erasure — `admin` only** (FR-034a).
No anonymous.

**Hook**: on `type==='erasure'` completion, `email` and any personal `notes` are cleared;
row persists as dated proof (FR-027).

---

## Collection: `page-stats`

| Field | Type | Notes |
|---|---|---|
| `page` | rel→pages | req |
| `date` | date (day granularity) | req; unique with `page` |
| `views` | number | default 0 |
| `submissions` | number | default 0 |

**Access**: read — `admin`, `editor`; increment — service endpoints only (atomic `+1`).

---

## Collection: `activity-log` (non-personal audit)

| Field | Type | Notes |
|---|---|---|
| `type` | select | `page-published` \| `page-unpublished` \| `page-content-changed` \| `member-invited` \| `member-role-changed` \| `member-removed` \| `settings-changed` \| `leads-exported` \| `dsr-completed` \| `retention-deletion` |
| `actor` | rel→users | null for system actions (retention) |
| `targetType` | text | `page` \| `user` \| `settings` \| `export` \| `lead-batch` |
| `targetId` | text | id or short description (no PII) |
| `at` | date | req |
| `meta` | json | non-personal detail (counts, page path, role names) |

**Access**: read — `admin` (and `editor` for page-scoped entries, FR-034b/US1-8); append
only — system/hooks; no update/delete.

---

## Global: `settings`

| Field | Type | Notes |
|---|---|---|
| `retentionMonths` | number | default 24, min 1 (FR-030) |
| `defaultConsentPurposeText` | textarea | seeds new pages' `form.consentPurposeText` |
| `defaultPrivacyNoticeUrl` | text | seeds new pages |
| `defaultPrivacyNoticeVersion` | text | seeds new pages |
| `exportConsentedOnlyByDefault` | checkbox | default `true` (FR-024) |
| `senderEmail` | text | FROM for onboarding + notifications |
| `notifyOnNewLead` | checkbox | default `false` (minimal in v1) |
| `notifyEmails` | array of email | recipients when the above is on |

**Access**: read — `admin`, `editor`; update — `admin` only. `afterChange` → `activity-log`
`settings-changed`; changing default consent/privacy text does **not** touch existing pages
or consent records (FR-018, US4-3).

---

## Relationship summary

```
users (1) ──creates──▶ pages, domains, data-subject-requests
domains (1) ──has many──▶ pages            pages (1) ──has one──▶ form (embedded)
pages (1) ──has many──▶ leads ──has one──▶ consent-records
pages (1) ──has many──▶ page-stats (per day)
leads.email ◀──lookup key──▶ data-subject-requests.email, consent-records.email
settings (global) ──seeds──▶ pages.form defaults
* mutating actions ──append──▶ activity-log
```

## Validation rules cross-referenced to spec

| Rule | Where enforced | Spec |
|---|---|---|
| Exactly one lead-form block to publish | `pages.beforeChange` | FR-002a, US1-2/3 |
| No publish without a domain + unique path | `pages.beforeChange` | FR-003, FR-006a |
| Email field required in every form | `pages` form validation | FR-007 |
| Consent not pre-ticked, required to submit | form renderer + `lead-intake` | FR-015, FR-020 |
| Immutable consent record per consented lead | `consent-records` write-once | FR-017, SC-003 |
| No lead without active consent | `lead-intake` | FR-010, FR-015, SC-004 |
| Duplicate flag on repeat email+page | `lead-intake` | FR-013 |
| No submission to unpublished page | `lead-intake` (status check) | FR-014 |
| Historical consent wording preserved on later edits | `consent-records` write-once, `settings` no-cascade | FR-018, US4-3 |
| Erasure across all pages incl. deleted | `dsr-erase` scans by email | FR-026, US3-2 |
| Deleting a page never deletes its leads / consent records | `pages` delete behaviour (no cascade) | FR-001a |
| Non-personal residue after erasure | erase-in-place + `activity-log` | FR-027 |
| Retention auto-delete, resumable, strict predicate | `retention-sweep` job | FR-030–032, SC-007 |
| Retention also scrubs the linked consent record's personal fields | `retention-sweep` job | FR-031a |
| Erasure + rectification are Administrator-only | `dsr-erase` endpoint + `leads` update access | FR-026, FR-028, FR-034a, US5-3a |
| Role restrictions (editor ≠ admin) | `access/*` functions | FR-034a, US5-2/3 |
| Last admin protected | `users` hook | FR-034a, US5-4 |
| Sensitive actions attributable | `activity-log` appenders | FR-034b, US5-6, US1-8 |
| No PII in logs | logging policy + review | FR-038 |
