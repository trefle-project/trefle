# Implementation Plan: Page HTML served from the edge cache

**Branch**: `020-edge-html-cache` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-edge-html-cache/spec.md`

## Summary

Serve published pages from the Cloudflare cache so the VPS (saturated at ~26
page views/s) renders each page only when its cached copy is missing, while
keeping every per-visit behaviour. Technical approach (details in
[research.md](research.md)):

- **Edge Worker** (`apps/edge`, route `*/*` with no-Worker exclusions for
  internal hosts, `/_next/*` and `/api/*`) fetches pages through the **zone
  cache** (not Workers Caching: it would skip the Worker and ignore the host)
  and streams them through a substitution that puts a fresh **CSP nonce** and a
  freshly **signed form token** in place of fixed placeholders — in the HTML
  and in the RSC payload (R1, R2, R4, R5, R13).
- **Origin "edge mode"** behind a shared secret header: placeholder nonce and
  token, no A/B, no cookie, no view ping, `Cache-Tag: html,domain:<id>`.
  Without the header the renderer behaves exactly as today — dev, e2e,
  pass-through and fallback (R3, R14).
- **A/B at the edge**: a path under test caches a small **marker** instead of
  HTML; the Worker assigns the variant with the shared `assignVariant`, sets
  the same cookie and serves `/ab-variant/<id>` from the cache (R10).
- **Counting without per-view server work**: Analytics Engine points + a
  per-minute cron posting closed windows to an idempotent batch intake, with an
  atomic `page-stats` upsert that also fixes today's lost updates (R7, R8).
  A/B exposures (018) go through a Queue in batches, first exposure only
  (R11).
- **Freshness**: `/api/revalidate` purges by tag (domain-level, `html` for
  global changes) with a purge-only token, coalesced for Free-plan limits;
  `release.sh` purges `html` after each deploy (R9).
- **Rollback**: delete the `*/*` route (`edge-off.sh`) → today's behaviour,
  instantly (R15). Constitution amended to 2.2.0 (R19).

## Technical Context

**Language/Version**: TypeScript (strict) — Next.js 16.3.4 renderer, Payload
3.88.0 CMS, Cloudflare Workers runtime (new `apps/edge`); bash for infra
scripts.

**Primary Dependencies**: existing stack + Cloudflare (017). **Added**:
Cloudflare Workers (Paid plan) with Analytics Engine, Queues and Cron
Triggers; `wrangler` and `@cloudflare/vitest-pool-workers` as dev
dependencies of `apps/edge`. No new runtime package in `apps/web` or
`apps/cms`.

**Storage**: PostgreSQL — one hidden collection `edge-view-windows` (Payload
migration, expand only); `page-stats` unchanged in schema, written by an
atomic upsert. Edge: zone cache, Analytics Engine dataset
`trefle_page_views`, Queue `trefle-exposures` (+ DLQ). See
[data-model.md](data-model.md).

**Testing**: Vitest (web, cms, shared, edge with the Workers pool);
Playwright — existing suite in legacy mode plus an `edge` project through
`wrangler dev`; k6 for SC-001/SC-002 (distributed generator for 10,000/s);
quickstart V1–V12.

**Target Platform**: Cloudflare edge (Worker) in front of the Hostinger VPS
(Docker Compose).

**Project Type**: web — monorepo `apps/web`, `apps/cms`, `packages/shared`,
**new** `apps/edge`, `infra/`.

**Performance Goals**: 1,000 page views/s sustained 10 min, p95 < 1 s, 0
errors; 10,000/s for 1 min; < 50 origin renders of the test page during the
1,000/s run (SC-001–SC-003). Worker CPU ≈ 2 ms per view.

**Constraints**: CSP as strict as today; no-JS form; no `Set-Cookie` on
cacheable responses; Free-plan purge limits (5/min, bucket 25, 100 tags);
counts within 3 min; publish visible within 30 s; cost ≈ $0.35 per million
views beyond 10 M + $5/month.

**Scale/Scope**: 2 domains today (≤ 100 custom hostnames before per-hostname
cost); tens of pages; a handful of concurrent A/B tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / section | Status | Notes |
|---|---|---|
| I. Simplicity First | Pass | One Worker, no KV/Durable Objects; the A/B list travels as a cached marker instead of a new endpoint; domain-level purge tags instead of page bookkeeping; one switch (secret header) keeps a single rendering code path. |
| II. Stack-Native, Minimal Additions | **Justified** | Cloudflare Workers + Analytics Engine + Queues: nothing in the stack can personalise a cached page at the edge or count views without per-view server work; Next's own nonce support requires dynamic rendering (no ISR with a nonce). `wrangler` is a dev tool. Server side uses Payload hooks/collections/endpoints and Next route handlers only. See Complexity Tracking. |
| III. Small, Reversible Changes | Pass | Three slices (below), each deployable alone. Slice 1 is inert without the Worker. Worker on/off is a route change (`edge-off.sh`), no server deploy. Migration is expand-only with a down path. |
| IV. Working Software Over Ceremony | Pass (planned) | Tests required for: substitution (chunk boundaries, uniqueness), form-token parity (shared vector), edge-mode middleware, marker/assignment, purge mapping + coalescing, ingest signatures, atomic upsert + window ledger (cache invalidation logic and endpoints are constitution-mandated). Existing e2e suite as regression gate, plus the `edge` project. |
| V. Quality the User Feels | Pass | Pages unchanged and faster; no-JS form kept (R5); no client JS added; admin counts stay readable (≤ 3 min lag, documented). |
| Architecture — Edge bullet | **Amend** | "Page HTML is not cached at the edge until an amendment allows it" → amended to 2.2.0 at the start of US1 (T020), before the Worker first caches HTML on the test host; the Sync Impact Report records that real hosts follow only at go-live. |
| Architecture — Rendering & caching | **Amend** | Edge cache in front of SSR/ISR, invalidated by the same change hooks. |
| Lead capture | Pass | `/api/leads` unchanged and never routed through the Worker; real IP and rate limit as today. |
| Secrets & configuration | Pass | `EDGE_SECRET`, `CLOUDFLARE_PURGE_TOKEN` (purge only), `CLOUDFLARE_ZONE_ID` in `infra/.env` (git-crypt) and `.env.example`; Worker secrets set with wrangler; broad Cloudflare tokens stay off the VPS. |
| Performance budget | Pass | No client JS added; one `<meta>` per page. |

**Post-design re-check (after Phase 1)**: unchanged. The contracts add two
signed renderer routes (`/api/edge/views`, `/api/edge/exposures`), one CMS
endpoint (`/api/page-views/batch`) and one hidden collection; the only new
runtime layer remains the Worker.

## Project Structure

### Documentation (this feature)

```text
specs/020-edge-html-cache/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R20
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — validation scenarios V1–V12
├── contracts/
│   ├── edge-worker.md       # what the Worker does per request, cron, queue
│   ├── origin-edge-mode.md  # renderer behaviour with / without the edge header
│   ├── purge.md             # tags, purge on change and on deploy
│   └── edge-ingest.md       # view windows and exposure batches → origin
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── ab-bucket.ts                 # MOVED from apps/web/src/lib/ab-testing/bucket.ts (assignVariant)
├── edge.ts                      # NEW placeholders, header names, A/B marker encode/parse,
│                                #     edgeTagsFor(), crawler regex, form-token body/base64url
└── index.ts                     # exports
packages/shared/tests/
├── ab-bucket.test.ts            # MOVED from apps/web/tests/ab-testing-bucket.test.ts
└── edge.test.ts                 # NEW marker round-trip, tag mapping, form-token vector

