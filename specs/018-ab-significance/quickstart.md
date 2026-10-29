# Quickstart: validating 018-ab-significance

Contracts: [exposure-intake](contracts/exposure-intake.md),
[edge-worker](contracts/edge-worker.md),
[measurement-page](contracts/measurement-page.md),
[analysis](contracts/analysis.md). Data: [data-model.md](data-model.md).

## Prerequisites

- Local stack with both compose files (GrowthBook + its MongoDB included),
  `GROWTHBOOK_PG_PASSWORD` set in `infra/.env`, migrations applied.
- A GrowthBook admin account on the local instance and a secret API key in
  `GROWTHBOOK_API_KEY` (cms), cms recreated.
- Edge e2e harness from 020: `apps/edge/scripts/dev-e2e.sh` with
  `EXPOSURES=on`.

## V1 — GrowthBook wiring

GrowthBook shows the `trefle` data source from `config.yml` and its test
connection succeeds as `growthbook_reader`; `growthbook_reader` cannot read
`leads` (`permission denied`). Starting a test in Trefle creates the fact
table, both metrics (first time only) and a running experiment whose
variations are the test's pages. *Fallback if the API refuses the config
data source for fact tables: research R4.*

## V2 — Views and exposures (US3 scenarios 1–2, research R15)

Through the edge harness: a page under test sets no cookie; over a few views
both versions appear; every non-crawler view adds one `ab_exposures` row
whose `visitor_id` is the view number inside that response's form token; a
page without a test adds nothing.

## V3 — Nothing on the device (FR-001, FR-006)

No `Set-Cookie` on any page under test, whatever the cookie-banner choice;
`/mesure-audience` explains the tests, no form, axe clean.

## V4 — Attribution and confirmed lead (FR-003, FR-017)

Lead sent from a view of a variant page (edge-signed form token) → one
`ab-conversions` row with that page and the view number; confirm the opt-in →
`confirmed_at` set.

## V5 — Verdicts on seeded data (US1, US2)

Seed exposures and conversions (script in the tasks) for three tests: clear
winner (+50 %, 2,000 per arm), identical arms, 70/30 split on 50/50. Press
« Rafraîchir » on each: « B est probablement meilleure »; « Pas de différence
nette » or « Pas encore assez de données »; the split warning and no verdict.
The list shows the same one-liners. Period filter → counts change, the
analysis does not and says so.

## V6 — GrowthBook down (FR-016)

Stop the growthbook container: test screen shows counts as before + « Analyse
statistique momentanément indisponible » after a refresh attempt; nothing
else breaks. Start it again: next refresh succeeds.

## V7 — Retention and erasure (FR-007, FR-008, SC-005)

Conclude a test, set its `endedAt` 31 days back, run the retention sweep:
its exposures and attributions are gone, its analysis still shows. Erase a
lead (DSR) → its attribution is gone.

## V8 — Simulation (SC-001, SC-003)

Run `specs/018-ab-significance/simulation/` (research R9); record the three
rates in `simulation/results.md`.

## V9 — Production go-live (after release A)

`config.yml` live, data source connected, owner's API key set; legal-notice
links on every domain; texts validated (CNIL self-assessment done); then
Worker deploy and `EXPOSURES=on`. Within the hour: exposures arriving for the
running test(s), analysis refreshed on the screen, no error in cms/web logs,
no cookie set by any page (tested or not).
SC-004: p95 response time of a page under test and of a plain page through
Cloudflare, 100 requests each, just before and just after the switch — no
measurable difference.
