# Implementation Plan: Page A/B testing

**Branch**: `008-ab-testing` | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-ab-testing/spec.md`

## Summary

Add whole-page A/B testing: a new `experiments` collection (`apps/cms`)
scoping a test to one control page, an `experimentOf` self-relationship on
`pages` marking a document as a challenger variant, and a promotion flow
that copies a winning variant's `builder`/`form`/`seo` fields onto the
control (never swaps document identity). Bucketing happens in
`apps/web/src/middleware.ts`: a first-party sticky cookie plus a
`NextResponse.rewrite()` to a new id-keyed route
(`apps/web/src/app/ab-variant/[pageId]/page.tsx`, modelled on the existing
preview route's by-id fetch) — never `cookies()`/`headers()`/`searchParams`
inside the rendered page itself, which would force the whole route
dynamic under this project's classic (non-Cache-Components) ISR model
(research.md §1). GrowthBook (self-hosted, MongoDB + reusing the existing
Postgres as its metrics datasource) computes bucket assignment and
significance; `apps/web` fails open to the control whenever it's
unreachable (FR-016). Results surface via one shared component mounted
both as a new tab on the control page's edit view and inside a new
`experiments` admin section (research.md §6). Full technical background
already explored in `docs/ab-testing-exploration.md` and the `growthbook`
skill — this plan applies that material to concrete files and phases.

## Technical Context

**Language/Version**: TypeScript, Node 24. Payload 3.88 + Next 16
(`apps/cms`); Next 16 App Router (`apps/web`), classic ISR model —
`cacheComponents` is not enabled (`apps/web/next.config.ts` has no such
flag), so Partial Prerendering's Suspense-island escape hatch is not
available; a route that reads `cookies()`/`headers()`/`searchParams`
anywhere in its tree is fully dynamic, no partial exception (research.md
§1). This constrains the bucketing mechanism below.

**Primary Dependencies**: GrowthBook self-hosted (new: a Docker image +
MongoDB, per `.claude/skills/growthbook/references/self-hosting.md`) and
its Node SDK in `apps/web` (server-side, local deterministic hashing — no
per-request network call to GrowthBook, per
`.claude/skills/growthbook/references/nextjs-integration.md`). No new npm
dependency in `apps/cms` beyond Payload's existing primitives.

**Storage**: PostgreSQL 16 — one migration adding the `experiments`
collection and `pages.experimentOf` (nullable self-relationship); both
additive, no backfill (expand-only, per constitution Principle III).
GrowthBook's own MongoDB is separate infra, not part of this migration,
and stores only GrowthBook's own config/metadata — Postgres remains the
single store for Trefle's own content (constitution's Architecture
section). GrowthBook is pointed at the same Postgres as a read-only
metrics *datasource* (SELECT-only) for computing exposure/conversion, per
the self-hosting skill reference.

**Testing**: Vitest (`apps/cms`) for `publishGuard`'s new
`experimentOf`-gated branch, the promotion endpoint's content-copy logic,
and the `experiments` collection's one-running-test-per-page constraint
(FR-004). Vitest (`apps/web`) for the bucketing decision function (pure,
deterministic — visitor id + experiment key → variant, independent of
GrowthBook's own SDK internals) and the GrowthBook-unavailable fallback
(FR-016). Playwright e2e (`apps/web/tests/e2e`) for a forced-bucket
end-to-end check (assert the rewritten route serves the right variant,
assert sticky consistency across two requests with the same cookie) and a
crawler-unreachability check for FR-012 (see quickstart.md). Live
verification per quickstart.md, including the cache-multiplication check
(FR-018/SC-008).

**Target Platform**: Same Debian VPS / Docker Compose stack.
`infra/docker-compose.yml` (dev) and `infra/docker-compose.prod.yml` gain
two new services (`growthbook`, `growthbook-mongo`); `infra/.env.example`
documents `GROWTHBOOK_API_HOST`, `GROWTHBOOK_APP_ORIGIN`, and a Personal
Access Token/API key.

**Project Type**: Existing multi-app monorepo; touches `apps/cms`,
`apps/web`, and `infra/`. `packages/shared` is touched only if the
`experiments`/variant shape proves genuinely needed on both sides
(unlikely — see Project Structure).

**Performance Goals**: FR-018/SC-008 — a tested page's loading performance
must not measurably regress versus the same page untested. Met
structurally by keeping every page's normal render path (`[[...slug]]`)
completely untouched for pages with no active test, and by routing a
bucketed request to its own separately-cached ISR entry rather than
disabling caching (research.md §1).

**Constraints**: FR-016 (fail open on GrowthBook unavailability) and
FR-017 (the bucket-consistency cookie is strictly necessary, no
consent-banner gating) are hard requirements verified in Phase 0
(research.md §1, §4) before any schema work starts, not left to
implementation discretion.

**Scale/Scope**: One running test per page at a time (FR-004); three or
more variants per test from v1 (FR-003, spec.md Assumptions — even split
only, no per-variant weight UI yet).

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | One new collection (`experiments`), one new field (`pages.experimentOf`), one new route (`ab-variant/[pageId]`), one middleware extension, one promotion endpoint — no wrapper layer over GrowthBook's SDK or Payload's own primitives. The stats/significance computation is GrowthBook's, not reimplemented. |
| II. Stack-Native | Bucketing reuses Next's own routing/rewrite/ISR primitives (no custom cache layer); GrowthBook's own Node SDK is used directly, no adapter package. GrowthBook itself is the one new *dependency beyond the stack* this feature needs — justified in research.md §5 (no OSS alternative combines self-hostability, a proper stats engine, and a Next.js SDK without a heavier infra footprint; see `docs/ab-testing-exploration.md` §2's tool comparison) and will be named in the implementing commit/PR per Principle II's requirement. |
| III. Small, Reversible | Migration is additive-only (nullable field, new table) with a tested `down` (Phase 1 below). `experiments.status` is the flag required by this principle — every phase up to the first real running test ships to `main` and stays provably inert (`docs/ab-testing-exploration.md` §7). Each phase below is one commit, independently revertible. |
| IV. Working Software Over Ceremony | `publishGuard`'s new branch, the promotion endpoint, the bucketing decision function, and the GrowthBook-fail-open path are exactly the class of logic this principle requires a test for (business logic, a custom hook, cache-invalidation-adjacent code) — each gets one (Technical Context, Testing). |
| V. Quality the User Feels | FR-006 (a bucketed visitor can't tell a test is running) and FR-018/SC-008 (no performance regression) are both constitution-driven, not just spec-driven — this section's own performance-budget and quality bar apply identically to a tested page. |

Gate: **PASS**. One Complexity Tracking entry below for the GrowthBook
dependency, required by Principle II whenever a runtime dependency beyond
the stack is added.

## Project Structure

### Documentation (this feature)

```text
specs/008-ab-testing/
├── plan.md                              # this file
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── quickstart.md                        # Phase 1 output
└── contracts/
    ├── experiments-collection.md        # Phase 1 output
    └── bucketing-and-caching.md         # Phase 1 output
