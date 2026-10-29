# Phase 1 Data Model: Double opt-in confirmation email

One new collection, three extended ones. Every new column is
optional/nullable — no backfill needed (research.md §10).

---

## New collection: `opt-in-emails`

| Field | Type | Notes |
|---|---|---|
| `subject` | text | required |
| `body` | textarea | required; must contain the literal `{{confirmUrl}}` placeholder — enforced by a field-level `validate` (FR-002, research.md §3), not a hook |
| `language` | relationship (`languages`) | required, `filterOptions: { isActive: true }` — same shape as `pages.language` |

**Admin**: `group: "Content"`, `useAsTitle: "subject"`, default columns
`["subject", "language"]`.

**Access**: `read: isStaffOrService`, `create`/`update`/`delete:
isAdminOrEditor` — matches `pages.ts`'s access shape (this is authored
content, like a page, not admin-only structural data like `domains`/
`languages`).

**Hooks**: `beforeDelete` — rejects deleting one still attached to any
page's `optInEmail`, naming the page(s) (research.md §9); same shape as
`pages-confirmation-guard.ts`'s `confirmationGuardOnDelete`.

---

## Collection: `pages` — new field `optInEmail`

| Field | Type | Notes |
|---|---|---|
| `optInEmail` | relationship (`opt-in-emails`), optional | `filterOptions: ({ siblingData }) => ({ language: { equals: siblingData?.language } })`; an async field-level `validate` re-checks the same language match server-side (research.md §4, FR-004) |

**Placement**: sidebar, alongside `confirmationPage` (a related, but
distinct, optional content-attachment field — see spec.md Context for why
they're deliberately not confused).

**Mutability**: freely editable at any time; per spec.md's Edge Cases,
changing or clearing it only affects *future* submissions — an
already-sent email or already-recorded confirmation never changes
retroactively.

**Meaningful only for `pageType: "subscription"`** (FR-003) — not
enforced by a new check: `free`/`confirmation` pages can never carry a
lead-capture form at all (`pages-publish-guard.ts`, 004-page-types), so
there is nothing that would ever read this field on them regardless.

---

## Collection: `domains` — new fields `senderName` / `senderEmail`

| Field | Type | Notes |
|---|---|---|
| `senderName` | text, optional | e.g. "Trefle" |
| `senderEmail` | email, optional | e.g. `no-reply@example.com` |

Both optional; unset means `leadIntakeEndpoint` passes no `from` override
to `payload.sendEmail`, which already falls back to the adapter's
`defaultFromAddress` (`SMTP_FROM`) — FR-006's fallback, for free
(research.md §8). No migration backfill: no domain has these set today.

---

## Collection: `leads` — new field `optInConfirmedAt`

| Field | Type | Notes |
|---|---|---|
| `optInConfirmedAt` | date, optional | `admin: { readOnly: true, position: "sidebar" }` — same shape as the existing `erasedAt` field; set exactly once, by `POST /api/leads-confirm`, never by any other code path (FR-009/FR-010) |

**Independent of `consentStatus`** — never read by
`leadsExport.ts`'s `consentedOnly` filter, `retentionSweep`, or the DSR
endpoints; this feature adds a fact, it doesn't change what any existing
code does with it (Clarifications, FR-012).

**Survives erasure**, same reasoning as `language` in 005: not personal
data, not nulled by the erasure-in-place hook.

**Admin**: added to `defaultColumns` and the CSV export `HEADERS`
(FR-013).

---

## Relationships at a glance

```text
opt-in-emails (new)
  ← pages.optInEmail   (optional, language-matched to the page)

languages (005)
  ← opt-in-emails.language

domains.senderName/senderEmail ──(read at send time, no relationship)──> leadIntakeEndpoint

pages.optInEmail ──(read once, at lead-intake time)──> leads.optInConfirmedAt
                                                          (set later, by /confirm)
```
