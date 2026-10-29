# Contract: the `/confirm` route and `POST /api/leads-confirm`

Mirrors `/unsubscribe` + `POST /api/consent-withdraw` exactly (research.md §7)
— same neutral, non-enumerating, no-login, JS-optional shape.

## `GET /confirm?token=...` (apps/web)

| Token state | Response |
|---|---|
| Missing/invalid/tampered | Neutral failure page ("Lien invalide ou expiré") — never reveals whether a lead/token was ever valid (FR-011) |
| Valid | A page with one "Confirmer" button, a hidden `token` field, posting to a Server Action — works without JavaScript |

## Server Action → `POST /api/leads-confirm` (apps/cms)

Request: `{ "leadId": string | number }` (the web route resolves this
from the verified token before calling — the CMS endpoint itself never
re-parses a token, matching `consent-withdraw`'s own division of
responsibility).

| Condition | Effect |
|---|---|
| Caller isn't service-or-staff | `403` |
| `leadId` missing | `400` |
| Lead not found (deleted/never existed) | `{ ok: true }` regardless — idempotent + non-enumerating, same as `consent-withdraw` |
| Lead found, `optInConfirmedAt` unset | Sets it to now; `{ ok: true }` |
| Lead found, `optInConfirmedAt` already set | No write — response is identical either way (FR-010, idempotent) |

## Guarantee

Visiting the same valid link any number of times always succeeds the
same way; the recorded `optInConfirmedAt` only ever reflects the first
successful confirmation.