apps/edge/                       # NEW Cloudflare Worker workspace (@trefle/edge)
├── package.json                 # wrangler, @cloudflare/vitest-pool-workers (dev)
├── wrangler.jsonc               # name trefle-edge, AE dataset, queue producer+consumer, cron "* * * * *",
│                                #   vars MODE/EXPOSURES/ORIGIN_INGEST_URL (routes applied by infra/cloudflare)
├── src/index.ts                 # fetch / scheduled / queue handlers
├── src/classify.ts              # pass-through vs cached page
├── src/substitute.ts            # streaming placeholder replacement + page-id capture
├── src/form-token.ts            # WebCrypto signer (format from @trefle/shared)
├── src/ab.ts                    # marker → cookie / assignVariant → variant fetch, exposure message
├── src/views.ts                 # data point write; cron: AE SQL query → /api/edge/views
├── src/exposures.ts             # queue consumer → /api/edge/exposures
└── tests/*.test.ts

apps/web/src/
├── middleware.ts                # edge mode (R3): secret check, placeholder nonce, marker, Cache-Tag, no cookie
├── lib/edge-mode.ts             # NEW isEdgeRender() (reads x-trefle-edge-render)
├── lib/edge-purge.ts            # NEW coalesced Cloudflare purge by tag (R9)
├── lib/ab-testing/bucket.ts     # REMOVED (moved to shared)
├── lib/payload-client/index.ts  # + postPageViewBatch / postExposureBatch
├── app/[[...slug]]/page.tsx     # placeholder token + no pingPageView in edge mode
├── app/ab-variant/[pageId]/page.tsx  # same
├── app/api/revalidate/route.ts  # + edgePurge(edgeTagsFor(tags))
├── app/api/edge/views/route.ts      # NEW signed → CMS batch
├── app/api/edge/exposures/route.ts  # NEW signed → 018 intake (404 until 018)
└── components/page-shell.tsx    # + <meta name="tf-page">
apps/web/tests/
├── middleware-edge-mode.test.ts # NEW
├── edge-purge.test.ts           # NEW
├── edge-ingest.test.ts          # NEW
└── e2e/ (playwright.config: + `edge` project via wrangler dev)

apps/cms/src/
├── lib/page-stats.ts            # atomic upsert (R8)
├── collections/EdgeViewWindows.ts   # NEW hidden ledger
├── endpoints/pageViewsBatch.ts  # NEW POST /api/page-views/batch (service only)
├── hooks/experiments-revalidate.ts  # + domain:<id> of the control page
├── jobs/retentionSweep.ts       # + delete ledger rows > 30 days
└── migrations/<ts>_edge_view_windows.ts  # NEW (expand)
apps/cms/tests/
├── page-stats-atomic.test.ts    # NEW concurrency
└── page-views-batch.test.ts     # NEW idempotency, day boundary

infra/
├── cloudflare/worker-routes.json    # NEW */* → trefle-edge + no-Worker exclusions
├── cloudflare/apply.sh              # + Worker routes; Pages cache rule adjusted if R2 requires
├── cloudflare/edge-off.sh / edge-on.sh  # NEW kill switch (R15)
├── cloudflare/purge-pages.sh        # NEW manual purge
├── cloudflare/secret.env.example    # + CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKERS_TOKEN
├── deploy/release.sh                # + final purge of `html`
├── docker-compose.prod.yml          # web: EDGE_SECRET, CLOUDFLARE_PURGE_TOKEN, CLOUDFLARE_ZONE_ID
├── .env.example                     # same keys documented
├── loadtest/                        # 1,000/s and distributed 10,000/s runs documented
└── deploy/README.md / README.fr.md  # edge on/off, secrets rotation, purge

