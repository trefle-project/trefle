---

description: "Task list for 020 — Page HTML served from the edge cache"
---

# Tasks: Page HTML served from the edge cache

**Input**: Design documents from `/specs/020-edge-html-cache/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the constitution (Principle IV) requires them:
data transformations (substitution, marker, tag mapping), cache-invalidation
logic (purge), custom Payload endpoints and hooks (batch intake, atomic
counter), and every security-relevant switch (edge mode, signatures). Edge
behaviour in production is validated by quickstart V1–V12.

**Organization**: Tasks are grouped by user story (US1–US6 from spec.md).
Setup and Foundational hold what every story needs: the shared code, the
origin's edge mode (inert without the Worker) and the Worker skeleton with the
per-visit substitution — no page can be cached safely without them.

**Go-live rule**: until US2, US3, US4 and US6 are done, the Worker runs only
on the test host (`EDGE_TEST_HOSTNAME`, T025); the `*/*` route for real
traffic is applied in T060.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files). On a test task, [P] means parallel with other work **once the code it tests exists** (named in the task or the task just above)
- **[Story]**: US1–US6 from spec.md
- Paths are relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Worker workspace, configuration keys, test host

- [X] T001 Create the workspace `apps/edge` (`@trefle/edge`): `package.json` (scripts `dev:edge` — deliberately not `dev`, so the root `npm run dev` does not start wrangler — `deploy`, `typecheck`, `lint`, `test`; dev deps `wrangler`, `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`, `typescript`, `vitest`; dep `@trefle/shared`), `tsconfig.json` (strict), `vitest.config.ts` (Workers pool), `eslint.config.mjs` matching the repo's rules; root `npm install` updates the lockfile — *deviation: `@cloudflare/vitest-pool-workers` is deprecated upstream, renamed `@cloudflare/vitest-plugin` (same API, `cloudflareTest()` Vite plugin); it needs Vitest 4, pinned with `@vitest/mocker` 4 in `apps/edge` only (the other workspaces stay on Vitest 2.1)*
- [X] T002 Create `apps/edge/wrangler.jsonc`: name `trefle-edge`, `compatibility_date` pinned, `analytics_engine_datasets` binding `PAGE_VIEWS` → dataset `trefle_page_views`, queue producer `EXPOSURES_QUEUE` and consumer for `trefle-exposures` (`max_batch_size: 100`, `max_batch_timeout: 30`, `dead_letter_queue: "trefle-exposures-dlq"`), `triggers.crons: ["* * * * *"]`, vars `MODE="on"`, `EXPOSURES="off"`, `ORIGIN_INGEST_URL`; **no** `routes` (applied by `infra/cloudflare`, research R13); `observability.enabled: true`
- [X] T003 [P] Create `apps/edge/src/index.ts` with empty `fetch`, `scheduled` and `queue` handlers typed with an `Env` interface (`PAGE_VIEWS`, `EXPOSURES_QUEUE`, `EDGE_SECRET`, `FORM_TOKEN_SECRET`, `CF_ANALYTICS_TOKEN`, `CF_ACCOUNT_ID`, `ORIGIN_INGEST_URL`, `MODE`, `EXPOSURES`), `fetch` returning `fetch(request)` (pure pass-through)
- [X] T004 [P] Document `EDGE_SECRET`, `CLOUDFLARE_PURGE_TOKEN` (zone → Cache Purge only) and `CLOUDFLARE_ZONE_ID` in `infra/.env.example`; pass them to the `web` service in `infra/docker-compose.prod.yml`; add real values to `infra/.env` (git-crypt) — `EDGE_SECRET` = 32 random bytes hex — *`infra/.env` in the repo holds local dev values: the three keys are optional (blank = legacy mode, purge skipped) and the real values go into the VPS `infra/.env` at the first edge deploy*
- [X] T005 [P] Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_TOKEN` (Account → Workers Scripts Edit, Queues Edit, Account Analytics Read; Zone → Workers Routes Edit) to `infra/cloudflare/secret.env.example` and `secret.env`; document both, plus the Worker secrets (`EDGE_SECRET`, `FORM_TOKEN_SECRET`, `CF_ANALYTICS_TOKEN`, `CF_ACCOUNT_ID`) and how to set them with `wrangler secret put`, in `infra/cloudflare/README.md`
- [X] T006 Enable Workers Paid on the account, create queues `trefle-exposures` and `trefle-exposures-dlq` (`npx wrangler queues create …` from `apps/edge`), set the four Worker secrets; record the steps in `infra/cloudflare/README.md` (operator task: account-level Cloudflare changes are run by the project owner) — *2026-10-12, by the user: Workers Paid, both queues, the four Worker secrets, tokens `trefle-workers`, `trefle-purge`, `trefle-analytics`*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared code, origin edge mode, Worker substitution. Deployable
to production with no visible change (no route sends traffic to the Worker).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Shared code (`packages/shared`)

- [X] T007 [P] Move `apps/web/src/lib/ab-testing/bucket.ts` to `packages/shared/src/ab-bucket.ts` and `apps/web/tests/ab-testing-bucket.test.ts` to `packages/shared/tests/ab-bucket.test.ts`; export `assignVariant` from `packages/shared/src/index.ts`; update the import in `apps/web/src/middleware.ts`; delete the old files
- [X] T008 [P] Create `packages/shared/src/edge.ts` (no Node APIs): `EDGE_HEADER = "x-trefle-edge"`, `EDGE_RENDER_HEADER = "x-trefle-edge-render"`, `AB_MARKER_HEADER = "x-trefle-ab"`, `NONCE_PLACEHOLDER = "TFEDGENONCE000000000000000000000"` (exactly 32 chars), `formTokenPlaceholder(pageId)` → `TFEDGEFT<pageId>X` and `FORM_TOKEN_PLACEHOLDER_RE = /TFEDGEFT(\d+)X/g`, `formTokenBody(pageId, issuedAt)` → `"<pageId>.<issuedAt>"`, `b64url(bytes)`, `abCookieName(experimentKey)` (same rule as middleware: `tf-ab-` + key with `[^a-zA-Z0-9_-]` → `_`), `encodeAbMarker({experimentKey, variantIds, domainId})` / `parseAbMarker(value)` (`<key>;<id>,<id>…;<domainId>`, null on malformed), `edgeTagsFor(tags)` per contracts/purge.md, `CRAWLER_UA_RE`; export from `index.ts`
- [X] T009 [P] Tests in `packages/shared/tests/edge.test.ts`: marker round-trip and malformed inputs, `edgeTagsFor` table (`domain:3`→`domain:3`; `page:5`,`page-list`,`ab-tests`,`ab-test:5`→none; `settings`,`media-aliases`,`domain:host:x`, unknown→`html`; `html` collapses the list), cookie-name rule, placeholder length 32, **form-token vector**: secret `"test-secret"`, page `"12"`, issuedAt `1760000000000` → the token produced by `apps/web/src/lib/tokens.ts` `signFormToken` (computed once and pasted as the expected constant)

### Origin edge mode (`apps/web`) — contracts/origin-edge-mode.md

- [X] T010 Create `apps/web/src/lib/edge-mode.ts`: `isEdgeRequest(headers)` (constant-time compare of `x-trefle-edge` with `EDGE_SECRET`; false when unset) and `isEdgeRender()` (reads `x-trefle-edge-render === "1"` via `headers()`)
- [X] T011 Edge mode in `apps/web/src/middleware.ts`: on `isEdgeRequest` → nonce = `NONCE_PLACEHOLDER` (request CSP, `x-nonce`, response CSP, same policy text), delete `x-trefle-edge` and set `x-trefle-edge-render: 1` on the forwarded request (always overwrite/delete it otherwise), skip `maybeBucketForActiveTest`, never set a cookie, set `Cache-Tag: html,domain:<id>` (or `html` when the host has no active domain); on a path with a running test answer `new NextResponse(null, { status: 200, headers: { "x-trefle-ab": encodeAbMarker(test), "cache-tag": … } })` without rendering. Legacy path unchanged
- [X] T012 [P] In `apps/web/src/app/[[...slug]]/page.tsx` and `apps/web/src/app/ab-variant/[pageId]/page.tsx`: when `isEdgeRender()`, pass `formTokenPlaceholder(page.id)` instead of `signFormToken(...)` and skip `pingPageView`
- [X] T013 [P] In `apps/web/src/components/page-shell.tsx`: emit `<meta name="tf-page" content={String(page.id)} />` (both modes; React hoists it)
- [X] T014 Tests in `apps/web/tests/middleware-edge-mode.test.ts`: correct secret → placeholder nonce in both CSP headers and `x-nonce`, `x-trefle-edge` removed, `x-trefle-edge-render: 1`, no `Set-Cookie`, `Cache-Tag` with domain; wrong/absent secret or unset `EDGE_SECRET` → random nonce, client-sent `x-trefle-edge-render` stripped; tested path in edge mode → empty 200 with parsable marker and no cookie; tested path in legacy mode → rewrite + cookie as today
- [X] T015 [P] Tests in `apps/web/tests/page-edge-mode.test.ts`: edge render → form contains `TFEDGEFT<id>X`, `pingPageView` not called, `<meta name="tf-page">` present; legacy render → signed token, `pingPageView` called — *file is `page-edge-mode.test.ts`; covers both page routes*

### Worker substitution (`apps/edge`) — contracts/edge-worker.md §4

- [X] T016 Create `apps/edge/src/form-token.ts`: `signFormToken(secret, pageId, issuedAt)` with WebCrypto HMAC-SHA256 over `formTokenBody`, output `b64url(body) + "." + b64url(sig)` — *amended for SC-005 (research R5): optional `salt` argument, body `<pageId>.<issuedAt>.<salt>`; `newSalt()` = 8 random bytes base64url, one per response (T022)*
- [X] T017 Create `apps/edge/src/substitute.ts`: `substitute(body: ReadableStream, { nonce, tokenFor }) → { stream, pageId: Promise<string|null> }` — UTF-8 decode, replace every `NONCE_PLACEHOLDER` and `FORM_TOKEN_PLACEHOLDER_RE` match, carry over `maxPatternLength − 1` characters across chunks, capture the first `<meta name="tf-page" content="(\d+)">`, encode back to bytes; `newNonce()` = 32 lowercase hex chars from 16 random bytes
- [X] T018 [P] Tests in `apps/edge/tests/substitute.test.ts`: placeholders split at every possible chunk boundary, several occurrences replaced by the same nonce/token, placeholder inside a JSON-escaped RSC string, no placeholder → bytes unchanged, page id captured across a boundary, multi-byte UTF-8 split across chunks
- [X] T019 [P] Tests in `apps/edge/tests/form-token.test.ts`: the shared vector from T009 matches; token accepted by a port of `verifyFormToken`'s signature check

**Checkpoint**: shared code, origin edge mode and substitution ready; production unchanged.

---

## Phase 3: User Story 1 - Pages stay fast during a traffic spike (Priority: P1) 🎯 MVP

**Goal**: pages served from the zone cache through the Worker, origin rendering only on a miss.

**Independent Test**: on the test host, a page is `HIT` from the second request and the origin log shows one render for many requests (quickstart V2, V12 at small scale).

- [X] T020 [US1] Amend `.specify/memory/constitution.md` to 2.2.0 per research R19 **before the Worker caches any page HTML** (T026 is the first time it does): Architecture "Edge" now allows page HTML in the edge cache, personalised per request by the edge Worker (CSP nonce, form token, A/B) and purged by tag on change and on deploy; "Rendering & caching" adds the edge cache in front of SSR/ISR, invalidated by the same change hooks; Principle II justified additions: Cloudflare Workers (Paid), Analytics Engine, Queues, `wrangler` as a dev tool. The Sync Impact Report states the context of this exception to the former rule: caching starts on the test host `EDGE_TEST_HOSTNAME` only, for validation (US1–US4, US6); real hosts switch only at go-live (Phase 8) once freshness, counting and fallback are proven; until then the origin's legacy mode keeps serving every real host exactly as before, and `edge-off.sh` (T051) returns to it at any time
- [X] T021 [US1] Create `apps/edge/src/classify.ts`: `classify(request) → "pass" | "page"` per contracts/edge-worker.md §1 (non GET/HEAD; `RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch` headers; `_rsc` query; paths `/preview/*`, `/confirm`, `/confirmation`, `/unsubscribe`, `/form-retry`)
- [X] T022 [US1] Implement the cached-page path in `apps/edge/src/index.ts` (contract §2): `ctx.passThroughOnException()`; origin request = same host + path, no query, GET, `x-trefle-edge: <EDGE_SECRET>`, only `Accept-Language` and `User-Agent` forwarded; `fetch(…, { cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "404": 86400, "500-599": 0 } } })`; on a response carrying `x-trefle-ab` → pass-through for now (US5 replaces this); stream through `substitute` with one `newNonce()` and `tokenFor = pageId => signFormToken(secret, pageId, Date.now())` (one `issuedAt` per response); replace the placeholder in `Content-Security-Policy`; drop `x-trefle-ab`, `x-middleware-rewrite`, `x-nextjs-*`, `Content-Length`, `ETag`, `Last-Modified`; set `Cache-Control: private, no-store` and `x-trefle-edge-served: 1`; HEAD → same headers, no body; `MODE=passthrough` → pass-through; `MODE=fail` → throw — *addition: only `text/html` bodies go through the substitution; any other file under the route (a file from `public/`) keeps its bytes; `Cache-Tag` is also removed from the visitor response*
- [X] T023 [P] [US1] Tests in `apps/edge/tests/fetch.test.ts` (Workers pool, mocked origin): classification table; origin request has the secret, no cookies, no query; visitor response has no placeholder, distinct nonces/tokens across two requests, no internal headers, `private, no-store`; HEAD has no body; `MODE=passthrough` forwards unchanged
- [X] T024 [US1] Create `infra/cloudflare/worker-routes.json` with two sets: `test` (`<EDGE_TEST_HOSTNAME>/*` → `trefle-edge`) and `live` (`*/*` → `trefle-edge`, plus no-Worker routes `<CMS_HOSTNAME>/*`, `<IMG_HOSTNAME>/*`, `<ASSET_HOSTNAME>/*`, `<GROWTHBOOK_HOSTNAME>/*`, `<GROWTHBOOK_API_HOSTNAME>/*`, `*/_next/*`, `*/api/*`, `*/favicon.ico`, `*/robots.txt`, `*/sitemap.xml`); extend `infra/cloudflare/apply.sh` to apply the set chosen by `EDGE_ROUTES=test|live|off` (default: keep current) through the Workers Routes API, idempotently, with `--dry-run` — *no-Worker routes are created before and removed after the Worker routes, so `/api/*` never reaches the Worker during a change; only patterns listed in the file are touched*
- [X] T025 [US1] Add `EDGE_TEST_HOSTNAME` (e.g. `edge-check.example.com`) to `infra/cloudflare/secret.env.example`, the Caddyfile `WEB_HOSTNAMES` and a domain record in the CMS pointing at a copy of `/loadtest`; document in `infra/cloudflare/README.md`; create its DNS record (proxied, same target as the other Trefle hosts) and its `_acme-challenge.<host> CNAME <ACME_DELEGATE_HOSTNAME>` record (DNS-only) so Caddy's DNS-01 issues its certificate (017 R3); check with `curl -I https://<host>` before T026 — *2026-10-12: DNS by the user (A/AAAA proxied + `_acme-challenge` CNAME), VPS `WEB_HOSTNAMES` + edge keys, release `020.1-edge-mode`, certificate by DNS-01, CMS domain 7 + page 61; `/loadtest` 200*
- [X] T026 [US1] Deploy the Worker and apply `EDGE_ROUTES=test`; run quickstart V1 and V2 (including the 1,000-response uniqueness check, SC-005) on the test host — record whether the path-only no-Worker routes were accepted and whether the "Pages: never cache HTML" rule blocks storage (research R2/R13); if it does, add `and not len(http.request.headers["x-trefle-edge"]) > 0` to that rule in `infra/cloudflare/rules/cache.json` and re-apply — *2026-10-12: Worker deployed by the user, `EDGE_ROUTES=test` applied. V2 passed (MISS then HIT, also with utm/gclid; per-response nonce, salted tokens, no placeholder, `private, no-store`, no cookie); SC-005 1,000/1,000 distinct nonces and tokens (139 same-millisecond pairs absorbed by the salt). The "never cache HTML" rule does not block storage: `cache.json` unchanged. V1 path-only no-Worker routes not exercised (only in the `live` set) — checked at go-live (T060)*
- [X] T027 [US1] Run a 1,000/s, 1-minute k6 run against the test host (`infra/loadtest/pages.js`, `BASE_URL` = test host) and count renders in the Caddy log; record in `infra/loadtest/results/<date>-020-test-host.md` — *2026-10-12: 60,000 requests at 999.5/s, 0 errors, 100 % HIT, p95 55 ms; 1 render at the origin (`infra/loadtest/results/2026-10-12-020-test-host.md`). Generator: Hetzner CPX32; the Caddy access log of the page hosts was added for this (release `020.2-page-access-log`)*

**Checkpoint**: caching works on the test host; real hosts untouched.

---

## Phase 4: User Story 2 - Visitors and clients lose nothing (Priority: P1)

**Goal**: every per-visit behaviour identical to today on cached pages.

**Independent Test**: the e2e `edge` project passes through the Worker; quickstart V4–V6.

- [X] T028 [US2] Add a Playwright project `edge` in `apps/web/playwright.config.ts`: base URL = a local `wrangler dev` (`apps/edge`, `--var ORIGIN_OVERRIDE`) in front of the local stack, enabled with `E2E_EDGE=1`; add `ORIGIN_OVERRIDE` support (dev only: rewrites the origin host of subrequests) in `apps/edge/src/index.ts` — *`apps/edge/scripts/dev-e2e.sh` (wrangler dev on 0.0.0.0:8787, `ORIGIN_OVERRIDE`, secrets from `infra/.env`), `npm run test:e2e:docker:edge` (`E2E_EDGE=1` points `E2E_BASE_URL` at the Worker for every spec). `ORIGIN_OVERRIDE` sends the visitor host as `X-Forwarded-Host`. Also: origin redirects are never followed (`redirect: "manual"`); `apps/edge/node_modules` masked in the e2e container. Local wrangler does not cache: cache-specific checks are on the test host*
- [X] T029 [P] [US2] Create `apps/web/tests/e2e/edge-parity.spec.ts`: two loads of the same page → different nonces and form tokens, identical content otherwise, no `TFEDGE` in the HTML; no-JS lead submit after 3 s accepted; submit under 2 s refused; consent-required custom code runs after « Accepter » without reload; GTM `dataLayer` has `page_view`/`lead_form_view`; preview, unsubscribe and form-retry URLs not cached (`x-trefle-edge-served` absent or `cf-cache-status` not HIT); an `RSC: 1` request never poisons the next GET — *runs in both modes; consent-gated code, GTM and A/B are covered by the existing specs run through the Worker, not repeated*
- [X] T030 [US2] Run the existing e2e suite plus `edge-parity.spec.ts` through the `edge` project; fix every difference (log each in the PR body) — *2026-10-12: 84 tests through the Worker, 78 passed + 6 flaky (3 also flaky without the Worker; the 3 others — carousel rotation, axe timeout, media replace — pass 27/27 alone without retries). No difference to fix*
- [X] T031 [US2] Quickstart V4, V5, V6 on the test host; record results in `specs/020-edge-html-cache/quickstart.md` (dated notes under each scenario) — *2026-10-12: V4, V5, V6 passed on `edge-check`, notes in quickstart.md*

**Checkpoint**: parity proven locally and on the test host.

---

## Phase 5: User Story 3 - Editors' changes appear right away (Priority: P1)

**Goal**: purge by tag on every content change and on every deploy.

**Independent Test**: quickstart V7 on the test host — publish/unpublish/media/settings visible within 30 s; after a release, no reference to old chunks.

- [X] T032 [US3] Create `apps/web/src/lib/edge-purge.ts`: `queueEdgePurge(tags)` collecting tags for 1 s, de-duplicating, collapsing to `["html"]` when present, `POST https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache` `{ tags }` (≤ 100 per request) with `Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}`; retry 429/5xx with backoff 1, 2, 4, 8, 16, 29 s (≤ 60 s total); `log.error("edge purge failed", { tags })` on final failure; no-op with a debug log when the token is unset
- [X] T033 [US3] In `apps/web/src/app/api/revalidate/route.ts`: after the `revalidateTag` loop, `queueEdgePurge(edgeTagsFor(tags))` (not awaited by the response)
- [X] T034 [P] [US3] Tests in `apps/web/tests/edge-purge.test.ts` (mocked fetch, fake timers): coalescing of two calls within 1 s into one request, `html` collapse, >100 tags split, 429 then success, final failure logged, unset token → no request; `/api/revalidate` with `media-aliases` → purge `html` after `revalidateTag(…, { expire: 0 })` — *plus a 403 is not retried (only 429, 5xx and network errors are), and the route queues nothing on a refused request*
- [X] T035 [US3] In `apps/cms/src/hooks/experiments-revalidate.ts`: also send `domain:<id>` of the control page's domain (look up the control page with `depth: 0` when `controlPage` is an id); test in `apps/cms/tests/experiments-revalidate.test.ts` — *a populated domain object is accepted; if the domain cannot be found, `html` is sent instead (over-purge, never stale)*
- [X] T036 [US3] Add the final step to `infra/deploy/release.sh` (update and rollback): after containers are healthy, `curl` purge `{"tags":["html"]}` with `CLOUDFLARE_PURGE_TOKEN`/`CLOUDFLARE_ZONE_ID` read from `infra/.env` (names only printed); on failure stop with the exact command to re-run — *skipped with a message while `CLOUDFLARE_PURGE_TOKEN`/`CLOUDFLARE_ZONE_ID` are unset; the failure message gives a re-run command that reads the token from `infra/.env` (never printed)*
- [X] T037 [P] [US3] Create `infra/cloudflare/purge-pages.sh [html|domain:<id>]` (operator machine, zone token) and list it in `infra/cloudflare/README.md`
- [X] T038 [US3] Quickstart V7 on the test host (10 publish trials for SC-006, media replacement, banner change, a release); record results — *2026-10-12: passed on the second series after the stale-render fix (`020.4-revalidate-expire`); details in quickstart.md V7*

**Checkpoint**: cached pages stay fresh.

---

## Phase 6: User Story 4 - Statistics keep counting without loading the server (Priority: P2)

**Goal**: every edge-served view counted within 3 minutes, no server write per view, no lost updates.

**Independent Test**: quickstart V8 — 5,000 views → +5,000 ±1 % in `page-stats` within 3 min; one `/api/edge/views` request per minute.

- [X] T039 [US4] Rewrite `incrementPageStat` in `apps/cms/src/lib/page-stats.ts` as one SQL upsert through `payload.db.drizzle`: `INSERT INTO page_stats (page_id, date, views, submissions, updated_at, created_at) VALUES (…) ON CONFLICT (page_id, date) DO UPDATE SET <field> = page_stats.<field> + EXCLUDED.<field>, updated_at = now()` (uses the existing unique `page_date_idx`); keep the signature `(payload, pageId, field, by = 1)` — *optional `{ day, db }` (the window's UTC day, the batch's transaction); increments `views` and `submissions` through `EXCLUDED`, no dynamic column name*
- [X] T040 [P] [US4] Tests in `apps/cms/tests/page-stats-atomic.test.ts`: 50 concurrent increments → exact total; two concurrent first views of a day → one row, count 2; `submissions` path unchanged for lead intake — *in `tests/db/` against real Postgres, in a throwaway schema (`npm run test:db`, also a CI step in the cms container)*
- [X] T041 [P] [US4] Create the hidden collection `apps/cms/src/collections/EdgeViewWindows.ts` (`slug: "edge-view-windows"`; fields `windowStart` date **required, unique**, `applied` json (page id → views already applied, integers ≥ 0); access: all `() => false`; `admin.hidden: true`), register it in `apps/cms/src/payload.config.ts`, generate the migration `apps/cms/src/migrations/<ts>_edge_view_windows.ts` (expand only, with `down`) — *generated `down` made idempotent (`IF EXISTS` after `DROP TABLE … CASCADE`); up/down/up checked locally*
- [X] T042 [US4] Create `apps/cms/src/endpoints/pageViewsBatch.ts` — `POST /api/page-views/batch`, service caller only (same `isServiceCaller` as `pageView.ts`), body `{ windows: [{ start, counts }] }` per contracts/edge-ingest.md: per window in one transaction, lock or create the ledger row, add only `delta = n − applied[page]` when positive with `incrementPageStat(…, "views", delta)` for the UTC day of `start`, then store `applied[page] = n`; unknown page ids ignored; response `{ added, windows }`; register in `payload.config.ts` — *body validated (minute-aligned starts, integer counts, ≤ 20 windows) → 400 otherwise*
- [X] T043 [P] [US4] Tests in `apps/cms/tests/page-views-batch.test.ts`: window posted twice adds nothing the second time, re-posted with a higher count adds only the difference, lower count changes nothing, two windows same day add up, two concurrent posts of the same window add once, window at 23:59 UTC goes to that day, unknown page ignored, non-service caller → 403 — *in `tests/db/`, real Postgres (concurrency needs it)*
- [X] T044 [US4] Add ledger cleanup (`windowStart` older than 30 days) to `apps/cms/src/jobs/retentionSweep.ts` with a test case in its existing test file
- [X] T045 [US4] Create `apps/web/src/app/api/edge/views/route.ts`: verify `X-Trefle-Signature` = hex HMAC-SHA256(`EDGE_SECRET`, raw body) in constant time and `at` within 5 min (401/400 otherwise), forward `{ windows }` with `postPageViewBatch()` added to `apps/web/src/lib/payload-client/index.ts` — *signature check in `tokens.ts` (`verifyEdgeSignature`); `at` must be within 5 min either way*
- [X] T046 [P] [US4] Tests in `apps/web/tests/edge-ingest.test.ts`: bad signature 401, stale 400, valid → forwarded body, CMS 5xx → 502
- [X] T047 [US4] Create `apps/edge/src/views.ts`: `recordView(env, pageId, host)` (`env.PAGE_VIEWS.writeDataPoint({ indexes: [pageId], blobs: [host], doubles: [1] })`); `runViewCron(env, scheduledTime)`: query the Analytics Engine SQL API (`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, Bearer `CF_ANALYTICS_TOKEN`) for the 10 last closed minute windows (`[t−10 min, t)` minus the current minute) — `SELECT toStartOfMinute(timestamp) AS m, index1 AS page, SUM(_sample_interval) AS n FROM trefle_page_views WHERE timestamp >= … AND timestamp < … GROUP BY m, page` — and post them signed to `${ORIGIN_INGEST_URL}/api/edge/views` — *the cron sends nothing when no page was viewed; it sets a `User-Agent` (Browser Integrity Check)*
- [X] T048 [US4] Wire counting into `apps/edge/src/index.ts`: after a 200 non-marker response, `ctx.waitUntil(pageId.then(id => id && recordView(…)))`, errors swallowed; `scheduled` → `runViewCron` — *GET only (no HEAD), 200 HTML only*
- [X] T049 [P] [US4] Tests in `apps/edge/tests/views.test.ts`: data point written once per served 200 page, not for pass-through or 404; cron builds the right window bounds and signed body (mocked AE response); AE failure does not throw
- [X] T050 [US4] Quickstart V8 on the test host; record results — *2026-10-12: 4,999 views sent → 5,002 counted within 2 min (quickstart V8)*

**Checkpoint**: counting complete; the go-live prerequisites US2–US4 are in place.

---

## Phase 7: User Story 6 - Safe fallback and rollback (Priority: P3)

*(Before US5: required for go-live.)*

**Goal**: any Worker failure or switch-off gives today's behaviour.

**Independent Test**: quickstart V11.

- [X] T051 [US6] Create `infra/cloudflare/edge-off.sh` (apply `EDGE_ROUTES=off`: delete the `*/*` and test routes, keep exclusions) and `infra/cloudflare/edge-on.sh` (apply `live`); both print the resulting routes; document in `infra/cloudflare/README.md` and `infra/deploy/README.md` / `README.fr.md` (« Couper le cache des pages ») — *route sync moved to `infra/cloudflare/worker-routes.sh test|live|off|cut` (routes only, fast; `apply.sh` calls it); `edge-off.sh` = `cut` (removes only routes to the Worker, exclusions kept), `edge-on.sh [live|test]`; deploy README §7.6 in both languages*
- [X] T052 [P] [US6] Tests in `apps/edge/tests/fallback.test.ts`: `MODE=fail` → the runtime falls back to the origin (assert `passThroughOnException` was called before any await); AE write throwing → response still 200 — *plus: an origin request that fails is thrown after the fallback is armed; pass-through requests never arm it*
- [X] T053 [US6] Quickstart V11 steps 1–4 on the test host and locally (step 4: renderer stopped → cached page still served, FR-004); record results — *2026-10-12: all four steps passed (quickstart V11)*

**Checkpoint**: ready to switch real traffic.

---

## Phase 8: Go-live (US1 acceptance on real hosts)

- [X] T054 Deploy slice 1 + 2 code (`release.sh`), then the Worker; apply `EDGE_ROUTES=live` (T024) during low traffic; run quickstart V1–V3 on `example.com` and the client `www.` host — *2026-10-12: releases 020.1–020.6 and Worker already in production; `edge-on.sh live` applied by the user; V1 (path-only no-Worker routes accepted, pages `HIT` from the Worker, `/_next`, `/api`, admin, images, `/confirm`, `/form-retry` not through it), V2 (own nonce and salted token per visit, no cookie), V3 (each host its own page) passed on `example.com`, `www.` and `www.client-site.example`; a lead submitted on `/loadtest` accepted*
- [X] T055 Run quickstart V12 at 1,000/s for 10 minutes on `/loadtest` (page not under test): p95 < 1 s, 0 errors, < 50 renders in the Caddy log, leads during the run all accepted; commit `infra/loadtest/results/<date>-020-pages-1000.json` and a `.md` summary (SC-001, SC-003, SC-004) — *2026-10-12: 599,983 views at 999.9/s, 0 errors, p95 45 ms, 0 renders (`infra/loadtest/results/2026-10-12-020-pages-1000.md`); leads checked just before and after, not during*

**Checkpoint**: MVP live — pages not under test served from the edge.

---

## Phase 9: User Story 5 - A/B tests keep working at the edge (Priority: P2)

**Goal**: variants assigned at the edge and served from the cache; first exposures recorded when 018 is active.

**Independent Test**: quickstart V9 (split 48–52 % over 10,000 visitors, sticky variant, no leak in headers, conclusion within 30 s); V10 once 018 is live.

- [X] T056 [US5] Create `apps/edge/src/ab.ts`: from a marker response, `abCookieName(key)`; keep a cookie value that is in the id list; else `assignVariant(visitorId ?? crypto.randomUUID(), key, ids)` (visitorId = 018 identifier cookie when present); return `{ variantId, setCookie?: "tf-ab-…=<id>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; Secure", isNew }`; malformed marker → first id (control), no cookie — *`Secure` only over https (local `wrangler dev` is plain http); 018 cookie names reserved as provisional constants in `@trefle/shared` (`tf-visitor`, `tf-measure-objection`)*
- [X] T057 [US5] In `apps/edge/src/index.ts`, replace the marker pass-through (T022) with: `ab.ts` decision → fetch `/ab-variant/<id>` through the same cached-page path → append `Set-Cookie` when new; marker headers never forwarded — *`/ab-variant/<id>` fetched through the same cached-page path (one cached copy per variant); `Set-Cookie` only on a new assignment; a marker that cannot even give the control → served by the origin as today*
- [X] T058 [US5] Create `apps/edge/src/exposures.ts`: `maybeSendExposure(env, ctx, …)` only when `EXPOSURES === "on"`, `isNew`, 018 identifier present, no 018 objection cookie, user agent not matching `CRAWLER_UA_RE` → `env.EXPOSURES_QUEUE.send({ visitorId, experimentKey, variantId, domainId, at })` (`domainId` from the marker); `queue` handler: one signed `POST ${ORIGIN_INGEST_URL}/api/edge/exposures` per batch, `ackAll` on 2xx, `retryAll` otherwise — *signing shared with the view cron (`src/sign.ts`)*
- [X] T059 [US5] Create `apps/web/src/app/api/edge/exposures/route.ts`: same signature/staleness checks as T045; answers 404 until 018's intake exists (then forwards with `postExposureBatch()`) — *checks shared with `/api/edge/views` (`lib/edge-ingest.ts`)*
- [X] T060 [P] [US5] Tests in `apps/edge/tests/ab.test.ts`: sticky cookie kept, invalid cookie replaced, split within 48–52 % over 10,000 random draws, cookie attributes exact, cookie name rule identical to middleware, no marker header in the visitor response, exposure sent only on new assignment with identifier and without objection or crawler UA, `EXPOSURES=off` sends nothing, queue consumer ack/retry
- [X] T061 [US5] Add A/B cases to `apps/web/tests/e2e/edge-parity.spec.ts` (`edge` project): new visitor gets a variant and a cookie, returning visitor keeps it over 10 loads, both variants served with `x-trefle-edge-served`, conclusion → outcome page within 30 s — *added to `ab-testing-bucketing.spec.ts` (it already creates and stops a test), edge-only; also fixed `edge-parity` to compare what the visitor sees (React streams Suspense boundaries differently between two renders)*
- [X] T062 [US5] Deploy; quickstart V9 in production on `/loadtest` (10,000 fresh visitors, k6 without cookie jar); record results — *2026-10-12: 9,926 visitors, 50.15/49.85 %, conclusion visible in 4.4 s (`infra/loadtest/ab.js`, results file)*
- [ ] T063 [US5] Run quickstart V12 at 10,000/s for 1 minute from a distributed generator (k6 Cloud or several hosts) on a page under test and on a plain page; commit results (SC-002)

**Checkpoint**: all pages, including pages under test, served from the edge.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T064 [P] Update `infra/loadtest/README.md` with the 020 runs (1,000/s, distributed 10,000/s, how to count origin renders)
- [X] T065 [P] Update `docs/cdn-cache-exploration.fr.md` §11 with what changed during implementation (verified route patterns, cache-rule adjustment, measured CPU per view) and `infra/cloudflare/README.md` (Worker, routes, secrets rotation for `EDGE_SECRET` and `FORM_TOKEN_SECRET`) — *CPU per view not measured yet: with the invoice (T067)*
- [X] T066 [P] Run `npm run lint`, `npm run typecheck`, `npm test` for all workspaces and `npm run compose:config` — *2026-10-12: typecheck and lint clean; shared 74, web 224, cms 586 (+ test:db 12), edge 63, grapesjs-page-import 188; compose:config OK*
- [ ] T067 Check the first Cloudflare invoice against research R18 (Workers requests/CPU, Analytics Engine, Queues) and record it in `docs/cdn-cache-exploration.fr.md` §11.7
- [X] T068 Mark 017's open programme item (lots 2–4) as replaced by 020 in `specs/017-edge-protection/spec.md` Context (one sentence) and update memory notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → user stories.
- **US1 (3)** needs Foundational and starts with the constitution amendment T020: no page HTML is cached, even on the test host, before it. **US2 (4)**, **US3 (5)**, **US4 (6)** need US1's Worker path (T022) but are independent of each other.
- **US6 (7)** needs T022 and T024.
- **Go-live (8)** needs US1, US2, US3, US4, US6 complete (go-live rule).
- **US5 (9)** needs Go-live (pages under test move last). Exposure sending (T058) stays off until 018's intake exists.
- **Polish (10)** after US5 (T064–T066 can start after Go-live).

### Within each story

Tests are written alongside implementation (Principle IV: not test-first) but
must pass before the story's checkpoint.

### Parallel opportunities

- Setup: T003, T004, T005 in parallel.
- Foundational: T007, T008 in parallel; then T009, T012, T013, T015, T016 in parallel; T018, T019 in parallel.
- After T022: US2 (T028–T031), US3 (T032–T038) and US4 (T039–T050) can proceed in parallel; inside US4, the CMS part (T039–T044), the renderer route (T045–T046) and the Worker part (T047–T049) are parallel streams.

## Parallel Example: User Story 4

```text
Stream A (CMS):      T039 → T040 ; T041 → T042 → T043 ; T044
Stream B (renderer): T045 → T046
Stream C (Worker):   T047 → T048 → T049
Then:                T050 (quickstart V8)
```

## Implementation Strategy

### MVP

Setup → Foundational → US1 on the test host → US2, US3, US4, US6 → Go-live
(Phase 8). That is the first increment that delivers value: pages not under
test served from the edge at 1,000/s, with nothing lost.

### Incremental delivery

1. Foundational alone ships to production with no visible change (and fixes
   the lost view counts once T039 lands — T039 can ship early on its own).
2. Each story is validated on the test host before go-live.
3. US5 moves pages under test to the edge last; until then they are served by
   the origin as today.
4. Rollback at any point after go-live: `edge-off.sh` (T051).
