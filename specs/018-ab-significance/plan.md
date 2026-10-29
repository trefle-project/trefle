# Implementation Plan: Statistical significance for page A/B tests

**Branch**: `018-ab-significance` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-ab-significance/spec.md`

## Summary

Record, anonymously, which variant each visitor first saw and which visitor
sent a lead, let GrowthBook (already deployed) compute its Bayesian analysis
on that data, and show a plain-French verdict on the test screen and list.

Approach (research R1–R12): the edge Worker (020) sets a per-domain
`tf-visitor` cookie on pages under test and queues first exposures; the CMS
stores them in a hidden `ab-exposures` collection (idempotent batch insert)
and attributes leads from the lead's own page into `ab-conversions`.
GrowthBook reads only those two tables through a read-only Postgres role
declared in `infra/growthbook/config.yml`; the CMS declares each test through
GrowthBook's API, refreshes the analysis hourly (and on demand), applies
Trefle's verdict rules (30 leads / 300 visitors minimum, 95 %, split check)
and stores the result on the experiment, so screens never wait on GrowthBook.
A fixed `/mesure-audience` page on every domain lets visitors object. Data is
deleted 30 days after a test ends.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 24 (cms, web), Cloudflare
Workers runtime (edge); Python 3 for the offline simulation only.

**Primary Dependencies**: Payload 3.88 (collections, jobs, endpoints),
Next.js (renderer route + measurement page), GrowthBook 5.0.1 REST API and
`config.yml`, the 020 Worker and Queue; `gbstats` (dev-only simulation).

**Storage**: PostgreSQL — two new Payload collections, new fields on
`experiments`, one read-only role. GrowthBook's MongoDB keeps only its own
objects (data source from file, fact table, metrics, experiments).

**Testing**: vitest (cms with Postgres `test:db`, web, edge), Playwright e2e
(local stack + 020 edge project), Python simulation for SC-001/SC-003.

**Target Platform**: the existing Hostinger VPS (compose) + Cloudflare
Workers.

**Project Type**: web — monorepo apps `cms`, `web`, `edge`, package `shared`.

**Performance Goals**: no added work on cached page views beyond one cookie
check and, on a visitor's first view of a test, one queue message (SC-004);
one insert per exposure batch; analysis ≤ 1 h old (SC-006).

**Constraints**: CNIL audience-measurement exemption (identifier ≤ 13 months
and not extended, objection per domain, no cross-site use, deletion 30 days
after the test, no per-visitor data in any screen); lead flow unchanged
without JavaScript; GrowthBook down never breaks the screens.

**Scale/Scope**: a handful of running tests at a time; up to ~10⁴–10⁵
exposures per test; hourly refresh of each running test.

## Constitution Check

*GATE: checked before research and after design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity | Two plain collections, one verdict function, one refresh code path used by the job, the button and conclusion. No wrapper around GrowthBook beyond the calls needed. Screens read stored data. | Pass |
| II. Stack-native | Payload collections/jobs/endpoints, Next.js route; GrowthBook, Worker, Queue already in the stack (008, 020). No new runtime dependency; `gbstats` is dev-only. | Pass |
| III. Small, reversible | Release A ships inert (Worker `EXPOSURES=off`, analysis off without API key); collection switched on by a Worker variable (undo in seconds); migration has a down path (tables + role). | Pass |
| IV. Tests | Intake, attribution, erasure, retention, verdict rules, Worker invariants, measurement page: automated tests listed in the contracts. | Pass |
| V. Quality | Measurement page works without JS, accessible; screens handle off / never computed / loading / error states with French copy. | Pass |
| Secrets | `GROWTHBOOK_API_KEY`, `GROWTHBOOK_PG_PASSWORD` only in git-crypt'd `.env`; `.env.example` documents them. | Pass |
| Architecture | No change to the architecture section: exposures follow 020's edge → origin path already described. | Pass |

Post-design re-check: unchanged, no violation, no Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/018-ab-significance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── exposure-intake.md
│   ├── edge-worker.md
│   ├── measurement-page.md
│   └── analysis.md
├── simulation/          # R9 (created by tasks)
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/cms/src/
├── collections/AbExposures.ts, AbConversions.ts      # new, hidden
├── collections/Experiments.ts                        # analysis fields, list column
├── endpoints/abExposuresBatch.ts                     # new intake
├── endpoints/refreshAnalysis.ts                      # new
├── endpoints/leadIntake.ts, leadsConfirm.ts, dsrErase.ts, consentWithdraw.ts,
│   promoteVariant.ts, concludeTestWithoutPromoting.ts   # touched
├── jobs/abAnalysis.ts                                # new hourly task
├── lib/growthbook.ts                                 # API calls + ensure objects
├── lib/ab-verdict.ts                                 # pure verdict rules
├── lib/retention.ts                                  # +exposures/conversions
├── hooks/pages-path-validate.ts                      # +/mesure-audience
├── components/ExperimentStats.tsx, ExperimentAnalysis*.tsx, ExperimentVerdictCell.tsx
└── migrations/<date>_ab_significance.ts              # collections, fields, role

apps/web/src/
├── app/(measurement)/mesure-audience/                 # page + POST handler
├── app/api/edge/exposures/route.ts                    # forward to CMS
└── app/api/leads/route.ts                             # pass visitorId

apps/edge/src/ab.ts, exposures.ts, classify.ts         # identifier, pass path
packages/shared/src/edge.ts                            # cookie names final, lifetime
infra/growthbook/config.yml                            # data source as code
infra/docker-compose*.yml, infra/.env.example          # mount, env vars
specs/018-ab-significance/simulation/                  # gbstats simulation
```

**Structure Decision**: existing monorepo layout; new code sits next to its
008/020 siblings (experiments in the CMS, exposures where 020 reserved them).

## Complexity Tracking

None.
