# Contract: Payload API surface used by `web` and by internal endpoints

`web` uses Payload's REST API over the Docker network with a **service API key**
(`Authorization: users API-Key <key>`). Base: `http://cms:3000/api`. GraphQL
(`/api/graphql`) is an allowed equivalent. `web` treats all of this as **read-only** except
the three service endpoints in §B.

## A. Read endpoints `web` depends on

### `GET /api/domains?where[hostname][equals]=<host>&where[isActive][equals]=true`
Returns the active domain for a host, or empty. `web` caches with tag `domain:<id>`.
Fields consumed: `id`, `hostname`, `isActive`, `branding`, `notFoundPagePath`.

### `GET /api/pages?where[domain][equals]=<domainId>&where[path][equals]=<path>&where[status][equals]=published&depth=1`
Returns the published page for `(domain, path)` or empty (`web` → `notFound()`).
Fields consumed: `id`, `title`, `seo`, `builder.html`, `builder.css`, `form` (full),
`domain` (id), `path`, `publishedAt`.
`web` never reads `builder.projectData`.

### `GET /api/pages/:id?depth=0&select=status`
Freshness check used by `lead-intake` before persisting (guards FR-014).

## B. Service write endpoints (custom Payload endpoints, service key only)

### `POST /api/lead-intake`
Body: `{ pageId, email, fieldValues, consent:true, consentContext:{ consentText, purposeText,
privacyNoticeUrl, privacyNoticeVersion, capturedAt, ip, userAgent }, metadata:{ pageUrl,
referrer, utm } }`.
Effect (single transaction): create `leads` + `consent-records` (linked), set `isDuplicate`
(`email`+`page` already present and not erased), `page-stats.submissions += 1` for today.
Rejects if page not `published`, if `consent !== true`, or if a required form field is
missing. Returns `{ leadId, unsubscribeUrl, successMessage }`.

### `POST /api/consent-withdraw`
Body: `{ leadId }`. Sets `lead.consentStatus='withdrawn'`, `consent-records.withdrawnAt` if
unset. Idempotent. Returns `{ ok:true }`.

### `POST /api/page-view`
Body: `{ pageId }`. `page-stats.views += 1` for today. Fire-and-forget; failures are
swallowed by `web`. Not called on ISR cache hits.

## C. Admin-only operations (used inside the Payload admin, not by `web`)

| Operation | Surface | Spec |
|---|---|---|
| Create member + role | `users` create (admin) → set-password email | FR-034a, US5-1 |
| Change/remove member | `users` update/delete (admin), last-admin guard | US5-2/4/5 |
| Edit workspace settings / retention | `settings` global (admin) | US4, FR-030 |
| Author / publish / unpublish page | `pages` CRUD (admin, editor) + publish hook | US1 |
| Register / assign domains | `domains` CRUD (admin), assign on `pages` (editor) | FR-006a |
| Browse / filter leads | `pages`→`leads` list with `where` on page, date, `consentStatus`, `erasedAt=null` | FR-021/022 |
| Export leads | `GET /api/leads-export?...&consentedOnly=` → streamed CSV; writes `activity-log` (admin or editor) | FR-023/024, SC-008 |
| DSR access/portability | `POST /api/dsr-export` `{ email }` → JSON of all leads + consent records; writes `activity-log` (admin or editor) | FR-025, FR-034b |
| DSR erasure | `POST /api/dsr-erase` `{ email, requestId }` (**Administrator only**) → erase-in-place everywhere, complete the request | FR-026/027, FR-034a |
| DSR rectification | normal `leads` field edit **by an Administrator** (consent record untouched) | FR-028, FR-034a |

## D. Access matrix (Payload access functions)

| Collection | anonymous | `service` | `editor` | `admin` |
|---|---|---|---|---|
| `pages` (published) | – | read | read/write | read/write |
| `pages` (draft) | – | – | read/write | read/write |
| `domains` | – | read | read + assign | full |
| `leads` | – | create via intake only | read, export | + update (rectify), delete |
| `consent-records` | – | create/withdraw only; personal fields nulled on lead erasure/retention | read | read |
| `data-subject-requests` | – | – | create / read / progress | + execute erasure |
| `page-stats` | – | increment only | read | read |
| `activity-log` | – | append | read (page-scoped) | read (all) |
| `users` | – | read self | read self | full (last-admin guard) |
| `settings` | – | read | read | write |

## E. Failure expectations

- `cms` unavailable → `web` serves the last good ISR render; `lead-intake` retries inline for
  ~5s, then returns `503` (`code: "try_again"`) and stores nothing, incrementing an aggregate
  transient-failure counter (FR-014a).
- Any 5xx from Payload is logged without request bodies (FR-038).
