# Contract: edge → origin ingest (views, exposures)

Batches sent by the Worker's cron and queue consumer. Research: R7, R8, R11.

## Authentication

Both renderer routes require `X-Trefle-Signature: hex(HMAC-SHA256(EDGE_SECRET,
rawBody))` and a body `at` within 5 minutes of the server clock (same scheme
as `/api/revalidate`). Bad signature → 401; stale → 400. The renderer then
calls the CMS over the internal network with the service account
(`authHeader()`), as `pingPageView` and lead intake do today.

## `POST /api/edge/views` (renderer) → `POST /api/page-views/batch` (CMS)

Request:

```json
{
  "at": "2026-10-20T10:15:03Z",
  "windows": [
    { "start": "2026-10-20T10:12:00Z", "counts": { "12": 340, "57": 12 } },
    { "start": "2026-10-20T10:13:00Z", "counts": { "12": 298 } }
  ]
}
```

- `start`: minute-aligned UTC; `counts`: page id → views (integer ≥ 1;
  sampled totals are rounded).
- CMS, per window, in one transaction: lock or create the
  `edge-view-windows` row for `start`; for each page, `delta = n −
  applied[page]`; if `delta > 0`, upsert `(page, UTC day of start)` with
  `views += delta` (R8) and set `applied[page] = n`. A lower `n` than already
  applied (sampling rounding) changes nothing. Unknown page ids are ignored.
- Response `200 { "added": <total views added>, "windows": <count> }`.
- Payload ≤ 10 windows × pages with views; well under body limits.

## `POST /api/edge/exposures` (renderer) → 018 intake (CMS)

Request:

```json
{
  "at": "2026-10-20T10:15:03Z",
  "exposures": [
    { "visitorId": "…", "experimentKey": "page-12-1760…", "variantId": "57", "domainId": "3", "at": "2026-10-20T10:14:41Z" }
  ]
}
```

- ≤ 100 exposures per request, forwarded to the CMS intake
  `POST /api/ab-exposure-batch` (018, `specs/018-ab-significance/contracts/exposure-intake.md`),
  idempotent on `(visitorId, experimentKey)` (first exposure wins).
- Response `200 { "accepted": n, "ignored": m }`; any non-2xx makes the queue
  retry the whole batch.
- Nothing is sent while the Worker has `EXPOSURES=off`.

## Tests

Renderer: signature/staleness checks, forwarding. CMS: a window posted twice
adds nothing the second time, a window re-posted with a higher count adds only
the difference, concurrent batches on the same page/day, unknown page
ignored, day boundary (window at 23:59 UTC).
