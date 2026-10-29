---

description: "Task list for 018 — Statistical significance for page A/B tests"
---

# Tasks: Statistical significance for page A/B tests

**Input**: Design documents from `/specs/018-ab-significance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the constitution (Principle IV) requires them:
custom endpoints and hooks, the lead-capture path, data transformations
(verdict rules), Worker logic. Validation scenarios: quickstart V1–V9.

**Organization**: Tasks are grouped by user story. **Delivery order differs
from story order**: US3 (anonymous data collection with its privacy
guarantees) comes first, because US1 and US2 have nothing to analyse without
it and no data may be collected before the objection page and retention
exist. Then US1 (verdicts), then US2 (split warning). Release A ships all of
it with collection switched off at the edge (research R12).

**Who runs what**: tasks marked **(user)** are VPS writes, GrowthBook UI
steps, Worker variable changes or legal checks that auto mode blocks for
Claude or that belong to the owner; Claude prepares the exact commands and
verifies the result with reads.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3 from spec.md
- Paths are relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and environment

- [X] T001 Document `GROWTHBOOK_API_URL`, `GROWTHBOOK_API_KEY`, `GROWTHBOOK_PG_PASSWORD` (names only) in `infra/.env.example`; give `GROWTHBOOK_PG_PASSWORD` a dev value in the committed (git-crypt) `infra/.env`; pass the three to `cms` and `GROWTHBOOK_PG_PASSWORD` to `growthbook` in `infra/docker-compose.yml` and `infra/docker-compose.prod.yml` (prod: required `:?`); add `GROWTHBOOK_PG_PASSWORD` to the synthetic env written by `.github/workflows/ci.yml` (next to `GROWTHBOOK_JWT_SECRET` — a missing GrowthBook variable already turned CI red once, in 008) and check in CI that the growthbook container comes up healthy with `config.yml` mounted
- [X] T002 [P] Create `infra/growthbook/config.yml`: data source `trefle` (type postgres, host `db`, port 5432, database from the stack, user `growthbook_reader`, password `${GROWTHBOOK_PG_PASSWORD}`), `userIdTypes: [visitor_id]`, exposure query `SELECT visitor_id, exposed_at AS timestamp, experiment_key AS experiment_id, variant_id::text AS variation_id FROM ab_exposures` (research R4); mount it read-only at `/usr/local/src/app/config/config.yml` in both compose files
- [X] T003 [P] Make the cookie names final in `packages/shared/src/edge.ts` (`VISITOR_ID_COOKIE = "tf-visitor"`, `MEASUREMENT_OBJECTION_COOKIE = "tf-measure-objection"`, drop « provisional ») and add `MEASUREMENT_COOKIE_MAX_AGE_S = 34128000` (395 days, "under 13 months, never refreshed") and `MEASUREMENT_PAGE_PATH = "/mesure-audience"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage shared by every story

