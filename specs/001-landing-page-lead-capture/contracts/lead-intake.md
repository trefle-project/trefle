# Contract: Public lead intake

**Owner**: `apps/web` · **Path**: `POST /api/leads` · **Auth**: none (public); protected by
edge checks. Called by the browser form (also works as a plain non-JS form POST).

## Request

`Content-Type: application/x-www-form-urlencoded` or `application/json`.

| Field | Req | Notes |
|---|---|---|
| `pageId` | yes | target page (rendered into the form as a hidden field) |
| `formToken` | yes | signed token issued at page render; carries `pageId`, `issuedAt`, HMAC |
| `email` | yes | validated against RFC-ish + MX-less format check |
| `<custom field name>` | per form config | one key per `page.form.fields` entry |
| `consent` | yes | must equal `"on"` / `true`; absence or any other value ⇒ 422 |
| `hp_email` | no | **honeypot** — any non-empty value ⇒ 204, nothing stored |

## Behaviour

1. `Host` header ∈ active `domains` → else `403`.
2. Honeypot set → `204 No Content` (silent).
3. `formToken` invalid / `issuedAt` age <2s or >2h → `422` (`code: "timing"`).
4. Rate limit: per IP (10/min, 100/day) or per `(email,pageId)` (3/day) exceeded → `429`.
5. Load page via Payload API; if `status !== "published"` → `409` (`code: "unpublished"`).
6. Validate submitted fields against `page.form.fields` (required, type, select options) →
   `422` with `errors: [{ field, code }]` on failure, echoing back safe submitted values.
7. `consent` not truthy → `422` (`code: "consent_required"`, `field: "consent"`).
8. Call Payload `POST /api/lead-intake` (service key) with the normalised payload +
   `ip`, `userAgent`, `referer`, parsed `utm`. Payload creates `lead` + `consent-record`
   atomically, sets `isDuplicate`, increments `page-stats.submissions`.
8a. If that call fails with a connection error or 5xx, retry with backoff for up to ~5s
   total. If it still fails, return `503` (`code: "try_again"`), store nothing, and
   increment an aggregate transient-failure counter; log the failure without personal data
   (FR-014a, FR-012).
9. `200 OK` → `{ ok: true, redirectTo? , successMessage }`. Non-JS clients get a
   server-rendered success page showing `page.form.successMessage` + the unsubscribe link;
   on `503` they get a server-rendered "please try again shortly" page.

## Responses

| Status | Meaning |
|---|---|
| 200 | stored; body `{ ok: true, successMessage, unsubscribeUrl }` |
| 204 | honeypot tripped (treated as success by the client, nothing stored) |
| 403 | unknown/inactive host |
| 409 | page not published |
| 422 | validation / consent / timing failure — `{ ok:false, code, errors[] }` |
| 429 | rate limited — `Retry-After` header |
| 503 | content backend unreachable after ~5s of inline retries — `{ ok:false, code:"try_again" }`, nothing stored, aggregate transient-failure counter incremented |

## Invariants

- No `lead` row without a linked immutable `consent-record` (SC-003, SC-004).
- No personal field value written to logs at any level (FR-038).
- Endpoint never returns whether an email already exists (privacy) — duplicates are flagged
  server-side only.
