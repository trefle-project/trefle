---

description: "Task list for Page A/B testing"
---

# Tasks: Page A/B testing

**Input**: Design documents from `/specs/008-ab-testing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — the constitution requires an automated test for
custom Payload hooks/endpoints and business/domain logic (Principle IV),
and plan.md's Technical Context already commits to Vitest units (the
bucketing function, the GrowthBook fail-open wrapper, `publishGuard`'s new
branch, the promotion/conclude endpoints, the one-running-test-per-page
guard) plus Playwright e2e for the bucketing/stickiness flow, matching
004–007's precedent.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003–007's established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

## Phase 2: Foundational — schema, infra, and the bucketing pipeline

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every story depends on the `experiments`/`experimentOf` schema, and User Story 1's own acceptance criteria (a started test actually splits visitor traffic) require the full bucketing pipeline to exist.

### Schema

- [X] T002 [P] Create `apps/cms/src/collections/Experiments.ts` per data-model.md: `name` (text, required), `controlPage` (relationship → `pages`, required), `growthbookExperimentKey` (text), `status` (select: `draft`|`running`|`concluded`, default `draft`), `startedAt`/`endedAt` (date), `winner` (relationship → `pages`, optional); access `create`/`read`/`update`/`delete: isAdminOrEditor` (FR-015); register it in `apps/cms/src/payload.config.ts`'s `collections` list — *(no separate `experimentStatus` field on losing variants: "lost" is derived by joining `pages.experimentOf` against a `concluded` experiment whose `winner` differs, per Principle I — noted in the collection's own header comment)*
- [X] T003 [P] In `apps/cms/src/collections/Pages.ts`, add `experimentOf` (relationship → `pages`, self, optional); `admin.condition` hides the `domain`/`path` fields when it is set (data-model.md) — *(`experimentOf` itself is `admin.condition: () => false` — always hidden, set only by the future `createTestVariant` endpoint, never edited by a human)*
- [X] T004 In `apps/cms/src/hooks/pages-publish-guard.ts`, skip the "domain required"/"path required"/(domain,path)-uniqueness checks when `data?.experimentOf ?? originalDoc?.experimentOf` is set (docs/ab-testing-exploration.md §5.1) — depends on T003
- [X] T005 [P] Create `apps/cms/src/hooks/experiments-one-running-guard.ts` exporting a `beforeChange` hook that rejects creating or transitioning an `experiments` document to `status: running` when another `experiments` document with the same `controlPage` already has `status: running` (FR-004); register it on `Experiments.ts`'s `hooks.beforeChange` — depends on T002
- [X] T006 [P] Create `apps/cms/tests/experiments-one-running-guard.test.ts`: starting a test on a control with no other running test succeeds; starting a second while one is already `running` is rejected; starting one on a *different* control succeeds regardless — depends on T005 — *(5 tests, all passing)*
- [X] T007 [P] ~~Create `apps/cms/tests/pages-publish-guard-experiments.test.ts`~~ — *(deviation: added the same cases to the existing `apps/cms/tests/pages-publish-guard.test.ts` instead of a new file — that file already comprehensively covers this one hook, and this codebase doesn't fragment one hook's tests across files per feature increment)*: a page with `experimentOf` set publishes with no `domain`/`path`; an ordinary page still requires one; two ordinary pages still collide on (domain, path) exactly as before this feature (regression coverage, plan.md Risks) — depends on T004 — *(17 tests in the file, all passing)*
- [X] T008 Run `payload generate:types` in `apps/cms` to regenerate `apps/cms/src/payload-types.ts` — depends on T002, T003 — *(had to run on the host with `apps/cms/.env.local` sourced, not inside the running `cms` container — the container runs the built image, not a bind-mounted source tree, same issue `007-gtm-tagging`'s tasks.md already hit for `seed:dev`)*
- [X] T009 Run `payload migrate:create` in `apps/cms`; confirm the generated migration only adds the `experiments` table and a nullable `pages.experiment_of` column, with a working tested `down` (constitution Principle III) — depends on T008 — *(`20260916_165339_ab_testing.ts` — purely additive, `down` cleanly drops the table/column/enum, no hand-editing needed)*
- [X] T010 Apply the migration locally (`payload migrate`); via REST confirm every pre-existing page has `experimentOf: null` and `GET /api/experiments` returns zero documents — no other field changed — depends on T009 — *(verified via direct SQL instead of REST: 69 pre-existing pages, all with `experiment_of_id IS NULL`; `experiments` table has 0 rows)*

### Infra: self-hosted GrowthBook

- [X] T011 [P] Add `growthbook` + `growthbook-mongo` services to `infra/docker-compose.yml` (dev stand-ins), per `.claude/skills/growthbook/references/self-hosting.md` — not yet referenced by any app code — *(pinned `growthbook/growthbook:5.0.1` — a security-patch release, not `:latest` — and `mongo:7`; published on `growthbook.trefle.localhost:3100`/`:3101` (app/API), matching the existing `*.localhost` dev convention)*
- [X] T012 [P] Add `growthbook` + `growthbook-mongo` services to `infra/docker-compose.prod.yml` — *(no host-published ports, matching db/cms/web/imgproxy; also added `GROWTHBOOK_HOSTNAME`/`GROWTHBOOK_API_HOSTNAME` Caddy vhosts to `infra/deploy/Caddyfile`, `ADMIN_ALLOWED_IPS`-gated like `CMS_HOSTNAME` — GrowthBook's admin UI is equally sensitive)*
- [X] T013 [P] Document `GROWTHBOOK_API_HOST`, `GROWTHBOOK_APP_ORIGIN`, and a Personal Access Token/API key in `infra/.env.example` — *(documented as `GROWTHBOOK_APP_ORIGIN`/`GROWTHBOOK_API_HOST_PUBLIC` — GrowthBook's own browser-facing URLs; the internal `GROWTHBOOK_API_HOST` + PAT that `apps/cms`/`apps/web` will consume server-side is left for T018, not yet wired to anything)*
- [X] T014 Point GrowthBook's own datasource configuration at the existing Postgres instance (read-only), per the self-hosting skill reference — depends on T011–T013 — *(this is a one-time manual step inside GrowthBook's own admin UI, not expressible as compose/env config — documented as a new "Step 5" in `infra/deploy/README.md`, including creating a read-only Postgres role and explicitly flagging the deferred `growthbook-mongo-data` offsite backup)*
- [X] T015 Confirm `docker compose up` brings the full stack — including the two new services — to a healthy state with zero `experiments` rows anywhere (constitution Principle III's "ships inert" gate; quickstart.md §1) — depends on T010, T014 — *(all 8 services healthy; found and fixed a real bug along the way — the healthcheck's `/api/status` requires auth (400 unauthenticated), `/healthcheck` is the real unauthenticated liveness endpoint, verified live against both before fixing)*

### Renderer plumbing: bucketing pipeline

- [X] T016 [P] Create `apps/web/src/lib/ab-testing/bucket.ts` exporting a pure function `assignVariant(visitorId: string, experimentKey: string, variantIds: string[]): string`, implementing the deterministic hash GrowthBook's own SDKs document (research.md §3) — *(FNV-1a over `${experimentKey}:${visitorId}`, normalised to [0,1) and partitioned)*
- [X] T017 [P] Create `apps/web/tests/ab-testing-bucket.test.ts`: the same `(visitorId, experimentKey, variantIds)` always returns the same variant; a large sample partitions roughly evenly across variants; changing `experimentKey` alone (same visitor) can change the result — depends on T016 — *(5 tests, all passing)*
- [X] T018 [P] ~~Create `apps/web/src/lib/ab-testing/growthbook.ts`~~ — *(deviation, real architectural finding: `apps/web`'s bucketing hot path never needs to call GrowthBook's HTTP API at all. `getRunningTestFor` (T020) sources "is a test running, what are its variants" entirely from Payload; visit/conversion tracking reuses the *existing* `pingPageView`/lead-intake → `page-stats` mechanism per-page-id for free, since each variant is a full, independently-tracked `pages` document (Option A's whole-page design) — this is the warehouse-native model docs/ab-testing-exploration.md §2 already committed to: GrowthBook computes stats by querying Postgres directly, `apps/web` never pushes events to it. A real GrowthBook HTTP client is still needed later, but in `apps/cms` (T027's `startTest`, T031's `ExperimentStats`), not here.)*
- [X] T019 [P] ~~Create `apps/web/tests/ab-testing-growthbook-fallback.test.ts`~~ — *(not needed per T018's deviation — there is no GrowthBook call on this path to fail open on; FR-016's fail-open guarantee for the hot path is `getRunningTestFor`'s own try/catch, already covered by T020's tests below)*
- [X] T020 [P] Create `getRunningTestFor` in `apps/web/src/lib/payload-client/index.ts` (not a separate `ab-testing/active-tests.ts` — every other Payload query already lives in this one module, per Principle I) exporting `getRunningTestFor(domainId, path): Promise<{ experimentKey: string; variantIds: string[] } | null>`, backed by two tagged fetches (`"ab-tests"`, `` `ab-test:${controlId}` ``, research.md §2); catches everything internally and resolves `null` on any failure (FR-016) — *(also added `getPublishedPageById` in the same module, for T023)*. Test file: `apps/web/tests/ab-testing-active-tests.test.ts` (5 tests) — *(caught a real bug during live verification: Postgres ids come back as numbers, not strings; an un-normalised comparison against the string-valued bucket cookie silently broke stickiness — fixed by normalising every id to a string at the source, with a regression test asserting it)*
- [X] T021 [P] Create `apps/cms/src/hooks/experiments-revalidate.ts` (an `afterChange` hook on `Experiments.ts`) calling the renderer's revalidation endpoint with the `"ab-tests"` tag whenever `status` transitions to or from `running` — same shape as `pages-revalidate.ts`; register it on `Experiments.ts`'s `hooks.afterChange` — depends on T002 — *(also adds `"experiment-changed"` to the shared `revalidateSchema` reason enum in `packages/shared/src/index.ts` and the local `Reason` type in `apps/cms/src/hooks/revalidate.ts` — a one-line extension of the existing enum, not a new mechanism)*
- [X] T022 [P] ~~Create `apps/web/src/app/api/experiments-revalidate/route.ts`~~ — *(not needed: `apps/web/src/app/api/revalidate/route.ts` already accepts arbitrary tags via the shared `revalidateSchema` — T021's hook calls the existing endpoint with the new `"ab-tests"` tag instead of adding a second, redundant one, matching how `007-gtm-tagging`'s own T009 extended this same enum for `"settings-changed"` rather than building a parallel endpoint)*
- [X] T023 [P] Create `apps/web/src/app/ab-variant/[pageId]/page.tsx`: fetches the given published page id directly (modelled on `(preview)/preview/[pageId]/page.tsx`'s by-id fetch, but for an already-published variant, no signed-token flow), renders through the existing `PageShell`/`splitAroundForm`/`sanitizeHtml` pipeline; reads only `params.pageId` — never `cookies()`/`headers()`/`searchParams` (research.md §1); ordinary ISR (`export const revalidate`, `dynamicParams = true`) — *(deviation, load-bearing: the route folder was first named `__ab` — Next.js treats **any** segment prefixed with `_`, including a double underscore, as a private folder excluded from routing entirely. Confirmed live via the build's own route list (absent), renamed to `ab-variant`, confirmed present. All references updated across code, tests, and the plan/research/contracts/quickstart docs.)*
- [X] T024 In `apps/web/src/middleware.ts`, extend the existing per-request logic: call `getRunningTestFor` (T020) for the resolved domain/path; when a running test exists, read or set the sticky bucket cookie (FR-005/FR-017, keyed by `experimentKey` rather than control page id so a new test never inherits a stale cookie — strictly necessary, no consent gate), compute the variant via `assignVariant` (T016), and `NextResponse.rewrite()` to `/ab-variant/<variantPageId>` (never `redirect()` — FR-006); any error resolving the test or bucket falls through unchanged (FR-016) — depends on T016, T020, T023 — *(two real bugs found and fixed only by testing against the live stack, not visible from code review or unit tests: (1) `Experiments.ts`'s `read` access was `isAdminOrEditor`, silently 403-ing the renderer's own `isService` account — the exact class of bug `007-gtm-tagging` already hit once on `settings`, fixed to `isStaffOrService`, same shape as `Domains.ts`. (2) deleting the `x-middleware-rewrite` response header to close an FR-006 header leak broke the rewrite mechanism outright — 200 status, correct cookies, every other header correct, but a permanently empty body, the rewritten route's render never invoked. That header is not cosmetic in this Next.js version; reverted, documented as an accepted residual gap in the middleware's own comment and contracts/bucketing-and-caching.md instead of silently "fixed" in a way that broke the feature.)*
- [X] T025 [P] Create `apps/web/tests/e2e/ab-testing-bucketing.spec.ts` (Playwright): a fresh profile visiting a page with a running test is assigned a variant and keeps seeing it on repeat visits (FR-005/SC-005); the address bar and page content never reveal `ab-variant/` (FR-006 — see T024's note on the one response header that's an accepted exception, not asserted absent here); a page with **no** running test loads unaffected — depends on T024 — *(3/3 passing against the live stack; the distribution test uses a bare `APIRequestContext` per simulated visitor rather than `browser.newContext()` — proved more reliable for a tight-loop HTTP-behavior check than real browser-context churn)*

**Checkpoint**: The full bucketing pipeline works end-to-end against a real, manually-created `experiments` row, verified live end-to-end (split, stickiness, no-URL-tell, cache-entry-count, GrowthBook-independence) — not just unit-tested in isolation. Test fixtures created for this verification were cleaned up afterward (`experiments`/`pages.experimentOf` both back to zero rows). Admin UI does not exist yet (Phase 3+).

---

## Phase 3: User Story 1 - An operator creates and runs a multi-variant test (Priority: P1) 🎯 MVP

**Goal**: An operator creates one or more challenger variants of a published page and starts a test; from that moment the page's public URL splits visitors across the original and every variant, per Foundational's bucketing pipeline.

**Independent Test**: From a published page, create two challenger variants, start the test, load the page's URL from several distinct visitor sessions, and confirm different sessions land on different variants while a single session sees the same one on repeat visits.

### Implementation for User Story 1

- [X] T026 [US1] Create `apps/cms/src/endpoints/createTestVariant.ts`: given a source page id, creates a new `pages` document copying `builder`/`form`/`seo`, sets `experimentOf` to the source id, leaves `domain`/`path` unset — repeatable, so a second call on the same source adds a third variant (FR-003); register it in `Pages.ts`'s `endpoints` list (same pattern as `pageConflictCheckEndpoint`) — depends on T003, T004 — *(deviation: rejects a non-published source and a source that is itself a variant, both not in the original task text but necessary — a draft source has nothing meaningful to test against, and a variant-of-a-variant would break the flat `experimentOf` model. New variants start `draft`, not published — an operator edits then publishes them through the ordinary page flow, `startTest` is what actually requires them published. Real bug found and fixed live: `form.fields`' own Payload row ids (and each field's nested `options` row ids) were copied verbatim from the source and collided with the Postgres adapter at create time — "Value must be unique, path: id, tableName: pages" on the very first variant ever created. Fixed with a recursive array-row-id strip, regression-tested.)*
- [X] T027 [US1] Create `apps/cms/src/endpoints/startTest.ts`: given a `controlPage` id, creates an `experiments` document at `status: running`, sets `startedAt` — depends on T005, T026 — *(deviation: `growthbookExperimentKey` is generated locally (`page-<controlId>-<timestamp>`), not registered with GrowthBook via an API call — per T018's Foundational-phase finding, the bucketing hot path never calls GrowthBook at all; a real GrowthBook registration call belongs to `ExperimentStats` (a later phase), not here. Rejects an unpublished control, zero published variants, or an already-running experiment for this control (FR-004) — the last one is a defensive, friendlier-error check ahead of T005's collection-level guard, which still fires either way.)*
- [X] T028 [P] [US1] Create `apps/cms/tests/create-test-variant.test.ts`: creating a variant copies `builder`/`form`/`seo`, sets `experimentOf`, never sets `domain`/`path`; a second invocation on the same source produces a third, independent variant (FR-003) — depends on T026 — *(7 tests, including the array-row-id regression)*
- [X] T029 [P] [US1] Create `apps/cms/tests/start-test.test.ts`: starting with ≥1 published variant transitions `status` to `running` and sets `startedAt`; starting with zero published variants is rejected; starting a second test on an already-`running` control is rejected (FR-004) — depends on T027 — *(7 tests)*
- [X] T030 [US1] Manual verification per quickstart.md §2 on the local stack: create two challenger variants (a 3-way test with the original), start it, confirm visitors are split across all three with stable per-visitor assignment (spec.md User Story 1, Scenarios 1–3) — depends on T025 (Foundational bucketing), T027 — *(verified live end to end through the real endpoints, not a manual workaround: create ×2 → reject-too-early (variants still draft) → publish both → start → reject-second-start (FR-004) → 9 real visitors correctly split across all three arms (A/B/C) with stable per-visitor cookies. Fixtures cleaned up afterward.)*
- [X] T030b [US1] Post-hoc addition, not in the original task breakdown — found live (2026-09-17, reported by a real user on page 11): `createTestVariantEndpoint`/`startTestEndpoint` (T026/T027) had never been wired to an actual admin UI control, only ever driven directly over HTTP throughout T028-T030's own verification and this whole feature's testing. The "Tests A/B" tab's own empty-state message even pointed at a "Créer une variante de test" trigger "depuis l'onglet Édition" that didn't exist anywhere. Fixed by adding `apps/cms/src/components/VariantActions.client.tsx` (same hand-written `fetch` + `window.confirm`/`window.prompt` style as `PromoteActions.client.tsx`, US3) and mounting it in `PageExperimentsTab.tsx`: "Créer une variante de test" always available, "Démarrer le test" shown once at least one published variant exists and no test is already running. Verified live via Playwright on page 11 itself, clicking through both real buttons end to end (create → publish the variant via the ordinary page flow → start, with the prompted name and confirm dialog both exercised) — the running test, its stats table, and the Promote/Conclude buttons all appeared correctly afterward. Fixtures cleaned up, page 11 back to its original inert state.
- [X] T030c [US1] Post-hoc addition — the *actual* root cause behind the same user report above (T030b only fixed a downstream symptom): the "Tests A/B" tab itself was unreachable by clicking it at all, only by a direct URL. `Pages.ts`'s `tab: { label: "Tests A/B" }` never set `tab.href` — a field distinct from the view's own `path` — so Payload defaulted the tab's link target to an empty string, which resolves to the *same* URL as the "Edit" tab. That made both tabs register as active on the plain edit view simultaneously, and Payload renders an active tab as a disabled, non-navigable `<div>` (`@payloadcms/next`'s `DocumentTabLink`: `disabled: isActive`) — so "Tests A/B" could never actually be clicked into, full stop. Every one of this feature's own manual-verification passes across every prior phase used `page.goto(".../experiments")` directly, bypassing the tab link entirely, so this was never caught until a real user tried clicking it. Fixed with `tab: { label: "Tests A/B", href: "/experiments" }` (mirroring `path`, the same way Payload's own built-in "API" tab uses `/api` for both). Verified live in both directions: from the Edit view, "Tests A/B" now renders as a real `<a href=".../experiments">` and clicking it navigates correctly; from the Tests A/B view, "Edit" and "API" are real links and only "Tests A/B" itself shows as the (correctly) disabled current tab.
- [X] T030d [US1] Post-hoc addition — same user report's next step, once T030b/T030c let them actually create variants: nothing led to editing one. A variant carries no `domain`/`path` of its own to find it by, and `PageExperimentsTab.tsx`'s "Variantes" list rendered each title as plain text, not a link. Fixed by wrapping each variant's title in an `<a href="/admin/collections/pages/<id>">`, matching the precedent `ExperimentsRunningBanner.tsx` (US4) already set for linking straight to a document by id. Verified live using the user's own two real variants (pages 326/327, both still `draft` from their own testing): clicking "manual (variant)" from the Tests A/B tab opens that variant's own edit view with the GrapesJS Builder loaded and editable, `domain`/`path` correctly hidden (per the existing `experimentOf`-based `admin.condition`) — no fixtures created or altered, view-only navigation against the user's own real data.

**Checkpoint**: The MVP loop — create variants, run a real split test — is fully live and independently verifiable, from the real admin UI as well as the API. Verified live, not just unit-tested.

---

## Phase 4: User Story 2 - An operator reviews live results from the page itself (Priority: P1)

**Goal**: While a test runs, an operator opens the page being tested and sees per-variant visit/conversion counts without navigating elsewhere.

**Independent Test**: With a test running and some visitor activity recorded, open the page being tested and confirm per-variant visit and conversion figures are visible without leaving that page.

### Implementation for User Story 2

- [X] T031 [US2] Create `apps/cms/src/components/ExperimentStats.tsx`: a server component, parameterised by `growthbookExperimentKey`, querying GrowthBook for per-variant visit/conversion counts (aggregate only, never per-visitor — FR-009), with an explicit all-zero state for a test with no activity yet (spec.md User Story 2, Scenario 2) — depends on T018 — *(deviation, consistent with T018's Foundational finding: reads Payload's own `page-stats` collection directly instead of GrowthBook — each variant is a full, independently page-stats-tracked page, so FR-007 is already fully answerable with no GrowthBook call. Real bug found live: `page-stats.date` is day-only (midnight UTC) while `experiments.startedAt` is a precise timestamp — comparing them directly silently excluded an entire test's first day whenever it started after midnight (a test started 05:51 UTC hid that day's own activity, tab showed zero despite real recorded visits). Fixed by truncating `since` to the start of its calendar day; regression-tested (`startOfDay`, 3 tests). The JSX-rendering half of the component is untested per the constitution's presentational-component exemption — `apps/cms` has no JSX/React-rendering Vitest setup at all, unlike `apps/web`'s, and adding one for a single component was judged disproportionate; verified live instead, screenshotted, against real page-stats data.)*
- [X] T032 [US2] Create `apps/cms/src/components/PageExperimentsTab.tsx`: a document-tab view listing the control page's variants (queried by `experimentOf`, per data-model.md) with their status, and mounting `ExperimentStats` (T031) — depends on T031
- [X] T033 [US2] Register `PageExperimentsTab` under `Pages.ts`'s `admin.components.views`, with a `tab: { label: "Tests A/B" }` entry — the same `DocumentTabConfig` mechanism the existing `wizard` view already uses (research.md §6) — depends on T032 — *(deviation, load-bearing, found only by typechecking against the installed Payload 3.88 types: `tab` support lives on `views.edit.<key>` (`EditConfig`'s own per-key entries), not on the generic view registry `wizard` uses at `views.<key>` directly (`AdminViewConfig`, no `tab` field at all) — moved accordingly. A second finding from live inspection (a temporary debug log, then removed): the component receives `doc` (the current, already-resolved document), not a top-level `id` as `ServerProps`'s type declares — `doc.id` is what's actually reliable at runtime for this slot, and `doc` conveniently removes the need for a separate control-page lookup too.)*
- [X] T034 [US2] Manual verification per quickstart.md §5 on the local stack: with recorded visitor activity, the "Tests A/B" tab shows per-variant visit/conversion counts without leaving the page; a fresh test shows every variant at zero rather than an error; no individual visitor is identifiable anywhere in the view — depends on T033 — *(verified live via Playwright + screenshots, logged in as the seeded admin: tab renders with correct label; zero-activity state confirmed before any visits; created a real variant + running test, generated real visits through the bucketing pipeline, confirmed the tab's counts update correctly and exclude the prior day's unrelated activity. Fixtures cleaned up afterward.)*

**Checkpoint**: An operator can now both run (US1) and observe (US2) a test — the create → measure loop is complete. Verified live, not just unit-tested.

---

## Phase 5: User Story 3 - An operator promotes a winner, or concludes without one (Priority: P1)

**Goal**: An operator concludes a running test either by promoting a variant (its content becomes the control's) or by ending the test with the original unchanged — either way the non-promoted variant(s) are retained.

**Independent Test**: With a running test and visible results, promote a challenger variant and confirm the page's public URL now serves that content to every subsequent visitor, the test is marked concluded, and the non-promoted variant is still viewable. Separately, end another test without promoting anything and confirm the original keeps serving unchanged.

### Implementation for User Story 3

- [X] T035 [US3] Create `apps/cms/src/endpoints/promoteVariant.ts`: given an `experiments` id and a chosen variant page id, copies that variant's `builder`/`form`/`seo` onto the control document — same id, `domain`, `path`, and attached leads (FR-011) — saves the control (triggering its existing `afterChange` hooks, including `pageRevalidate`), sets `experiments.winner` and `status: concluded`, and marks the non-promoted variant(s) with an `experimentStatus: "lost"`-style field rather than deleting them (docs/ab-testing-exploration.md §5.2) — depends on T002, T003 *(deviation: no `experimentStatus` field added — per Principle I, "lost" is derived by joining a variant's `experimentOf` against a `concluded` experiment whose `winner` points elsewhere, avoiding a field that only restates data already present via the relationship; see the collection-header comment in `Experiments.ts`. Also reuses `stripArrayRowIds()` — same fix as T017/`createTestVariant.ts` — since the copied `form` carries the winner's own row ids, which would otherwise collide on save.)*
- [X] T036 [US3] Create `apps/cms/src/endpoints/concludeTestWithoutPromoting.ts`: given an `experiments` id, sets `status: concluded` with no `winner`, leaves the control's own fields untouched — depends on T002
- [X] T037 [P] [US3] Create `apps/cms/tests/promote-variant.test.ts`: promoting copies `builder`/`form`/`seo` onto the control without changing its id, `domain`, `path`, or its leads relationship; the control's own `afterChange` hooks still fire; the non-promoted variant remains readable after conclusion (FR-011) — depends on T035
- [X] T038 [P] [US3] Create `apps/cms/tests/conclude-without-promoting.test.ts`: concluding without a winner leaves the control's `builder`/`form`/`seo` byte-for-byte unchanged and sets `status: concluded` with no `winner` — depends on T036
- [X] T039 [US3] Add "Promote" and "End without promoting" actions to `PageExperimentsTab.tsx` (T032), calling T035/T036 respectively — depends on T032, T035, T036 *(deviation: implemented as a new client component, `PromoteActions.client.tsx`, mounted from the server-component tab rather than inlined — `PageExperimentsTab.tsx` has no client-side state/interactivity otherwise, so this keeps the boundary at exactly the two buttons that need it, per Principle I. Each action is gated by `window.confirm()`, matching this codebase's existing hand-written client-component style.)*
- [X] T040 [US3] Manual verification per quickstart.md §7 on the local stack: promoting a variant changes what every new visitor sees at the same URL, on the same on-demand-revalidation timescale an ordinary published-page edit already takes effect; existing leads and any `confirmationPage` reference pointing at the page are unaffected; the non-promoted variant is still viewable; a separately-run test concluded without promoting leaves the original unchanged — depends on T039 *(verified live end-to-end via Playwright against the real admin UI, not just curl: created a real variant + experiment, confirmed the control's public render served the original content pre-promotion, clicked "Promouvoir" through the actual dropdown/button/confirm-dialog flow, and confirmed both the DB and the public URL (`curl` on the storefront) now served the promoted content with the control's `id`/`domain`/`path`/`status` unchanged — no extra revalidation code was needed, the existing `pageRevalidate` `afterChange` hook already covers it. Separately created a second variant + experiment and clicked "Conclure sans promouvoir" live: confirm-dialog text matched, the tab correctly returned to "Aucun test en cours" with "Historique … (aucune variante promue)", the control was untouched, and the non-promoted variant stayed published and independently readable. All test fixtures (pages 219/220, experiments 19/20) deleted afterward and the control's content restored to its pre-test value.)*

**Checkpoint**: The full create → observe → conclude loop (User Stories 1–3) delivers the complete single-page testing capability end to end.

---

## Phase 6: User Story 4 - An operator sees every running test in one place (Priority: P2)

**Goal**: A dedicated admin area lists every currently running test across every page, each with the same per-variant results available from the individual page.

**Independent Test**: With two tests running on two different pages, open the dedicated area and confirm both appear with current per-variant results, without opening either page individually.

### Implementation for User Story 4

- [X] T041 [US4] Set `admin.group` on `apps/cms/src/collections/Experiments.ts` (e.g. alongside `Pages`'s "Content" group) so it gets its own sidebar navigation entry and list view — free from the collection existing (research.md §6) — depends on T002 *(deviation: no code change needed — `admin.group: "Content"` was already set when `Experiments.ts` was created in the Foundational phase, so the collection already had its own sidebar nav entry/list view; this task's only remaining work was the live confirmation folded into T044.)*
- [X] T042 [US4] Mount `ExperimentStats` (T031) on the `experiments` collection's own edit view, so opening any experiment from this section shows the same results as its page's "Tests A/B" tab — depends on T031, T041 *(implemented as a new `ui` field, `resultsPanel`, rendering `ExperimentResultsPanel.tsx` — the lightest native Payload slot for a read-only server-rendered panel on a collection's default edit view, no new admin infrastructure. Unlike `PageExperimentsTab.tsx`'s custom-view `doc` prop, a `ui` field's server component's `data` prop was reliably populated with the experiment's own fields on first read, no live-prop-inspection workaround needed this time.)*
- [X] T043 [US4] Add a default/admin list filter (or a dedicated view) on `Experiments.ts` distinguishing `status: running` tests from concluded ones, so the section clearly shows "nothing running" rather than appearing broken or empty by omission (spec.md User Story 4, Scenario 2) — depends on T041 *(deviation: implemented as `ExperimentsRunningBanner.tsx` mounted via `admin.components.beforeList` — a native Payload slot rendered above the collection's own list table — rather than an actual list filter, so concluded experiments stay visible and reachable in the unfiltered table beneath (spec.md User Story 4 Scenario 3) while the banner alone answers "what's running right now" with an explicit count and links, including the zero-running case.)*
- [X] T044 [US4] Manual verification per quickstart.md §6 on the local stack: with two tests running on two different pages, both appear in the `experiments` section with their own per-variant results, without opening either page individually; concluding one removes it from the running view while its record remains reachable — depends on T042, T043 *(verified live via Playwright against the real admin UI: started two real experiments on two different control pages (180, 212), confirmed the running banner showed "Tests actuellement en cours : 2" listing both by name/link, and that opening one experiment's own edit view directly (not its page) rendered its per-variant results table (T042). Concluded one via the real API; re-checked the list — the banner correctly dropped to "Tests actuellement en cours : 1" showing only the still-running one, while the collection's own (unfiltered) list table below continued to show both rows, the concluded one correctly labelled "Concluded" and still openable. All fixtures (pages 221/222, experiments 21/22) deleted afterward.)*

**Checkpoint**: All four user stories are independently functional — an operator overseeing several campaigns has a single place to see what's running.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T045 [P] Manual verification per quickstart.md §3/§4: no URL/canonical/form-action ever reveals `ab-variant/` or a variant's page id (FR-006); a challenger variant is unreachable except via its direct `ab-variant/` URL — never linked or sitemapped (FR-012/SC-006); the cache-entry-count check confirms an *untested* page's load time is unaffected by this feature and a *tested* page gets up to N independent, individually-fast cache entries (FR-018/SC-008) *(deviation, found live: this app has no sitemap/robots/canonical-tag code at all, so that part of FR-012 holds trivially. New residual FR-006 gap found and documented (`ab-variant/[pageId]/page.tsx` header comment, `contracts/bucketing-and-caching.md`, `quickstart.md` §3, same treatment as the already-known `x-middleware-rewrite` gap): App Router's own RSC flight hydration payload — sent on every page, not just this route — embeds the matched route segment tree, so a bucketed response's raw HTML contains the literal string `"ab-variant"` plus that response's own page id; the address bar/canonical/form-action/rendered content never reveal it, only View Source does. Separately resolved research.md §2's open caching question via `pg_stat_user_tables` seq_scan/idx_scan deltas across 20 identical requests: `middleware.ts`'s own fetches are only partially covered by Next's Data Cache (still ~1-in-4 live DB reads), unlike a Server Component's fetch (confirmed fully cached — survives a `cms` outage, see T046); accepted as-is since local timing shows no perceptible cost, documented in research.md §2 with the original short-TTL-cache fallback kept as the documented next step if it ever becomes measurable.)*
- [X] T046 [P] Manual verification per quickstart.md §8: stopping the `growthbook` service mid-test serves the control with no error and excludes that visit from results (FR-016); restarting it resumes bucketing for new visitors with no redeploy *(deviation, found live: corrected quickstart.md §8 — GrowthBook is never on the bucketing hot path (Foundational-phase finding), so stopping it is a no-op; the real dependency `getRunningTestFor` depends on is the `cms` service's REST API, so that's what was actually stopped. Verified on a page with pre-existing traffic/cache history: both a fresh visitor and an already-bucketed visitor (existing cookie) still got a fast 200 with the control's own cached content and no new bucket cookie while `cms` was down; a brand-new, never-before-visited page correctly 404s under a full CMS outage instead — same as it would with no A/B testing at all, since page content itself also comes from the same backend, not a regression this feature introduces. `pingPageView`'s own fire-and-forget fetch fails silently under the same outage, so the excluded-visit requirement falls out for free with no dedicated exclusion logic. Restarting `cms` resumed bucketing for fresh visitors immediately, no redeploy.)*
- [X] T047 [P] Manual verification per quickstart.md §9: a user without editor/admin rights cannot create a variant, start/promote/conclude a test, or view the `experiments` section (FR-015) *(deviation: verified by hand via direct API calls, not a Playwright browser session — same precedent already established for this exact class of check by `us5-roles.spec.ts` (`test.fixme`'d for a known Payload 3.88 cross-host admin-session issue in the dockerised e2e runner, unrelated to 008). This system has only two human roles, `admin` and `editor`, both intentionally allowed by FR-015's own "same operators already permitted to edit and publish pages" — so the two real negative cases are the renderer's read-only service account and an unauthenticated caller: confirmed live the service account gets 200 on `GET /experiments` (needed for bucketing) but 403 on create-test-variant/start/promote, and an unauthenticated caller gets 403 on all four, including read.)*
- [X] T048 Run `npm run lint` and `npm run typecheck` for `apps/cms` **and** `apps/web`; fix any fallout from T002–T044 *(clean, no fallout)*
- [X] T049 Run `apps/cms`'s and `apps/web`'s full test suites (every new unit test above, plus `ab-testing-bucketing.spec.ts`) and confirm nothing from 001–007 regressed *(apps/cms: 204/204 unit tests pass. apps/web: 93/93 unit tests pass. e2e: found and fixed a real bug of our own — `ab-testing-bucketing.spec.ts` ran its real running experiment directly against the shared global-setup fixture page that `us1-capture.spec.ts`/`gtm-consent.spec.ts`/`a11y.spec.ts` all also depend on rendering normally, and Playwright's default cross-file parallelism made that bucketing visible to their concurrent requests — same class of cross-file interference `gtm-consent.spec.ts`'s own header comment already documents for a shared *domain*, just not yet hit for a shared *page*. Fixed by having the spec duplicate the shared page once more into its own dedicated, disposable control page before ever starting a test, plus a short poll around its own shared-page lookup (found live: that lookup can transiently return zero docs under heavy cross-file concurrency even though the page is never actually missing). After the fix, a full parallel run with `CI=1` (matching this project's actual CI retry policy) passes clean; the small remaining flakiness on *unrelated*, pre-existing files (`us1-capture.spec.ts`, `confirmation-page.spec.ts`, `gtm-consent.spec.ts`) under heavy local parallel load resolves via the existing `retries: 2` CI policy and reproduces zero times under `--workers=1` — genuine local resource contention, not a regression from 008.)*
- [X] T050 Lighthouse/PageSpeed sanity pass per quickstart.md §4 (FR-018/SC-008): confirm no measurable LCP regression on a tested page versus the same page untested *(deviation: a single sample each side first showed a ~850ms gap, but 3 repeat samples per condition showed that was noise, not signal — untested LCP clustered at 2015-2075ms across 3 runs, tested LCP clustered at 2014-2025ms across 3 separate runs on the same page/URL, i.e. statistically indistinguishable. No measurable regression confirmed with a multi-sample methodology, not a single noisy run.)*
- [X] T051 Walk `quickstart.md` end to end (§1–§9) on the local stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body" — outcomes: §1 inert by default (zero `experiments` rows once Phase-7 fixtures were cleaned up, confirmed live); §2 covered by T012/US1's own live verification; §3/§4 this phase's T045; §5 covered by T026/US2's own live verification; §6 covered by T044/US4's own live verification; §7 covered by T035-T036/US3's own live verification; §8 this phase's T046; §9 this phase's T047

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story (schema, infra, and the full bucketing pipeline all live here, since User Story 1's own acceptance criteria require a started test to actually split live traffic)
- **User Stories (Phase 3–6)**: All depend on Foundational. Among themselves:
  - US1 (Phase 3) has no dependency on US2, US3, or US4
  - US2 (Phase 4) depends on US1 only for there to be a running test with variants to show results for — its own components (T031–T033) can be built in parallel with US1's endpoints
  - US3 (Phase 5) depends on `experiments`/`experimentOf` (Foundational) and extends US2's tab (T039 adds buttons to T032) — not on US1's specific endpoints
  - US4 (Phase 6) depends only on the `experiments` collection (Foundational) and `ExperimentStats` (US2, T031)
- **Polish (Phase 7)**: Depends on all four stories being complete

### Within Each User Story

- Tests are written alongside their implementation task, per the constitution's "test-first is NOT required"
- A story's implementation tasks precede its own manual-verification task

### Parallel Opportunities

- T002, T003 (collection + field, Phase 2) — different files, both [P]
- T005–T007 (guard hook + its two tests, Phase 2) — T006/T007 both [P] once their respective targets (T005/T004) exist
- T011–T013 (infra, Phase 2) — three different files, all [P]
- T016–T023 (bucketing-pipeline modules + their tests, Phase 2) — mostly independent files; T016/T018/T020/T021/T022/T023 can proceed together, their unit tests (T017/T019) trail their own target only
- T028, T029 (US1 unit tests) — different files, both [P] once T026/T027 exist respectively
- T037, T038 (US3 unit tests) — different files, both [P] once T035/T036 exist respectively
- T045–T047 (Polish manual checks) — independent verification passes, all [P]

---

## Parallel Example: after Phase 2

```bash
# Once Foundational (Phase 2) is done, these can run together:
Task: "Create apps/cms/src/endpoints/createTestVariant.ts (US1, T026)"
Task: "Create apps/cms/src/components/ExperimentStats.tsx (US2, T031)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — schema, GrowthBook infra, and
   the full bucketing pipeline; blocks everything)
3. Complete Phase 3: User Story 1 — a real, working split test, verifiable
   end to end even with no results UI and no promotion yet
4. **STOP and VALIDATE**: quickstart.md §1–§2 end to end
5. Deploy/demo if ready — a test can run and be inspected directly in
   GrowthBook's own UI even before US2's in-CMS results view exists

### Incremental Delivery

1. Setup + Foundational → schema, infra, and bucketing pipeline ready
2. US1 → the compliance/product floor: tests can be created and actually
   split real traffic (**MVP**)
3. US2 → operators can see results without leaving the page
4. US3 → the payoff: a test can actually conclude and change what
   visitors see (**the full single-page loop is complete**)
5. US4 → convenience at scale for operators running several tests at once
6. Polish → full-suite confidence, performance sanity, PR verification
   record

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature's technical grounding lives in `docs/ab-testing-exploration.md`
  and `.claude/skills/growthbook/` — read alongside plan.md/research.md
  before starting implementation, not re-derived here
- Commit after each task or logical group; each phase above is a natural
  commit boundary, matching 004–007's one-phase-per-commit precedent
