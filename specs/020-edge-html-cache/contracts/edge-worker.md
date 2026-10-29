# Contract: the edge Worker (`trefle-edge`)

What the Worker does with each request it receives. Research: R1, R2, R4–R7,
R10–R14. Routing (which requests reach it): R13.

## 1. Request classification

| Request | Handling |
|---|---|
| Method not GET/HEAD | **pass-through** |
| Header `RSC`, `Next-Router-State-Tree` or `Next-Router-Prefetch`, or query `_rsc` | **pass-through** |
| Path `/preview/*`, `/confirm`, `/confirmation`, `/unsubscribe`, `/form-retry` | **pass-through** |
| Anything else | **cached page** |

**Pass-through** = `fetch(request)` unchanged: no edge header, no cache
override, response returned as is. The origin behaves exactly as today
(nonce, token, A/B, `pingPageView`).

## 2. Cached page

1. `ctx.passThroughOnException()`.
2. Build the origin request: same host and path, **no query string**, method
   GET, header `X-Trefle-Edge: <EDGE_SECRET>`, visitor headers dropped except
   `Accept-Language` and `User-Agent` (cookies are **not** forwarded).
3. `fetch(originRequest, { cf: { cacheEverything: true, cacheTtlByStatus:
   { "200-299": 86400, "404": 86400, "500-599": 0 } } })`.
4. If the response has `X-Trefle-AB` → §3 (A/B), which yields the variant
   response to continue with.
5. Stream the body through the substitution (§4).
6. Answer with the origin status and headers, after:
   - replacing the nonce placeholder in `Content-Security-Policy`;
   - removing `X-Trefle-AB`, `x-middleware-rewrite`, every `x-nextjs-*`,
     `Content-Length`, `ETag`, `Last-Modified`;
   - setting `Cache-Control: private, no-store` and
     `x-trefle-edge-served: 1` (diagnostics; reveals nothing);
   - appending the A/B `Set-Cookie` when §3 created one.
7. In `ctx.waitUntil`: write the view data point (§5) once the stream has
   seen the page id.

HEAD: same as GET, body discarded.

## 3. A/B (marker present)

Marker: `X-Trefle-AB: <experimentKey>;<id>,<id>[,…];<domainId>` (parse with
`parseAbMarker` from `@trefle/shared`; an unparsable marker → serve the
control page id, the first in the list).

1. Cookie name: `tf-ab-` + experimentKey with every character outside
   `[a-zA-Z0-9_-]` replaced by `_` (same rule as `middleware.ts`).
2. Existing cookie value in the id list → use it, no new cookie.
3. Otherwise `assignVariant(<input>, experimentKey, ids)` with input = the 018
   visitor id when present, else `crypto.randomUUID()`; new cookie
   `Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure`.
4. Fetch `/ab-variant/<id>` exactly as §2 steps 2–3 (cached per variant).
5. New assignment + `EXPOSURES=on` + 018 identifier present + no objection
   cookie + user agent not a declared crawler → send one exposure message
   (data-model) in `ctx.waitUntil`.

## 4. Substitution

| Pattern | Replacement | Per response |
|---|---|---|
| `TFEDGENONCE000000000000000000000` | 32 lowercase hex chars from `crypto.getRandomValues(16 bytes)` | one value, every occurrence |
| `TFEDGEFT(\d+)X` | form token for page `$1`, `issuedAt` = request time, plus a random salt segment (R5 format, amended for SC-005) | one `issuedAt` and one salt, every occurrence |

- Streaming, UTF-8, carry-over of `maxPatternLength − 1` characters between
  chunks; no full buffering.
- Also extracts the first `<meta name="tf-page" content="(\d+)">` value for
  §5 (left in the output).
- A response with no placeholder is passed through unchanged (e.g. a 404 page
  without form still gets its nonce replaced; it always has one).

## 5. Counting

- Condition: status 200, page id extracted, response not a marker.
- `env.PAGE_VIEWS.writeDataPoint({ indexes: [pageId], blobs: [host],
  doubles: [1] })`.
- Never awaited before the response; failures ignored (FR-020).

## 6. Cron (every minute)

1. Query Analytics Engine SQL API (account token): page counts per closed
   minute for windows `[now − 10 min, now − 0 min)` minus the current minute,
   i.e. the 10 last closed minutes (minute-aligned),
   `SUM(_sample_interval)` per `index1` and minute.
2. One `POST {ORIGIN_INGEST_URL}/api/edge/views` per run with all windows
   ([edge-ingest.md](edge-ingest.md)); non-2xx → log, next run re-sends (the
   per-page ledger adds only differences).

## 7. Queue consumer (`trefle-exposures`)

Batch ≤ 100 messages, max wait 30 s → one `POST
{ORIGIN_INGEST_URL}/api/edge/exposures`. 2xx → `ack` all; otherwise `retry`
the batch (queue default retries, then dead-letter queue
`trefle-exposures-dlq`, logged).

## 8. Switches (Worker variables)

| Variable | Values | Effect |
|---|---|---|
| `MODE` | `on` (default) | as described above |
| | `passthrough` | every request is a pass-through (secondary kill switch, R15) |
| | `fail` | throws before responding — validation of the fallback only (quickstart V11) |
| `EXPOSURES` | `off` (default) / `on` | §3 step 5 |
| `ORIGIN_OVERRIDE` | unset (production) / `http://host:port` | local `wrangler dev` only: origin subrequests go to this address with the original `Host` header (e2e `edge` project); never set in `wrangler.jsonc` |

## 9. Invariants (tested)

- No visitor response contains a placeholder.
- Two responses for the same page never share a nonce or a form token.
- No visitor response carries `X-Trefle-AB`, `x-middleware-rewrite` or
  `x-nextjs-*`.
- The origin never receives `X-Trefle-Edge` with a visitor's cookies.
- A thrown exception before the response starts yields today's origin
  behaviour (pass-through).
