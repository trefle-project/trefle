# Data Model: Admin access

**Feature**: 019-admin-access | **Date**: 2026-10-11

One Payload migration, expand only (down path drops what it adds).

## `users` (existing collection)

| Field | Type | Source | Notes |
|---|---|---|---|
| `totpSecret` | text, hidden | plugin | Set by the plugin's setup endpoint; cleared by `reset-totp` (endpoint or script). Never returned by the API. |
| `hasTotp` | virtual / read with the document | plugin | Drives `forceSetup` and `totpAccess`. |

Unchanged: `role`, `isActive`, `isService`, `invitationStatus`, API key.

Access changes: `unlock` → Administrators only. `isService` (API-key) users
are not subject to the second factor.

**States** of a human member:

```text
invited ──first login──► password set, not enrolled ──setup──► enrolled
                                   ▲                              │
                                   └──── reset-totp (admin/SSH) ◄─┘
enrolled ──N wrong codes──► locked (lockTime) ──Force Unlock (admin) / time──► enrolled
any ──isActive=false──► refused at login (immediately), at the edge after apply.sh
```

## `totp-attempts` (plugin collection, hidden)

One document per user who submitted a code: count of wrong codes, lock until.
No access for anyone; not exposed. Table `totp_attempts`.

## `edge-access` (NEW global, hidden)

| Field | Type | Notes |
|---|---|---|
| `emails` | array of text | The allow-list `apply.sh` last applied to Cloudflare Access, lower-cased, sorted. |
| `syncedAt` | date | When `apply.sh` reported it. |

Written only by `POST /api/edge-access/synced` (sync secret). Read by the
drift banner (server side). Not readable through the public API by humans
(`read: isAdmin`), not editable in the admin.

**Drift** (computed, not stored): `toAdd = activeMemberEmails − emails`,
`toRemove = emails − activeMemberEmails`, where `activeMemberEmails` = users
with `isActive !== false` and `isService !== true`, lower-cased.

## `activity-log` (existing collection)

New `type` options (kebab-case, like the existing ones; `actor` is a relation to
`users`, so system actions leave it empty):

| Type | Actor | Target | When |
|---|---|---|---|
| `totp-enrolled` | the member | user id | Setup completed (afterChange on `totpSecret` set). |
| `totp-reset` | Administrator, or none (`meta.via: "ssh"`) | user id | Endpoint or script cleared the secret. |
| `totp-locked` | — | user id | Wrong-code lockout reached (FR-009 "failed attempts"). |
| `edge-synced` | none (`apply.sh`) | count of addresses | `POST /api/edge-access/synced`. |

No e-mail address in `targetId` (existing rule: never PII).
