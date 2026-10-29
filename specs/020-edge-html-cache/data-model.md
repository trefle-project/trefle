# Data Model: Page HTML served from the edge cache

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Most of this feature's state lives at the edge (cache entries, analytics
points, queue messages). The database gains one hidden collection; one
existing write path changes.

## Database (PostgreSQL via Payload)

### `page-stats` (existing — write path changed)

| Field | Type | Notes |
|---|---|---|
| `page` | relationship → pages | unchanged |
| `date` | date (UTC midnight) | unchanged |
| `views` | number | now incremented by an atomic upsert (R8), by `n` per batch window |
| `submissions` | number | same atomic upsert (lead intake, unchanged caller) |

Unique `(page, date)` already exists (`page_date_idx`). No schema change.

**Rule**: `incrementPageStat(payload, pageId, field, by)` becomes a single
`INSERT … ON CONFLICT (page_id, date) DO UPDATE SET <field> = page_stats.<field>
+ EXCLUDED.<field>`; it never reads first.

### `edge-view-windows` (NEW, hidden collection)

Ledger of what each view window has already added to `page-stats`, so a
re-sent window adds only what is new (late-ingested views) and never counts
twice (R7).

| Field | Type | Rules |
|---|---|---|
| `windowStart` | date (UTC, minute precision) | required, **unique** |
| `applied` | JSON object | page id → views already applied for this window (integers ≥ 0) |
| `updatedAt` | date | Payload timestamp, last time the window changed counts |

- Access: no admin read/write (service endpoint only, `overrideAccess`).
- Lifecycle: inserted or updated in the same transaction as the window's
  upserts (row locked with `SELECT … FOR UPDATE` during the window);
  deleted by the nightly retention sweep after 30 days.
- Migration: create table + unique index (expand only); down path drops it.

### Exposures (018 — not created here)

The queue consumer (R11) posts batches to 018's intake. Shape expected by 020
(see [contracts/edge-ingest.md](contracts/edge-ingest.md)):
`visitorId`, `experimentKey`, `variantId`, `domainId`, `at`; idempotent on
`(visitorId, experimentKey)`.

## Edge state (Cloudflare)

### Cached page copy (zone cache)

| Attribute | Value |
|---|---|
| Key | host + path (query string removed by the Worker) |
| Body | page HTML with placeholders (R4) — or an empty A/B marker (R10) |
| Tags | `html`, `domain:<domainId>` |
| TTL | 24 h for 2xx and 404; 5xx never stored |
| Invalidation | purge by tag from `/api/revalidate` (R9) and `release.sh` |

**States**: absent → (first request: origin render) → cached → (purge or
TTL) → absent. A control path under test holds a **marker** instead of HTML;
the marker appears or disappears when its domain is purged on test start or
end.

### A/B marker (cached at the control path)

`X-Trefle-AB: <experimentKey>;<variantId>,<variantId>[,…];<domainId>`, status 200,
empty body. Order of variant ids = today's `RunningTest.variantIds` (control
first). Parsed by `@trefle/shared` (`parseAbMarker`).

### View data point (Analytics Engine dataset `trefle_page_views`)

| Column | Value |
|---|---|
| `index1` | page id (string) |
| `blob1` | host |
| `double1` | 1 |
| `timestamp` | set by the platform |

Aggregation: `SUM(_sample_interval)` per `index1` per closed minute.

### Exposure message (Queue `trefle-exposures`)

`{ visitorId: string, experimentKey: string, variantId: string, domainId:
string, at: ISO-8601 }` — only when `EXPOSURES=on` (018 active).

### Visitor cookies (unchanged names)

| Cookie | Set by | Rules |
|---|---|---|
| `tf-ab-<experimentKey>` | Worker (edge path) / middleware (legacy path) | variant id, 30 days, HttpOnly, SameSite=Lax, Path=/ — identical in both paths |
| 018 identifier, objection | 018 | read by the Worker; provisional names `tf-visitor`, `tf-measure-objection` reserved in `@trefle/shared` (`VISITOR_ID_COOKIE`, `MEASUREMENT_OBJECTION_COOKIE`) — 018 may rename them there |

## Configuration (new values)

| Name | Where | Purpose |
|---|---|---|
| `EDGE_SECRET` | VPS `infra/.env` (web) + Worker secret | edge mode switch (R3) and HMAC for `/api/edge/*` (R7, R11) |
| `FORM_TOKEN_SECRET` | existing on VPS; **also** a Worker secret | form token signing (R5) |
| `CLOUDFLARE_PURGE_TOKEN` | VPS `infra/.env` (web, release.sh) | zone Cache Purge only (R9) |
| `CLOUDFLARE_ZONE_ID` | VPS `infra/.env` (web) | purge API path |
| `CF_ANALYTICS_TOKEN`, `CF_ACCOUNT_ID` | Worker secrets | Analytics Engine SQL API for the cron (R7) |
| `ORIGIN_INGEST_URL` | Worker variable | base URL for `/api/edge/*` (a page host) |
| `EXPOSURES` | Worker variable | `off` until 018 ships |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKERS_TOKEN` | `infra/cloudflare/secret.env` (operator machine) | wrangler deploy, Worker routes, Queue (never on the VPS) |