```

### Source Code (repository root)

```text
apps/cms/src/collections/Experiments.ts        # new — experiments collection (data-model.md)
apps/cms/src/collections/Pages.ts              # + experimentOf field; publishGuard exception
apps/cms/src/hooks/pages-publish-guard.ts      # + skip domain/path/URL checks when experimentOf is set
apps/cms/src/hooks/experiments-revalidate.ts   # new — afterChange hook: start/conclude a test invalidates
                                                #   the "active tests" cache tag middleware reads (research.md §2)
apps/cms/src/endpoints/promoteVariant.ts       # new — content-copy promotion endpoint (spec.md FR-010/FR-011)
apps/cms/src/components/PageExperimentsTab.tsx # new — the control page's "Tests A/B" document tab
apps/cms/src/components/ExperimentStats.tsx    # new — shared results component, mounted here and below
apps/cms/src/migrations/<ts>_ab_testing.ts     # new — experiments table + pages.experimentOf column

apps/web/src/middleware.ts                     # + bucket cookie read/set, active-test lookup, rewrite
apps/web/src/lib/ab-testing/bucket.ts           # new — pure deterministic assignment fn (unit-tested)
apps/web/src/lib/ab-testing/active-tests.ts     # new — cached "which paths have a running test" lookup
apps/web/src/lib/ab-testing/growthbook.ts       # new — GrowthBook client wrapper + fail-open (FR-016)
apps/web/src/app/ab-variant/[pageId]/page.tsx        # new — id-keyed render, reuses [[...slug]]'s render pipeline
apps/web/src/app/api/experiments-revalidate/route.ts  # new — webhook target for experiments-revalidate.ts
apps/web/tests/e2e/ab-testing-bucketing.spec.ts # new
apps/web/tests/ab-testing-bucket.test.ts        # new — unit tests for bucket.ts