.specify/memory/constitution.md      # 2.2.0 (slice 2)
docs/ (privacy notice unchanged: no new personal data — 018 handles exposures)
```

**Structure Decision**: existing monorepo plus one workspace, `apps/edge`,
for the Worker (a separate deployable with its own runtime and tests).
Worker-safe shared logic lives in `packages/shared`, which already has no
Node-only code. Server changes follow the existing patterns
(middleware/route handlers in the renderer, hooks/endpoints/collections in
Payload); infra additions sit next to 017's `infra/cloudflare/` scripts.

## Implementation phases (input for /speckit-tasks)

Aligned with [tasks.md](tasks.md):

1. **Setup + Foundational — origin ready, nothing visible** (no Worker route):
   `apps/edge` workspace and secrets; shared `ab-bucket` move + `edge.ts`;
   middleware edge mode; page placeholder token / no ping in edge mode;
   `<meta tf-page>`; Worker substitution and form-token signing. Deployable
   alone; e2e green. The atomic `page-stats` upsert (US4, T039) may ship here
   on its own: it fixes today's lost views.
2. **Test host** — constitution 2.2.0 first (T020), then the Worker on
   `EDGE_TEST_HOSTNAME` only (a dedicated proxied host with its DNS-01
   delegation): US1 (caching), US2 (parity, e2e `edge` project), US3
   (purge on change and deploy), US4 (counting), US6 (fallback, kill switch).
   Pages under test pass through. Quickstart V1–V8, V11.
3. **Go-live** — `*/*` route for real hosts; quickstart V1–V3 and V12 at
   1,000/s on a page not under test.
4. **A/B at the edge** (US5): marker handling, cookie, variant fetch; queue +
   consumer wired with `EXPOSURES=off` until 018; quickstart V9, V10 (when
   018 is live), V12 including 10,000/s.

## Risks

| Risk | Mitigation |
|---|---|
| Worker subrequest not stored because of the existing "Pages bypass" Cache Rule or Next's headers | V2 in slice 2 before routing real traffic (route on a test host first); fallback rule exception on the edge header (R2). |
| Path-only no-Worker routes refused by the API | V1; stop-gap: Worker passes those paths through (cost × number of static requests — measured, then decided). |
| Placeholder left in a response (new code path emitting the nonce elsewhere) | Invariant test "no TFEDGE in output" over every page template in the `edge` e2e project; Worker logs and counts any leftover. |
| React hydration differences after substitution | Same value replaced everywhere in one response (HTML + RSC payload), checked by the e2e consent-code and no-JS/JS form flows. |
| Purge rate limits (Free: 5/min) during bulk publishing | Coalescing + `html` collapse + backoff; 429 frequency is a documented Pro trigger. |
| Deploy window: cached HTML referencing removed chunks | Purge at the end of `release.sh`; `/_next/static` stays cached at the edge (immutable) which covers the seconds between swap and purge. |
| Analytics Engine price/limits differ from estimate | First invoice check; the count path is isolated (views.ts) and can switch to a batched origin call without touching the rest. |
| Next 16 `middleware` → `proxy` rename lands in a later upgrade | Edge mode lives in a small function reused by whichever file Next expects. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Cloudflare Worker as a code runtime outside the stack (Principle II, Architecture) | The cached HTML must get a fresh nonce, a fresh form token and an A/B decision on every view; only code running at the edge can do that on a cache hit | "Cache Everything" without code breaks CSP/form/A-B/counting; hash-based CSP is fragile and weaker (R1); client-side token/beacon loses the no-JS form and adds origin work |
| Analytics Engine + Queues (Principle II) | Count views and record exposures without one server write per view (user decision 2026-10-11); exposures must be lossless (018) | Per-view origin ping (rejected by the user); GTM (ad blockers, third party); Durable Objects (more code and state) |
| New workspace `apps/edge` | Different runtime, deploy tool and test pool from the Next apps | Putting Worker code under `infra/` would leave it without type-check, lint and tests |
