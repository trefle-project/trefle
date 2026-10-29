# Contract: Page import API (CMS)

All endpoints are Payload custom endpoints under `/api`, authenticated by the
admin session cookie. Caller must be an active Administrator or Editor
(`isAdminOrEditor`); otherwise `403`. Responses are JSON. Error bodies use
Payload's shape: `{ "errors": [{ "message": "<plain French>" , "code": "<errorCode>" }] }`.

---

## GET `/api/page-imports/budget`

Lets the wizard show upfront whether imports are available (edge case
"budget used up").

**200**
```json
{
  "workspace": { "capEur": 20, "spentEur": 12.37, "remainingEur": 7.63 },
  "user": { "budgetEur": 10, "spentEur": 4.10, "remainingEur": 5.90, "isDefault": true },
  "enabled": true,
  "available": true,
  "blockedBy": null,
  "resetsAt": "2026-10-01T00:00:00+02:00"
}
```
`enabled` is `false` when the feature is not configured (no
`ANTHROPIC_API_KEY` and not in fixture mode) or the global cap is 0; the
wizard then shows no import option at all and the start endpoint answers
`409 feature-disabled`. `user` is the calling user. `available` is `false` when either limit is
reached (`spentEur >= capEur/budgetEur`, or a limit of 0); `blockedBy` is then
`"workspace"` or `"user"` (user checked first, so the message is personal
when both are reached).

---

## POST `/api/page-imports/start`

Validates, checks the budget, creates a `page-imports` document (`queued`),
queues and starts the job. Never fetches the source page synchronously
beyond DNS resolution.

**Request**
```json
{
  "url": "https://exemple.fr/offre",
  "pageType": "subscription",
  "title": "Offre automne",
  "domain": 3,
  "path": "/offre-automne",
  "language": 1
}
```
`domain`, `path` optional; `title`, `pageType`, `language`, `url` required.
`path` conflict is checked the same way as the wizard's existing advisory
check (`/api/pages/conflict-check`) — done by the wizard before calling this.

**202**
```json
{ "id": 42, "status": "queued" }
```

**Errors**

| HTTP | `code` | When | Message (fr, shown as-is) |
|---|---|---|---|
| 400 | `invalid-url` | Not parseable, not http/https, credentials in URL, non-standard port | « Cette adresse n'est pas une adresse web valide (elle doit commencer par https:// ou http://). » |
| 400 | `private-address` | Host resolves to any non-public address (R4) | « Cette adresse pointe vers un réseau interne : seules les pages publiques peuvent être importées. » |
| 400 | `unresolvable` | DNS lookup fails | « Ce site est introuvable. Vérifiez l'adresse. » |
| 400 | `invalid-input` | Missing title/pageType/language | Field-specific message. |
| 409 | `feature-disabled` | Feature not configured or global cap = 0 | « L'import de pages n'est pas activé. » |
| 409 | `user-budget-exhausted` | The user's month total ≥ their budget, or budget = 0 | « Votre budget mensuel d'import est épuisé. Vous pourrez de nouveau importer le 1er <mois>, ou demander à un administrateur d'augmenter votre budget. » |
| 409 | `budget-exhausted` | Workspace month total ≥ global cap, or cap = 0 | « Le budget mensuel d'import de l'espace de travail est épuisé. Les imports seront de nouveau possibles le 1er <mois>. » |
| 403 | — | Not an active admin/editor | Payload default. |

---

## GET `/api/page-imports/:id` (standard Payload REST read)

Polled by the wizard every 2 s while `status` is `queued`/`running`.
Relevant fields: `status`, `step`, `progress`, `errorCode`, `errorMessage`,
`page` (id once completed). Use `?depth=0`.

---

## POST `/api/page-imports/:id/cancel`

Sets `cancelRequested`. Idempotent. Only the import's creator or an
Administrator may cancel.

**200** `{ "id": 42, "status": "running", "cancelRequested": true }` — the
job reaches `cancelled` at its next checkpoint (≤ a few seconds; an
in-flight AI call is aborted via `AbortController`).

**409** `{ code: "already-finished" }` when the import is terminal.

---

## PATCH `/api/page-imports/:id` (standard REST, field-restricted)

Only `{ "reportDismissed": true }` is writable (field-level access), used by
the page's report panel.

---

## Job failure codes (`page-imports.errorCode`)

| `errorCode` | Step | Message (fr) |
|---|---|---|
| `unreachable` | render | « La page n'a pas pu être chargée (le site ne répond pas ou refuse la connexion). » |
| `not-html` | render | « Cette adresse ne mène pas à une page web (fichier PDF, image…). » |
| `login-required` | render | « Cette page demande une connexion ou un paiement : elle ne peut pas être importée. » (HTTP 401/403, or a detected login wall) |
| `blocked` | render | « Le site a bloqué la visite automatique (protection anti-robots). » |
| `private-address` | render | Same as the start endpoint (redirect to an internal address). |
| `too-long` | render | « La page est trop longue pour être importée en entier. » (only if nothing usable fits; otherwise the import proceeds on the first 12 000 px and says so in the report) |
| `ai-unavailable` | convert | « Le service de conversion est momentanément indisponible. Réessayez dans quelques minutes. » (FR-028) |
| `ai-refused` | convert | « Le service de conversion a refusé de traiter cette page. » |
| `ai-invalid` | convert | « La conversion n'a pas abouti (réponse incomplète). Réessayez. » |
| `timeout` | any | « L'import a pris trop de temps et a été interrompu. » (FR-021, hard limit 4 min) |
| `internal` | any | « Une erreur inattendue s'est produite. Réessayez, ou contactez le support si le problème persiste. » |

Every failure: no page created, created media deleted, `errorMessage` set,
error reported to the existing `afterError` sink with the import id (no
source content).

---

## Browser service (internal, not exposed)

`browser` container: `mcr.microsoft.com/playwright:v1.63.0-noble` running
`npx playwright@1.63.0 run-server --port 3100 --host 0.0.0.0`, reachable only
from `cms` on the `browser` compose network at `ws://browser:3100/`
(`BROWSER_WS_URL`). The CMS's `playwright-core` version MUST equal the image
tag (1.63.0). No published ports, `mem_limit: 1g`, `restart: unless-stopped`.