- [X] T004 Create `apps/cms/src/collections/AbExposures.ts` (slug `ab-exposures`, `admin.hidden`, every access `() => false`): `visitorId` text required, `experimentKey` text required, `variant` relationship → `pages` required, `domain` relationship → `domains` required, `exposedAt` date required; compound unique index `(visitorId, experimentKey)`, index on `experimentKey` (data-model.md)
- [X] T005 [P] Create `apps/cms/src/collections/AbConversions.ts` (slug `ab-conversions`, same access): `lead` relationship → `leads` **unique**, required; `visitorId` text required; `experimentKey` text; `variant` relationship → `pages`; `convertedAt` date; `confirmedAt` date nullable; index on `experimentKey`
- [X] T006 Add to `apps/cms/src/collections/Experiments.ts` the read-only fields `growthbookId` (text), `analysisStartedAt` (date), `analysis` (json, hidden), `analysisRefreshedAt` (date), `analysisError` (text, hidden) (data-model.md); register both new collections in `apps/cms/src/payload.config.ts`
- [X] T007 Generate the migration `apps/cms/src/migrations/<date>_ab_significance.ts` (tables, indexes, fields) and append by hand: create role `growthbook_reader` `LOGIN PASSWORD` from `process.env.GROWTHBOOK_PG_PASSWORD` (absent → `NOLOGIN` + one log line), `GRANT SELECT` on `ab_exposures`, `ab_conversions` only; down: revoke, drop role, drop tables/fields; regenerate `payload-types.ts`
- [X] T008 [P] Test in `apps/cms/tests/` (`test:db`): `growthbook_reader` can select both tables and gets `permission denied` on `leads` and `pages`; migration down then up leaves no role behind
  - *2026-10-19*: migration `20261019_185520_ab_significance` edited by hand after generation: the NOT NULL references (exposure → page/domain, conversion → lead) are `ON DELETE cascade` (Payload's `set null` would make deleting a lead or page fail), down path uses `IF EXISTS` (the generated one failed after `DROP TABLE … CASCADE`). Checked locally: up, `growthbook_reader` reads `ab_exposures` and is refused on `leads`; down removes role, tables and columns; up again; `test:db` 16/16.

**Checkpoint**: storage ready; nothing collects or shows anything yet.

---

## Phase 3: User Story 3 - Visitors' privacy is respected (Priority: P1) 🚀 ships first

**Goal**: Anonymous identifier only on pages under test, first exposures stored, leads attributed, objection per domain, deletion 30 days after the test.

**Independent Test**: quickstart V2, V3, V4, V7.

### Tests for User Story 3

- [X] T009 [P] [US3] CMS intake tests in `apps/cms/tests/abExposuresBatch.test.ts` per contracts/exposure-intake.md (same batch twice inserts once; first variant wins; concluded/unknown test, foreign page, bad UUID ignored; 101 items → 400; non-service → 403); FR-009: an admin and an editor get 403 on `GET /api/ab-exposures` and `GET /api/ab-conversions` (list and by id), and neither collection appears in the admin navigation
- [X] T010 [P] [US3] Attribution, confirmation and erasure tests in `apps/cms/tests/abConversions.test.ts` (variant page + id → one row with that page; page not under test → none; failure still stores the lead; `leadsConfirm` sets `confirmedAt`; `dsrErase` and `consentWithdraw` delete the row)
- [X] T011 [P] [US3] Worker tests in `apps/edge/tests/` for the contracts/edge-worker.md §9 invariants (no `tf-visitor` off-test, none with the objection cookie, first view sets it and sends one exposure with the same id, never re-set, nothing set with `EXPOSURES=off`); `/mesure-audience` classified `pass`
- [X] T012 [P] [US3] Renderer tests in `apps/web/` for the measurement page's cookie changes (`measurementCookieChanges`: object sets the objection 395 days and expires `tf-visitor`; withdraw expires the objection; anything else changes nothing — the Server Action's same-origin check is Next.js's own) and for `/api/leads` passing `visitorId` only without objection
- [X] T013 [P] [US3] Retention test in `apps/cms/tests/retention.test.ts`: a test ended 31 days ago loses its exposures and conversions, its `analysis` stays; a test ended 29 days ago keeps them

### Implementation for User Story 3

- [X] T014 [US3] Implement `POST /api/ab-exposure-batch` in `apps/cms/src/endpoints/abExposuresBatch.ts` (service only, 1–100 items, validation and one `INSERT … ON CONFLICT (visitor_id, experiment_key) DO NOTHING`, `200 { accepted, ignored }`) and register it
- [X] T015 [US3] Replace the 404 in `apps/web/src/app/api/edge/exposures/route.ts` by forwarding `{ exposures }` to the CMS intake with `authHeader()` and returning its status/body
- [X] T016 [US3] In `apps/web/src/app/api/leads/route.ts` read `tf-visitor` (UUID) and `tf-measure-objection`; send `visitorId` to the CMS intake only without objection
- [X] T017 [US3] In `apps/cms/src/endpoints/leadIntake.ts` create the `ab-conversions` row after the lead when `visitorId` is present and the lead's page is the control or a variant of a `running` experiment (`variant` = the page, `convertedAt` = `submittedAt`); log and continue on failure
- [X] T018 [P] [US3] Set `confirmedAt` in `apps/cms/src/endpoints/leadsConfirm.ts`; delete the lead's `ab-conversions` rows in `apps/cms/src/endpoints/dsrErase.ts` and `apps/cms/src/endpoints/consentWithdraw.ts`
- [X] T019 [US3] Worker: in `apps/edge/src/ab.ts` and `apps/edge/src/exposures.ts`, when `EXPOSURES=on` mint `tf-visitor` (contracts/edge-worker.md §3, `Max-Age=34128000; Path=/; HttpOnly; Secure; SameSite=Lax`, host-only) if absent and not objected, use it as the assignment input and in the exposure; add `/mesure-audience` to `PASS_PATHS` in `apps/edge/src/classify.ts`
- [X] T020 [US3] Measurement page `apps/web/src/app/(measurement)/mesure-audience/page.tsx` (page + Server Action, like `/unsubscribe`) per contracts/measurement-page.md, French text from research R10, no-JS form, `noindex`, no tag manager
- [X] T021 [P] [US3] Reserve `/mesure-audience` in `apps/cms/src/hooks/pages-path-validate.ts` (with a test next to the existing `/confirmation` one)
- [X] T022 [US3] Extend `runRetentionSweep` in `apps/cms/src/lib/retention.ts`: delete `ab-exposures` and `ab-conversions` of tests whose `endedAt` is more than 30 days ago (by `experimentKey`), report the counts
  - *2026-10-19*: T009–T022 done with tests: CMS unit (attribution, confirm, erasure/withdrawal, FR-009 access, path guard) and `test:db` (intake, retention, reader role) 23/23; renderer 39 tests; Worker 68 tests. `readCookie` moved to `@trefle/shared` (third use: Worker, lead route, measurement page). Retention purges A/B rows with one SQL statement per table (a Payload delete would load every row). The renderer's lead route sends `visitorId`; the CMS takes the variant from the lead's own page.
- [X] T023 [US3] e2e in `apps/web/tests/e2e/ab-measurement.spec.ts` (edge project, `EXPOSURES=on`): first view of a page under test → one exposure row; objection on `/mesure-audience` → no identifier, no exposure, lead stored without attribution (quickstart V2–V4)
  - *2026-10-20*: `ab-measurement.spec.ts` — measurement page objection and withdrawal with JavaScript off (cookies checked), axe, and through the local Worker with `E2E_EDGE=1 E2E_EXPOSURES=1` (Worker started with `EXPOSURES=on ./scripts/dev-e2e.sh`): id set once on a page under test, none on a plain page, none after objecting. 4/4 passed. DB-side effects (exposure row, attribution) checked by `test:db` and quickstart V2/V4.

**Checkpoint**: data collection complete and privacy-safe; switched off at the edge until go-live.

---

## Phase 4: User Story 1 - The operator knows whether a variant really wins (Priority: P1) 🎯

**Goal**: GrowthBook declares and analyses each test; the screen and list show probability, range and a plain verdict.

**Independent Test**: quickstart V1, V5, V6.

### Tests for User Story 1

- [X] T024 [P] [US1] Unit tests for `apps/cms/src/lib/ab-verdict.ts` in `apps/cms/tests/abVerdict.test.ts` (exactly 30 leads / 300 visitors per compared arm; 0.95 / 0.05 boundaries; three arms; no conversion yet → missing leads message; missing variation in results; missing visitors estimate `max(300 − users, ceil((30 − conversions) / rate))`)
- [X] T025 [P] [US1] Tests for `apps/cms/src/lib/growthbook.ts` with a mocked fetch: declare (fact table and metrics created once then found by name, experiment with variations keyed by page id, control first, then start), refresh (snapshot, polling, results → `analysis` written), failure → `analysisError` set and previous `analysis` kept, analysis off without `GROWTHBOOK_API_KEY`, the secondary metric's numerators land in `arms[].confirmed` (FR-017)

### Implementation for User Story 1

- [X] T026 [US1] Implement the verdict function `apps/cms/src/lib/ab-verdict.ts` (research R8; output = data-model.md `analysis` shape; verdicts `"not-enough-data" | "no-clear-difference" | "better" | "worse"`)
- [X] T027 [US1] Implement `apps/cms/src/lib/growthbook.ts`: API client on `GROWTHBOOK_API_URL` (default `http://growthbook:3100/api`), ensure fact table « Trefle — leads attribués » + metrics « Lead envoyé » / « Lead confirmé » (`confirmed_at IS NOT NULL`), declare/start/stop, `refreshAnalysis(experiment)` (contracts/analysis.md steps 1–5; poll every 3 s, up to 2 min; verdicts from the primary metric « Lead envoyé », per-arm `confirmed` counts from the secondary « Lead confirmé », FR-017)
- [X] T028 [US1] Payload task `apps/cms/src/jobs/abAnalysis.ts` (slug `ab-analysis`, `schedule: [{ cron: "0 * * * *", queue: "default" }]`, every `running` test sequentially) and register it in `apps/cms/src/payload.config.ts`
- [X] T029 [US1] Endpoint `POST /api/experiments/:id/refresh-analysis` in `apps/cms/src/endpoints/refreshAnalysis.ts` (admin/editor with the second factor, like the other admin endpoints) with a test for access
- [X] T030 [US1] Declare on start in `apps/cms/src/endpoints/startTest.ts` (best effort, never blocks starting); last refresh + stop in `apps/cms/src/endpoints/promoteVariant.ts` and `apps/cms/src/endpoints/concludeTestWithoutPromoting.ts` (never blocks concluding)
- [X] T031 [US1] Analysis block in `apps/cms/src/components/ExperimentAnalysis.tsx` + refresh button client component, mounted under the table in `apps/cms/src/components/ExperimentStats.tsx` (contracts/analysis.md « Screens »: per challenger probability, range, verdict; whole-test note when a period is selected; « Analyse disponible … à partir du <date> »; off/never computed/loading/error states with French copy)
- [X] T032 [US1] Column « Verdict » in the experiments list: `apps/cms/src/components/ExperimentVerdictCell.tsx` wired in `apps/cms/src/collections/Experiments.ts`
  - *2026-10-19*: T024–T032 done (US2's T035–T036 with them, same function and screen). Notes: the hourly task has its own queue `ab-analysis` (autoRun every 5 min) — the `default` queue only runs at 03:00; a test is declared `status: "running"` directly in `POST /v1/experiments` (no separate `/start`); the « Lead confirmé » metric uses a second fact table filtered on `confirmed_at IS NOT NULL` (simpler than fact-table filters); conclusion refreshes and stops in GrowthBook after the response; the « Verdict » column is the `analysis` field's list cell (its raw value is never shown). CMS 673 tests.
- [X] T033 [US1] Seed script `apps/cms/scripts/seed-ab-analysis.ts` (dev only, refuses to run when `NODE_ENV=production`): three tests with exposures and conversions for quickstart V5 (clear winner, identical arms, 70/30 split)
- [X] T034 [US1] Run quickstart V1, V5, V6 locally; record results in this file (fallback of research R4 if the API refuses the config data source)
  - *2026-10-19, local stack (prod images rebuilt), local GrowthBook 5.0.1 (throwaway account `essai@trefle.localhost`, secret key passed as an env var, not in any file)*:
    - **V1** ✓ — GrowthBook lists the `trefle` data source from `config.yml` (id type `visitor_id`, assignment query `trefle_exposures`); fact tables, metrics and experiments created through the API; `growthbook_reader` refused on `leads`.
    - **V5** ✓ (`npm run ab:seed`, real GrowthBook analysis): « gagnant » → better, chance 97.9 %, range +2 %…+98 %; « identique » → 50 %, no clear difference; « répartition » 70/30 → SRM p ≈ 0, split warning. Confirmed-lead counts read from the secondary metric. GrowthBook's `ciLow`/`ciHigh` are fractions (as assumed).
    - **V6** ✓ — GrowthBook unreachable: every test stores « Analyse statistique momentanément indisponible », previous analysis kept; next refresh clears it.
    - **V2** ✓ through the local Worker (`EXPOSURES=on ./scripts/dev-e2e.sh`): first view sets `tf-ab-*` + `tf-visitor` (395 days, host-only), the queue posts the exposure, one `ab_exposures` row; second view sets nothing; a page without a test sets no `tf-visitor`.
    - **V3** ✓ (edge part) — with `tf-measure-objection=1` no `tf-visitor`; `/mesure-audience` shows the right button per cookie, `noindex`. The button click itself (Server Action) is left to T023's browser test.
    - **V4** ✓ — a lead sent through the Worker from a page under test → one `ab_conversions` row, variant = the lead's page.
    - **Two bugs found and fixed here**: (1) the intake at `/api/ab-exposures/batch` answered 404 — under the collection's own slug Payload reads `batch` as a document id; moved to `/api/ab-exposure-batch`; (2) a test declared late (hourly task) started its GrowthBook phase « now » and lost every earlier exposure; the phase now starts at the test's start.

**Checkpoint**: verdicts visible end to end on local data.

---

## Phase 5: User Story 2 - The operator is warned when the test itself is broken (Priority: P2)

**Goal**: A significant split mismatch replaces every verdict by a warning.

**Independent Test**: quickstart V5 third test; simulation (c).

- [X] T035 [US2] Split check in `apps/cms/src/lib/ab-verdict.ts` (`checks.srm < 0.001` → `splitWarning: true`, no verdict for any challenger) with its unit tests in `apps/cms/tests/abVerdict.test.ts`
- [X] T036 [US2] Warning « Répartition des visiteurs anormale : les résultats ne sont pas fiables » in `apps/cms/src/components/ExperimentAnalysis.tsx` and in the list cell `apps/cms/src/components/ExperimentVerdictCell.tsx`

**Checkpoint**: all stories functional locally.

---

## Phase 6: Simulation (SC-001, SC-003)

- [X] T037 Simulation in `specs/018-ab-significance/simulation/` (`simulate.py` with `gbstats`, `requirements.txt`, `README.md`): 1,000 runs per scenario, verdict rules applied at every simulated hour of a 4-week test (research R9); write `simulation/results.md`; if identical arms are called winners in ≥ 5 % of runs, raise the minimum sample, update spec FR-013 and research R8 before release
  - *2026-10-20*: (b) failed with the instant rule (6.6 % false winners). Owner chose « verdict tenu 72 h » (1.4 % / 60.6 %): spec FR-013 + clarification session 2026-10-20, research R8–R9, `lib/ab-verdict.ts` (`leaning-*` verdicts, reading carried across refreshes) with tests. Full tables in `simulation/results.md`.

---

## Phase 7: Release and go-live

- [X] T038 Release A: PR, CI green, merge (user); **before** `release.sh` the owner adds a strong `GROWTHBOOK_PG_PASSWORD` to the VPS `infra/.env` (the prod compose file requires it, so the release would stop before the migration without it; Claude gives the command, the value is never printed); tag, `release.sh` with snapshot (user) — collection still off (`EXPOSURES=off`)
- [X] T039 (user) In GrowthBook create a secret API key, put it in `GROWTHBOOK_API_KEY` in the VPS `infra/.env`, recreate `cms`; Claude checks V1 in production with reads
- [X] T040 (user) Legal: run the CNIL self-assessment for exempted audience measurement against this design, validate the `/mesure-audience` text, add the measurement to the processing register texts
  - *2026-10-20*: self-assessment done by Claude from the official PDF (`docs/mesure-ab-cnil.fr.md`): the exemption does NOT apply (A/B cohorts excluded). Owner chose consent → Phase 9. Text validation and register entry move to T055's go-live.
- [x] T041 (user) ~~legal-notice link~~ → after Phase 9: mention the measurement in each domain's cookie-banner text (Settings) and link `/mesure-audience` from the privacy policy; Claude checks the links
- [X] T042 Deploy the Worker (`apps/edge`, `wrangler deploy`) with the identifier change, still `EXPOSURES=off`; check pages and A/B unchanged (020 parity checks)
  - *2026-10-20*: released `018.2-cookieless` (Claude, release.sh) and Worker deployed by the owner (version `f9dea612`, `EXPOSURES=off`). Checked from outside: both domains 200 through the Worker, no `Set-Cookie`, the client-domain form token carries a view number; no running test in production at that time. Before T043: the domains have **no privacy policy page** (the lead form's « Politique de confidentialité » link points to a generic EU page) — to be written first.
- [x] T043 (user) Switch `EXPOSURES=on`; Claude runs quickstart V9 within the hour and records it here, including SC-004: p95 response time of a page under test and of a plain page through Cloudflare (`curl --resolve` to a Cloudflare IP, 100 requests each), measured just before and just after the switch — no measurable difference
  - Baseline 2026-10-22 (before the switch, no test running in prod; 100 requests each through Cloudflare): www.client-site.example/ p50 0.132 s, p95 0.247 s; example.com/ p50 0.116 s, p95 0.221 s. T041: privacy policies (021) link /mesure-audience on both domains; cookieless design needs no banner change.
  - Switched 2026-10-22 (Worker version 5f23e2b1, EXPOSURES on). V9: no Set-Cookie on any page checked (both homepages, /confidentialite, /mesure-audience); cms/web logs: no error in the 15 min after; p95 after, 100 requests each: client-site / p50 0.137 s, p95 0.242 s; example / p50 0.119 s, p95 0.220 s — no measurable difference (SC-004). Exposures arriving: to check when the first test runs in production (none running at switch time).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T044 [P] Runbook: `infra/deploy/README.md` and `README.fr.md` (GrowthBook API key, `GROWTHBOOK_PG_PASSWORD`, `config.yml`, how to cut collection: `EXPOSURES=off`); `docs/ab-testing-exploration.md` §8.6 « shipped »; operator note on adding the `/mesure-audience` link when a new domain is onboarded (`docs/` add-domain runbook)
- [X] T045 [P] Update 020 `contracts/edge-ingest.md` (« Until 018 ships » → current behaviour) and the `tf-visitor` comment in `packages/shared/src/edge.ts`
- [X] T046 a11y check of `/mesure-audience` (no serious/critical axe violation) — in `ab-measurement.spec.ts`, which runs it in every mode
- [X] T047 Re-run lint, type-check, unit, `test:db`, e2e (local + edge project); spec status → Implemented
  - *2026-10-20*: lint + type-check cms, web, edge (shared has no ESLint config, as before); unit cms 679, web 233+6, shared 74, edge 68; `test:db` 23. Full e2e: renderer direct 84 passed (3 flaky, green on retry); through the local Worker with exposures on 86 passed, 2 failed under parallel load (`us-domain-fonts`, `us-import` — features 018 does not touch), both green when re-run alone (8/8). Spec status stays Draft → « Implemented, not deployed » until Phase 7.

---

## Phase 9: Consent instead of the exemption (decided 2026-10-20, research R14)

**Goal**: measure only visitors who accepted the cookie banner of the domain; the CNIL tool of July 2025 excludes A/B cohorts from the exemption (`docs/mesure-ab-cnil.fr.md`). Blocks T042–T043.

- [X] T048 [P] Shared: `hasAnalyticsConsent(cookieHeader)` in `packages/shared/src/edge.ts` reading the 007 cookie `tf_consent` (`accepted|<date>`, URL-encoded) — move `CONSENT_COOKIE_NAME` there and have `apps/web/src/lib/consent-cookie.ts` use it; remove `MEASUREMENT_OBJECTION_COOKIE`; tests
- [X] T049 [US3] Worker `apps/edge/src/exposures.ts` / `index.ts`: identifier and exposure only with consent; on a page under test without consent, expire an existing `tf-visitor`; tests per contracts/edge-worker.md §9 (no consent, refused, accepted, withdrawal expires the id)
- [X] T050 [P] [US3] Renderer: `measuredVisitorId` in `apps/web/src/lib/ab-measurement.ts` requires consent (no objection cookie any more); `measurementCookieChanges` removed; tests
- [X] T051 [US3] `/mesure-audience` becomes the information page of contracts/measurement-page.md (current choice from `tf_consent`, how to change it, no form); renderer tests for the three states
- [X] T052 [US1] Test screen: when the control page's domain has `consentBannerEnabled` off, the analysis block says « Ce domaine n'a pas de bandeau de cookies : aucun visiteur ne peut y être mesuré » (`apps/cms/src/components/ExperimentAnalysis.tsx` + mount points)
- [X] T053 e2e `apps/web/tests/e2e/ab-measurement.spec.ts`: page states; through the Worker with exposures on: no id without consent, id after « accepter », id removed after refusing via the revisit control; axe
- [X] T054 Docs: runbook 5.1 (EN/FR) go-live steps (banner text, privacy policy link instead of legal notice), quickstart V3, `docs/mesure-ab-cnil.fr.md` (option A chosen, register entry with consent), `docs/ab-testing-exploration.md` §8.6
  - *2026-10-20*: Phase 9 done. `consentChoice` / `CONSENT_COOKIE_NAME` in `@trefle/shared` (007's cookie name now imported from there); objection cookie and button removed; Worker expires `tf-visitor` on a page under test without consent; `/mesure-audience` is an information page (three states); admin notice for a domain without the banner. Tests: shared 78, edge 69, web 230, cms 679; e2e through the local Worker with exposures on: `ab-measurement` 4/4, `gtm-consent` + `edge-parity` + `ab-testing-bucketing` 22/22.
- [X] T056 [US3] (decided 2026-10-20, FR-018) A/B assignment only with consent: `decideVariant(…, consented)` in `apps/edge/src/ab.ts` + `apps/edge/src/index.ts`, origin middleware `apps/web/src/middleware.ts`; admin notes (raw counts, domain without banner); tests: Worker « without consent: the original, no variant cookie », middleware legacy-mode tests, e2e `ab-testing-bucketing.spec.ts` visitors accept the banner + a no-consent case
- [X] T055 Release (tag `018.1-consent`), then T040–T043 with the new steps: banner text + privacy policy (user), Worker deploy, `EXPOSURES=on`

## Phase 10: Cookieless tests (decided 2026-10-20, research R15 — supersedes Phase 9's consent rules)

**Goal**: landing pages testable from the first view; nothing stored on or read from the device.

- [X] T057 Shared: `isViewNumber()` (11 base64url characters) replaces `isVisitorId`; remove `VISITOR_ID_COOKIE`, `MEASUREMENT_COOKIE_MAX_AGE_S`, `consentChoice` and the A/B cookie helpers once unused; tests
- [X] T058 [US3] Worker: salt drawn before the decision = view number; `decideVariant(marker, viewNumber)` draws per view, reads/sets no cookie; one exposure per non-crawler view with that number; tests per contracts/edge-worker.md §9
- [X] T059 [P] [US3] Origin middleware: random per request, no cookie (edge-cut fallback); tests
- [X] T060 [P] [US3] Renderer: `verifyFormToken` returns the view number (third segment of the signed body); `/api/leads` sends it as `visitorId`; `ab-measurement.ts` removed; tests
- [X] T061 [P] [US3] CMS: intake and lead attribution validate the view number (`isViewNumber`); tests
- [X] T062 [US3] `/mesure-audience` per contracts/measurement-page.md (no choice section); admin: remove the consent note and the no-banner warning; verdict copy says « affichages »
- [X] T063 e2e: `ab-measurement.spec.ts` (page, no cookie on a page under test, exposure number = form token number), `ab-testing-bucketing.spec.ts` (both versions over a few views, no cookie, no stickiness test)
- [X] T064 Docs: runbook 5.1 EN/FR (no banner step; privacy-policy link), quickstart V2–V4, `docs/mesure-ab-cnil.fr.md` (§ 7 cookieless), `infra/growthbook/config.yml` identifier description
  - *2026-10-20*: Phase 10 done. T055: `018.1-consent` was released (Worker never deployed with it, so production behaviour never changed) and is superseded by `018.2-cookieless`. Tests: shared 76, edge 60, web 228, cms 679 + `test:db` 23; e2e direct 20 passed (3 edge-only skipped), through the local Worker with exposures on 27 passed (ab-testing-bucketing, ab-measurement, gtm-consent, edge-parity, us1-capture); DB check through the Worker: a view's exposure and the lead sent from it carry the same view number (form token salt), no `Set-Cookie`.
- [x] T065 Release `018.2-cookieless`, Worker deploy, then `EXPOSURES=on` (V9)

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → **US3 (3)** → **US1 (4)** → **US2 (5)**; Simulation (6) after T026/T035; Release (7) after 3–6; Polish (8) any time after its subject exists.
- US1 needs US3's data only for end-to-end checks (T034); its code (T024–T032) can start after Phase 2 with seeded data (T033).
- US2 is a small extension of US1's verdict function and screen.
- Go-live order is strict: T038 → T039 → T040 → T041 → T042 → T043 (no identifier before the objection page, the texts and the links exist).

## Parallel Opportunities

- Phase 1: T002, T003 alongside T001.
- Phase 2: T005 with T004; T008 after T007.
- US3 tests T009–T013 in parallel; then T014–T018 (CMS/renderer) in parallel with T019 (Worker) and T020–T021 (measurement page).
- US1: T024–T025 in parallel; T026 and T027 in parallel; T031–T032 after T026.

## Implementation Strategy

1. **MVP = US3 + US1** (both P1): data collected safely and verdicts shown. Ship as release A with collection off, then go-live (Phase 7).
2. US2 rides in the same release (two tasks).
3. Undo at any time: `EXPOSURES=off` (seconds); release rollback with `release.sh --rollback` (migration down drops tables and role).