infra/docker-compose.yml                       # + growthbook, growthbook-mongo (dev stand-ins)
infra/docker-compose.prod.yml                  # + growthbook, growthbook-mongo (prod)
infra/.env.example                             # + GROWTHBOOK_API_HOST, GROWTHBOOK_APP_ORIGIN, GROWTHBOOK_*_KEY
```

**Structure Decision**: No new app. `apps/cms` gains the collection, the
guard exception, the promotion endpoint, and the admin UI; `apps/web`
gains the bucketing/rewrite logic and the id-keyed render route;
`infra/` gains the two new services. `packages/shared` is not touched —
following `007-gtm-tagging`'s precedent, the `experiments`/variant shapes
needed on the renderer side are a small, renderer-owned read type, not
worth a shared-types package for one feature.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| GrowthBook: a runtime dependency beyond the stack (Principle II) | The stack has no experimentation/stats engine of its own; hand-rolling bucket assignment is simple, but a trustworthy significance calculation (Bayesian/frequentist) is not something to reimplement for a one-person project | Building a bespoke stats layer in `apps/cms` — rejected, real statistical rigor is exactly the kind of thing Principle I says not to build when a proven, self-hostable, MIT-licensed tool already does it (`docs/ab-testing-exploration.md` §2's comparison); a lighter Postgres-native alternative (Flagsmith) was evaluated and rejected there for weaker experimentation support |

## Phasing

Each phase = one commit, independently revertible per constitution
Principle III.

### Phase 1 — Schema: `experiments` collection + `pages.experimentOf`

- `apps/cms/src/collections/Experiments.ts`: new collection per
  data-model.md (`controlPage`, `growthbookExperimentKey`, `status`,
  `startedAt`/`endedAt`, `winner`), access `isAdminOrEditor` (FR-015).
- `apps/cms/src/collections/Pages.ts`: add `experimentOf` (self-relation,
  optional, admin-hidden `domain`/`path` when set).
- `apps/cms/src/hooks/pages-publish-guard.ts`: skip the domain/path/URL
  checks when `experimentOf` is set (docs/ab-testing-exploration.md §5.1).
- Migration: additive-only, tested `down` (constitution Principle III).
- Unit tests: `publishGuard`'s new branch; one-running-test-per-page
  constraint (FR-004) on the `experiments` collection.

Verify: quickstart.md §1.

### Phase 2 — Infra: self-hosted GrowthBook

- `infra/docker-compose.yml` / `docker-compose.prod.yml`: add
  `growthbook` + `growthbook-mongo`, not yet referenced by any app code —
  this phase is inert by construction (nothing calls it yet), matching the
  "ships to main, stays provably inert" requirement.
- `infra/.env.example`: document the new keys.
- Point GrowthBook's own datasource config at the existing Postgres
  (read-only), per the self-hosting skill reference.

Verify: `docker compose up` brings the full stack (including the two new
services) to a healthy state — constitution Principle III's own gate.

### Phase 3 — Renderer plumbing: bucketing, id-keyed route, fail-open

- `apps/web/src/lib/ab-testing/bucket.ts`: pure deterministic-hash
  assignment function, unit-tested independent of GrowthBook's SDK.
- `apps/web/src/lib/ab-testing/growthbook.ts`: thin client wrapper; every
  call site catches unavailability and returns "serve control" (FR-016) —
  same shape as `PayloadUnavailableError` handling in
  `apps/web/src/lib/payload-client/index.ts`.
- `apps/web/src/lib/ab-testing/active-tests.ts`: cached lookup of which
  (domain, path) currently has a running test, refreshed by the
  revalidation webhook from Phase 4 — never a live Payload call per
  request (research.md §2 flags the exact cache mechanism to confirm
  during implementation).
- `apps/web/src/app/ab-variant/[pageId]/page.tsx`: new route, fetches by id
  (modelled on `(preview)/preview/[pageId]/page.tsx`'s by-id fetch,
  reusing `PageShell`/`splitAroundForm`/`sanitizeHtml`), reads only
  `params.pageId` — never `cookies()`/`headers()`/`searchParams` — so it
  is ordinarily ISR-cacheable per distinct id (research.md §1).
- Not wired into `middleware.ts` yet — buildable/testable in isolation
  (direct navigation to `ab-variant/<id>` already works before any bucketing
  exists).

Verify: unit tests for `bucket.ts` and the fail-open wrapper; direct
navigation to a known page id under `ab-variant/`.

### Phase 4 — Wire bucketing into `middleware.ts` + the revalidation webhook

- `apps/web/src/middleware.ts`: for a request whose path has a running
  test (per `active-tests.ts`), read or set the sticky bucket cookie
  (FR-005/FR-017 — strictly necessary, no consent gate), compute the
  variant via `bucket.ts`, and `NextResponse.rewrite()` to
  `ab-variant/<variantPageId>` — the visible URL never changes (FR-006).
- `apps/cms/src/hooks/experiments-revalidate.ts` +
  `apps/web/src/app/api/experiments-revalidate/route.ts`: starting or
  concluding a test invalidates the cache tag `active-tests.ts` reads —
  same shape as `pages-revalidate.ts`/`pageRevalidate`.

Verify: quickstart.md §2–§4 (bucketing, stickiness, cache-entry count).

### Phase 5 — Promotion + admin surface (User Stories 2–4)

- `apps/cms/src/endpoints/promoteVariant.ts`: content-copy onto the
  control (spec.md FR-010/FR-011; docs/ab-testing-exploration.md §5.2),
  archives non-promoted variants, concludes the experiment.
- `apps/cms/src/components/ExperimentStats.tsx`: one component querying
  GrowthBook, mounted from both surfaces below (docs/ab-testing-exploration.md
  §5.5).
- `apps/cms/src/components/PageExperimentsTab.tsx`: the control page's
  document tab (`admin.components.views`, `tab: {...}` — Payload's
  `DocumentTabConfig`, same mechanism the existing `wizard` view uses).
- `Experiments` collection's own admin list/edit view (free from the
  collection existing, per FR-008/User Story 4) — mounts
  `ExperimentStats` too.

Verify: quickstart.md §5–§7 (results visible, promotion takes effect,
non-promoted variant retained, site-wide list).

### Phase 6 — Verification pass

- `apps/cms` and `apps/web` full suites + typecheck + lint.
- Playwright e2e: `ab-testing-bucketing.spec.ts` (forced-bucket stickiness,
  no-URL-tell FR-006, GrowthBook-down fallback FR-016).
- Live: quickstart.md end to end, including the cache-entry-count check
  (FR-018/SC-008) and a search/direct-access attempt on a challenger
  variant (FR-012/SC-006).

## Risks

| Risk | Mitigation |
|---|---|
| The bucketing rewrite accidentally reads `cookies()`/`headers()`/`searchParams` inside the shared page-render tree, silently making every page (not just tested ones) fully dynamic | The id-keyed route (`ab-variant/[pageId]`) reads only `params.pageId`; the bucket cookie is read exclusively in `middleware.ts`, which runs before Next's route-cache decision and never itself disables it (research.md §1) — enforced by a Playwright check asserting an *untested* page still serves from cache after this feature ships. |
| `active-tests.ts`'s lookup inside middleware becomes a live per-request Payload call, reintroducing the exact cost this design avoids | Refreshed only via the `experiments-revalidate` webhook (Phase 4), same cache-tag pattern as `pageRevalidate`; the precise caching primitive available inside middleware's runtime is confirmed during Phase 3/4 implementation, not assumed (research.md §2). |
| GrowthBook (MongoDB) becomes unreachable independent of `apps/web`'s own deploy state (e.g. a partial rollback) | FR-016's fail-open wrapper (`ab-testing/growthbook.ts`) is unit-tested in isolation in Phase 3, before Phase 4 wires it into a live request path — a GrowthBook outage degrades to "every visitor sees the control," never a broken page. |
| A future edit adds a second qualifying test to a page that already has one running, bypassing FR-004 | Enforced at the `experiments` collection's own `beforeChange` (rejects creating/starting a second running test for a `controlPage` that already has one) — a collection-level hook, not left to the admin UI alone to prevent. |
| The `experimentOf` exception in `publishGuard` accidentally weakens the (domain, path) uniqueness check for *ordinary* pages | The exception is scoped strictly to documents with `experimentOf` set; a unit test asserts two ordinary pages still collide on (domain, path) exactly as before this feature (regression coverage on the existing guard, not just the new branch). |
