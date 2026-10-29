# Research: Page HTML served from the edge cache

**Feature**: [spec.md](spec.md) | **Date**: 2026-10-11 | **Prior study**: `docs/cdn-cache-exploration.fr.md` §11

Each entry: Decision / Rationale / Alternatives considered. Facts about
Cloudflare were checked against its documentation on 2026-10-11 (sources at
the end).

## R1 — A Worker personalises every response; the zone cache stores the HTML

**Decision**: one Cloudflare Worker (`trefle-edge`) runs on every page
request. It fetches the page from the origin **through the zone cache** with a
`fetch()` subrequest, then replaces the per-visit placeholders in the body and
headers before answering.

**Rationale**: the cached HTML must be identical for everyone while each
response needs its own CSP nonce and form token (FR-005–FR-007), so code must
run on cache hits. The zone cache, reached through a subrequest, keys on host
and path (two client domains never mix, FR-002), honours Cache Rules, is
purgeable by `Cache-Tag` on the Free plan, and benefits from Smart Tiered
Cache.

**Alternatives considered**:
- *Workers Caching* (the Worker's own cache): on a hit the Worker does not
  run (no nonce, no token), its key ignores the host, and zone purges do not
  reach it. Rejected.
- *Cache API* (`caches.default`): one data centre only, not tiered, no tag
  purge across the network. Rejected.
- *"Cache Everything" rule without a Worker*: breaks the CSP, the form, A/B and
  counting. Rejected in the study.
- *CSP by hashes instead of a nonce*: App Router inline scripts differ per
  page, `'strict-dynamic'` disables `'self'` so Next's chunks would need SRI
  hash matching (uneven browser support), and admin custom code (014) would
  need hashing at publish. Rejected: fragile and weaker than today.

## R2 — Cache settings of the origin subrequest

**Decision**: the Worker calls `fetch(originRequest, { cf: { cacheEverything:
true, cacheTtlByStatus: { "200-299": 86400, "404": 86400, "500-599": 0 } } })`.
The origin URL is the visitor's URL **without its query string**. Responses to
visitors carry `Cache-Control: private, no-store` (FR-008).

**Rationale**: `cf` overrides on `fetch()` take precedence over Cache Rules
and origin headers, so the origin keeps Next's own `Cache-Control` untouched.
24 h is the FR-013 ceiling; every change purges by tag (R9), so the TTL is
only a safety net. "Not found" answers are cached for as long as pages: they
carry the domain tag and are purged with it (spec edge case). 5xx are never
stored. Pages never read their query string (`[[...slug]]` and
`ab-variant/[pageId]` don't), and UTM values reach the lead through the
`Referer` of the form post, so dropping it from the cache key loses nothing.

**Origin down (FR-004)**: copies stay valid 24 h and are only dropped by a
purge, so while the origin is unreachable every page already cached keeps
being served (`HIT`); only a page never cached or just purged gets an error,
as today. Cloudflare's serving of expired copies on origin errors is not
relied on. Checked by quickstart V11 step 4.

**Very large pages**: Free-plan cacheable size (512 MB) is far above any
page; the spec's edge case needs no mechanism.

**Alternatives considered**: origin-driven caching (`Cloudflare-CDN-Cache-
Control` from middleware) — middleware does not know the final status, so a
500 would be cached; kept as a fallback only. Short TTL without purge —
contradicts the 30 s freshness goal or hurts the hit rate.

**To verify (quickstart V2)**: a response with `Set-Cookie` is never stored
(the edge mode emits none, R3), and the zone's existing "Pages: never cache
HTML" Cache Rule does not override the subrequest's `cf` settings; if it
does, the rule gains `and not http.request.headers["x-trefle-edge"]` (R13).

## R3 — "Edge" rendering mode at the origin

**Decision**: the Worker adds `X-Trefle-Edge: <EDGE_SECRET>` to its origin
subrequests. `middleware.ts` compares it in constant time with the
`EDGE_SECRET` env var; on a match it:

1. uses the fixed nonce placeholder (R4) instead of a random nonce, in the
   request CSP header (Next nonces its scripts from it), `x-nonce`, and the
   response CSP header;
2. skips A/B bucketing and never sets a cookie; on a path under test it
   answers the A/B marker instead of rendering (R10);
3. sets `Cache-Tag: html,domain:<id>` on the response (R9) — middleware
   already resolves the host to a domain;
4. passes `x-trefle-edge-render: 1` to the page, which then renders the form
   token placeholder instead of signing a token, and skips `pingPageView`
   (the Worker counts, R7).

The incoming secret header is removed before the request reaches the page.
Without the header (or with a wrong value) **nothing changes**: local dev,
the e2e stack, the Worker's pass-through and fallback paths all get today's
behaviour (FR-021, FR-022).

**Rationale**: one switch at the origin keeps today's code path intact and
testable, makes rollback a routing change (R15), and keeps the CSP policy
defined in one place (middleware) — the Worker only swaps the nonce.

**Alternatives considered**: a separate renderer build or route tree for the
edge — doubles the rendering code. A non-secret flag — anyone could fetch
placeholder pages (static nonce) through an excluded path; the secret makes
placeholder HTML reachable only by the Worker.

## R4 — Placeholder substitution in the Worker

**Decision**: placeholders are plain ASCII tokens that survive every escaping
layer they pass through (HTML attributes, JSON inside the RSC payload's
`self.__next_f.push` strings):

| Placeholder | Replaced by | Where it appears |
|---|---|---|
| `TFEDGENONCE000000000000000000000` (32 chars) | 32 hex chars from 16 random bytes | CSP header, every `nonce="…"`, the RSC payload (`ConsentCodeRunner`'s `nonce` prop), custom code via `withNonce` |
| `TFEDGEFT<pageId>X` | `signFormToken(pageId, now)` (R5) | the form's hidden `formToken` input and its RSC copy |

The Worker streams the body through a `TransformStream` that decodes UTF-8,
replaces both patterns, and carries the last (longest-pattern − 1) characters
over chunk boundaries. Same nonce and same `issuedAt` for every occurrence in
one response. `Content-Length`, `ETag` and `Last-Modified` are dropped; the
edge re-compresses.

**Rationale**: a text-level replace is the only way to reach the copies in
the RSC payload — rewriting attributes alone (HTMLRewriter) would leave the
placeholder in the hydration data, and React would restore it on the client
(the form token input and the consent runner's nonce would break). A hex
nonce of the same length as the placeholder keeps the replacement trivial and
is valid CSP base64-value syntax.

**Alternatives considered**: HTMLRewriter attribute handlers (misses the RSC
payload); buffering the whole body (adds latency and memory for no gain).

Placeholders typed by an editor into page text would be replaced with that
response's nonce: harmless (the nonce of a response is already in its own
RSC payload) and markup still goes through the sanitiser, so it cannot carry a
script. No extra filtering.

## R5 — Form token signed at the edge

**Decision**: the Worker signs `base64url("<pageId>.<issuedAt>") + "." +
base64url(HMAC-SHA256(FORM_TOKEN_SECRET, "<pageId>.<issuedAt>"))` with
WebCrypto — byte-for-byte the format of `apps/web/src/lib/tokens.ts`.
`verifyFormToken` is unchanged (2 s – 2 h). `FORM_TOKEN_SECRET` becomes a
Worker secret as well as a VPS variable; a shared test vector (fixed secret,
page id, time → expected token) runs in both the web and edge test suites.

**Amended 2026-10-12 (implementation, SC-005)**: the Worker adds a third,
random segment to the body — `<pageId>.<issuedAt>.<salt>`, salt = 8 random
bytes base64url, one per response — because two responses issued in the same
millisecond would otherwise carry the same token, against SC-005 under load.
`verifyFormToken` is still unchanged: it reads the first two segments and
checks the signature over the whole body (tested in `apps/web/tests/tokens.test.ts`).
The renderer's own tokens (legacy mode) keep two segments; the shared vector
is for the two-segment body.

**Rationale**: keeps the no-JS form (constitution V) and the anti-bot timing
exactly as today, with no new endpoint.

**Alternatives considered**: a token fetched by the browser (the former
"lot 2" plan) — loses the no-JS form and adds an origin request per view.

**Rotation**: change the secret on the Worker and the VPS together; tokens in
pages open during the switch fail once with the existing "page expired"
message (same as today's rotation).

## R6 — Page identity for counting

**Decision**: `PageShell` emits `<meta name="tf-page" content="<pageId>">`
(React 19 hoists it into `<head>`). The Worker reads the first occurrence while
streaming (same pass as R4) and leaves it in place.

**Rationale**: response headers cannot be set from an App Router page, and
the page id is already public (hidden `pageId` field). The meta also carries
the variant's own id on `/ab-variant/<id>`, matching today's per-variant
counting.

## R7 — View counting: Analytics Engine + per-minute aggregation

**Decision**:
- Per served page view (status 200, page id known, not a declared crawler —
  same rule as today: crawlers are counted today; **kept counted** for parity,
  see note), the Worker writes one Analytics Engine data point:
  `index1 = pageId`, `double1 = 1`, `blob1 = host`.
- A **Cron Trigger on the same Worker** runs every minute. It queries the
  Analytics Engine SQL API for the closed minute windows of the last 10
  minutes (`SUM(_sample_interval) GROUP BY index1, minute`), skipping only
  the current minute, and posts them to the
  renderer's `POST /api/edge/views` (HMAC with `EDGE_SECRET`), which forwards
  to the CMS `POST /api/page-views/batch` (service auth, like
  `pingPageView`).
- The CMS keeps, per window, the count already applied for each page (ledger,
  R8) and adds only the **difference** to `page-stats` for the window's UTC
  day. A window first sent before Analytics Engine had ingested its last
  seconds is completed by the next runs (each window is re-sent for 10
  minutes), and a re-sent window adds nothing.

Counts appear 1–2 minutes after the view, within the 3 minutes of FR-018 and
SC-007.

**Rationale**: no server write per view, nothing on the VPS beyond one small
request per minute; re-sending the last 10 windows makes a failed cron run or
a failed post self-healing; the per-page ledger makes retries idempotent and
late-ingested points still counted.
Sampling only happens at very high volume and `_sample_interval` keeps totals
right (accepted for counters in the study).

**Note on crawlers**: today `pingPageView` counts every render, crawlers
included; keeping that avoids a silent change of the numbers the operator
knows. Excluding crawlers from visit counts is a separate decision.

**Alternatives considered**: per-view ping to the origin (rejected by the
user: VPS work per view); client beacon / GTM (rejected: ad blockers, JS,
third party); Durable Object counters (more code, a second stateful system);
CMS job pulling from Analytics Engine (puts an account API token on the VPS).

**Pass-through and fallback requests** (R12, R14) are rendered by the origin
without the edge header, so `pingPageView` still counts them; a request is
therefore counted exactly once whichever path serves it.

## R8 — Atomic, idempotent counter updates

**Decision**: replace `incrementPageStat`'s find-then-update with one SQL
upsert — `INSERT … ON CONFLICT (page_id, date) DO UPDATE SET views =
page_stats.views + EXCLUDED.views` (same for `submissions`) — through
Payload's Drizzle handle. The unique index it needs already exists
(`page_date_idx`, 001 migration). The ledger for R7 is a hidden Payload
collection `edge-view-windows` (`windowStart` unique, `applied`, `updatedAt`), created by
a Payload migration (expand only), holding per window the counts already
applied per page (`applied`: page id → count); rows older than 30 days are
deleted by the existing nightly retention sweep.

**Rationale**: fixes the existing lost-update bug (two simultaneous views read
the same value and one increment is lost; two first views of the day race on
the create and the loser hits the unique index and is swallowed), and makes
batch application safe to retry. A Payload collection keeps the ledger in the
stack's own primitives (constitution II).

**Alternatives considered**: row locking (`SELECT … FOR UPDATE`) — slower and
still racy on the first create; Payload `update` with `views + n` — the local
API has no atomic increment; a raw table outside Payload — works, but a
hidden collection costs nothing more and keeps migrations uniform.

## R9 — Cache tags and purge

**Decision**:
- Tags on every cached page response (set by middleware in edge mode):
  `html`, `domain:<domainId>`.
- The renderer's existing `POST /api/revalidate` (called by every CMS change
  hook) maps the received tags and purges Cloudflare **after** its
  `revalidateTag` calls:
  - `domain:<id>` → purge `domain:<id>`;
  - `page:<id>`, `page-list` → nothing more (page hooks always send the
    page's `domain:<id>` too);
  - `ab-tests`, `ab-test:*` → nothing more: the experiments hook
    additionally sends `domain:<controlPageDomain>`, so a test start/stop
    purges only that domain;
  - anything else (`settings`, `media-aliases`, `domain:host:*`, any future
    tag) → purge `html` (everything) — an unknown tag can only over-purge.
- Purge calls use a new **purge-only token** `CLOUDFLARE_PURGE_TOKEN` (zone:
  Cache Purge — nothing else) in the VPS `infra/.env`. The renderer coalesces
  tags for 1 s, sends one request (≤ 100 tags), retries 429/5xx with backoff
  up to 60 s, and logs at `error` on final failure (FR-013).
- `infra/deploy/release.sh` purges `html` as its last step after the new
  containers are healthy (FR-012).
- Media file replacement already sends `media-aliases` (017); it now purges
  `html` in the same webhook, synchronously ordered after the alias map
  revalidation (FR-010).

**Rationale**: domain-level precision is enough (sites have few pages; a
purge costs one render per page per upper tier), and it needs no page-to-tag
bookkeeping. Free-plan purge limits are 5 requests/minute with a bucket of
25 and 100 tags per request (account-wide): coalescing absorbs bursts such as
a site import publishing many pages.

**Alternatives considered**:
- Purge from the Worker (token as a Worker secret, VPS calls a signed Worker
  endpoint) — same exposure (whoever holds the VPS secret can trigger purges),
  one more hop. Rejected for simplicity.
- Keeping the broad zone token off the VPS remains true: the purge token can
  only purge.
- Per-page tags (`page:<id>`): middleware does not know the page id; would
  need render-time bookkeeping. Not worth it.

**Pro trigger** (017): repeated purge 429s in the logs become a documented
reason to move the zone to Pro (5 purges/second).

## R10 — A/B assignment at the edge via a cached marker

**Decision**: in edge mode, when middleware finds a running test for the path
(existing `getRunningTestFor`), it answers **200 with an empty body** and
`X-Trefle-AB: <experimentKey>;<variantId>,<variantId>,…;<domainId>` plus the usual
`Cache-Tag`. That marker is cached at the control path like a page. The
Worker, on reading a marker:

1. reads `tf-ab-<key>` (same name rule as today); keeps a valid value;
2. otherwise draws with `assignVariant(crypto.randomUUID(), key, ids)` from
   `@trefle/shared` (FR-016) — or, once 018 ships, with the 018 visitor id as
   input so a returning visitor whose 30-day cookie expired lands on the same
   variant;
3. fetches `/ab-variant/<id>` through the cache (one entry per variant), with
   the same placeholder substitution;
4. sets the cookie (30 days, `HttpOnly`, `SameSite=Lax`, `Path=/`) when new,
   and records the first exposure when 018 is active (R11).

Marker and internal headers (`X-Trefle-AB`, `x-middleware-rewrite`,
`x-nextjs-*`) never reach visitors (FR-017). A start, stop or promotion
already revalidates `ab-tests`; with R9 it also purges the control page's
domain, so the marker appears or disappears within seconds (FR-015).

**Rationale**: the running-test list stays where it is (Payload, with its
existing cache tags), the edge learns about a test through the same cache and
purge path as pages — no separate endpoint, no KV, no polling, and the list
of tests is never exposed publicly.

**Alternatives considered**: a running-tests JSON endpoint polled by the
Worker (extra endpoint and freshness logic, exposure of experiment keys);
Workers KV pushed by the CMS (account token on the VPS, up to 60 s
propagation).

## R11 — A/B exposures (018) through a Queue

**Decision**: when 018 is active (Worker variable `EXPOSURES=on`), on a
**new** assignment for a visitor that has a 018 identifier and no objection
cookie, and whose user agent is not a declared crawler, the Worker sends
`{ visitorId, experimentKey, variantId, domainId, at }` to the Cloudflare
Queue `trefle-exposures`. The same Worker consumes it (batches of up to 100,
max wait 30 s) and posts each batch to the renderer's `POST
/api/edge/exposures` (HMAC), which forwards to 018's CMS intake (one insert
per batch, idempotent on `(visitorId, experimentKey)`). Failed batches are
retried by the queue (at-least-once delivery, idempotent intake).

**Rationale**: lossless and unsampled (018 FR-002), one server write per
batch, first exposure only (018 clarification 2026-10-11).

**Alternatives considered**: Analytics Engine (sampled — rejected for
exposures); direct origin call per exposure (one write per first visit —
acceptable volume but avoidable); GrowthBook's MongoDB and GTM (rejected in
the study).

Until 018 ships, nothing is sent; 018's own server-side path (batches of
one) is not part of this feature.

## R12 — What the Worker never caches (pass-through)

**Decision**: the Worker forwards the request **untouched** (no edge header,
no cache) for: methods other than GET/HEAD; requests with an `RSC`,
`Next-Router-State-Tree` or `Next-Router-Prefetch` header or an `_rsc` query
parameter; paths `/preview/*`, `/confirm`, `/confirmation`, `/unsubscribe`,
`/form-retry`. HEAD is served from the GET cache entry without a body.

**Rationale**: covers FR-003 and the RSC trap from the study (same URL,
different content, `Vary` ignored by Cloudflare). Pass-through requests get
today's behaviour, including counting by the origin.

## R13 — Routing: `*/*` with exclusions, as code

**Decision**: Worker route `*/*` on the zone (required for Cloudflare for
SaaS custom hostnames) and **no-Worker routes** for:
`<CMS_HOSTNAME>/*`, `<IMG_HOSTNAME>/*`, `<ASSET_HOSTNAME>/*`,
`<GROWTHBOOK_HOSTNAME>/*`, `<GROWTHBOOK_API_HOSTNAME>/*`, `*/_next/*`,
`*/api/*`, `*/favicon.ico`, `*/robots.txt`, `*/sitemap.xml`. Routes are kept
in `infra/cloudflare/worker-routes.json` and applied by `apply.sh` through the
API (wrangler deploys the script only).

The "Pages: never cache HTML" Cache Rule stays for everything that is not a
Worker subrequest (pass-through paths), adjusted per R2's verification.

**Rationale**: excluded hosts and static files never pay for a Worker
invocation — without `*/_next/*` the Worker would run for every script chunk
and multiply the cost; `/api/*` keeps the lead form's real IP and rate limit
exactly as today (FR-025). More specific routes win over `*/*` (Cloudflare
docs).

**To verify (quickstart V1)**: the API accepts the path-only patterns
(`*/_next/*`, `*/api/*`); if not, the Worker returns `fetch(request)` for
those paths as a stop-gap and the cost estimate is revisited.

## R14 — Failure behaviour

**Decision**: `ctx.passThroughOnException()` first thing in the handler: any
exception before the response starts sends the original request to the
origin without the edge header (today's behaviour). Analytics Engine and
Queue writes run in `ctx.waitUntil` and never throw into the response
(FR-020). An error after streaming started is logged (Workers Logs); the
visitor may get a truncated page — accepted as rare.

## R15 — Switching off and rolling back

**Decision**: `infra/cloudflare/edge-off.sh` deletes the `*/*` route (the
exclusion routes become harmless): every request goes to the origin without
the edge header, i.e. today's behaviour, instantly and without a server
deploy (FR-023). `edge-on.sh` (or `apply.sh`) restores it. The origin edge
mode is inert without the Worker.

**Alternatives considered**: a Worker variable `MODE=passthrough` — needs a
Worker deploy and still bills every request. Kept as a secondary switch.

## R16 — Code layout

**Decision**:
- New workspace `apps/edge` (TypeScript Worker, `wrangler` as dev
  dependency, `wrangler.jsonc` with Analytics Engine, Queue and cron
  bindings).
- `packages/shared` gains Worker-safe modules (no Node APIs): `ab-bucket.ts`
  (moved from `apps/web/src/lib/ab-testing/bucket.ts`), `edge.ts`
  (placeholder constants, header names, `formTokenBody`, crawler regex,
  A/B marker encode/parse, tag mapping).
- The renderer keeps signing with `node:crypto` (`tokens.ts`); the Worker
  signs with WebCrypto; a shared test vector proves both agree.

**Rationale**: one code path for bucketing and markers (FR-016), the Worker
is a separate deployable with its own tests, and nothing in `apps/web` has to
run in two runtimes.

## R17 — Tests

**Decision**:
- `apps/edge`: Vitest with the Workers pool (Miniflare): substitution across
  chunk boundaries, nonce/token uniqueness, bypass rules, marker → variant
  flow with sticky cookie, crawler and objection handling, cron
  aggregation → batch payload, queue consumer batching, failure
  pass-through.
- `packages/shared`: bucketing (moved tests), form-token vector, marker
  round-trip, tag mapping.
- `apps/web`: middleware edge mode (secret match/mismatch, placeholder nonce,
  no cookie, marker on tested path, `Cache-Tag`), page placeholder token and
  no `pingPageView`, `/api/revalidate` purge mapping and coalescing (mocked
  Cloudflare API), `/api/edge/views` and `/api/edge/exposures` signature
  checks.
- `apps/cms`: atomic upsert under concurrency (incl. two first views of a day),
  batch intake idempotency (window ledger), retention of the ledger.
- Playwright: the existing suite unchanged (legacy mode, FR-022) plus an
  `edge` project running key flows (no-JS lead, consent code, GTM events,
  A/B stickiness, preview bypass) through `wrangler dev` in front of the local
  stack.
- k6: SC-001 from the existing scenarios; SC-002 (10,000/s) from a
  distributed generator (k6 Cloud or several hosts).

## R18 — Cost and limits

**Decision**: Workers Paid ($5/month). Per million page views beyond the
included 10 M requests: ~$0.30 requests + ~2 ms CPU (~$0.04) + Analytics
Engine writes (10 M data points/month included, then ~$0.25 per million — to
confirm on the first invoice). Queue: 1 M operations/month included, ~$1.20
per million exposures beyond. Cron: 1 request/minute (~43,000/month). Two
origin subrequests at most per view (marker + variant), well under limits.

## R19 — Constitution

**Decision**: amend to **2.2.0** (MINOR) before the Worker first caches page
HTML (start of US1, on the test host only; real hosts at go-live — the Sync
Impact Report states this context):
- Architecture "Edge": page HTML **is** cached at the edge, personalised per
  request by the edge Worker (nonce, form token, A/B), purged by tag on
  change and on deploy; the origin keeps a request-time rendering path for
  everything the Worker does not handle.
- Architecture "Rendering & caching": add that the edge cache sits in front of
  SSR/ISR and is invalidated by the same change hooks.
- Principle II justified additions: Cloudflare Workers (Paid), Analytics
  Engine, Queues; `wrangler` as a dev tool.

## R20 — Out of scope, noted

- Next.js 16 renames `middleware.ts` to `proxy.ts`; the existing file keeps
  working and the rename is not part of this feature.
- Block-level A/B tests: the Worker's marker format and substitution pass are
  written so fragment selection can be added later (008 exploration §8.3), but
  no fragment logic ships here.

## Sources

- Workers routes, `*/*` for SaaS, no-Worker routes, specificity: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
- Workers Caching keys (host not included) and scope: https://developers.cloudflare.com/workers/cache/cache-keys/ , https://developers.cloudflare.com/workers/cache/limitations/
- `fetch()` `cf` overrides of Cache Rules: https://developers.cloudflare.com/changelog/post/2025-04-04-workers-fetch-api-override-cache-rules/ , https://developers.cloudflare.com/workers/examples/cache-using-fetch/
- Purge limits (Free: 5/min, bucket 25, 100 per request): https://developers.cloudflare.com/cache/how-to/purge-cache/
- Cache-Tag rules (stripped from responses, printable ASCII): https://developers.cloudflare.com/workers/cache/purge/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Analytics Engine sampling: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
- Next.js CSP and nonces: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
