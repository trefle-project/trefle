# Research: Statistical significance for page A/B tests

**Feature**: 018-ab-significance | **Date**: 2026-10-19 | **Plan**: [plan.md](plan.md)

Context checked in the code on 2026-10-19: 008 tests (`collections/Experiments.ts`,
`components/ExperimentStats.tsx`, `endpoints/startTest.ts`), 020's Worker
(`apps/edge/src/ab.ts`, `exposures.ts`, `classify.ts`), the renderer's reserved
exposure route (`apps/web/src/app/api/edge/exposures/route.ts`, answers 404),
the lead path (`apps/web/src/app/api/leads/route.ts` → CMS `leadIntake`), erasure
(`dsrErase`, `consentWithdraw`: leads are anonymised, never deleted), the jobs
queue (`payload.config.ts`, `jobs/retentionSweep.ts`), GrowthBook 5.0.1 as
deployed (`infra/docker-compose*.yml`) and its API spec at tag `v5.0.1`
(`packages/back-end/generated/spec.yaml`).

## R1 — Who sets the visitor identifier

**Finding**: 020's Worker sends an exposure only when the variant assignment
is new **and** a `tf-visitor` cookie already exists — and nothing sets that
cookie. A new visitor has no identifier on their first view (no exposure);
on later views the assignment is no longer new (no exposure either). As built,
no exposure would ever be recorded.

**Decision**: the Worker sets `tf-visitor` itself, on a response for a page
under test, when the visitor has neither `tf-visitor` nor the objection
cookie, and only while `EXPOSURES=on`. The same request uses that new value
as the assignment input (`assignVariant(visitorId, …)`, already the rule in
edge-worker §3 step 3) and sends the exposure. Cookie: random UUID,
`Max-Age=34128000` (395 days, under 13 months), `Path=/; HttpOnly; Secure;
SameSite=Lax`, host-only (per domain). It is set once and never refreshed
(CNIL: the lifetime must not be extended by later visits).

**Alternatives**: the origin sets it (the origin never sees cached page views,
020); browser JavaScript sets it (adds client JS to every page under test,
fails without JS, readable by third-party scripts). Both rejected.

**Consequence**: a visitor who already had a variant cookie before 018 gets an
identifier on their next view but no exposure (the assignment is not new);
they are outside the analysis, like any visit before the test's analysis
start (spec edge case). Accepted.

## R2 — Where exposures and attributions are stored

**Decision**: two Payload collections, hidden from the admin and closed to
every user (only `overrideAccess` code reads or writes them), like 020's
`edge-view-windows`:

- `ab-exposures` — one row per (visitor, test), unique index on
  `(visitor_id, experiment_key)`; batch insert with `ON CONFLICT DO NOTHING`
  (first exposure wins, re-sent batches are harmless).
- `ab-conversions` — one row per attributed lead (unique on the lead), with a
  `confirmed_at` copied when the lead's opt-in is confirmed.

Migrations stay Payload migrations (Principle III); nothing per visitor shows
in the admin or the REST API (FR-009).

**Alternatives**: raw SQL tables outside Payload (a second schema-management
path); fields on `leads` (attribution would outlive the 30-day retention
unless cleared field by field, and GrowthBook would need to read `leads`).
Rejected.

## R3 — Attributing a lead to a variant (FR-003)

**Decision**: the variant is the page that served the form — the lead's
`page` — since every arm of a whole-page test is its own page (008). The
renderer's `/api/leads` reads only `tf-visitor` and the objection cookie
(lead form posts go to the origin; the Worker passes POSTs through with their
cookies) and forwards `visitorId` to the CMS intake when present and not
objected. The CMS intake, after creating the lead, looks up a running test
whose control or variant is that page and inserts the attribution. No A/B
cookie is read; no extra data about the lead goes into the attribution.

**Alternatives**: read the `tf-ab-<key>` cookie (redundant with the page;
wrong if the visitor submitted from a page they reached otherwise).

## R4 — GrowthBook data source: configuration as code

**Decision**: GrowthBook reads Postgres through a dedicated **read-only role
`growthbook_reader`** granted `SELECT` on `ab_exposures` and `ab_conversions`
only (no access to leads, pages or anything else — data minimisation, FR-010).
The data source is declared in `infra/growthbook/config.yml`, mounted at
`/usr/local/src/app/config/config.yml`, password through `${GROWTHBOOK_PG_PASSWORD}`
interpolation (documented by GrowthBook; data sources in `config.yml` are not
deprecated — only legacy metrics there are). Identifier type `visitor_id`;
exposure query:

```sql
SELECT visitor_id, exposed_at AS timestamp, experiment_key AS experiment_id,
       variant_id::text AS variation_id
FROM ab_exposures
```

The role is created by a Payload migration that reads `GROWTHBOOK_PG_PASSWORD`
from the cms environment (missing → role created `NOLOGIN`, a log line says
so); its down path drops the role.

**Alternatives**: configure the data source in GrowthBook's UI (state only in
its MongoDB, not reproducible, against the "edge/infra as code" habit of
017–020); connect as the main Postgres user (reads everything). Rejected.

**To verify during setup (quickstart V1)**: fact tables created through the
API accept the `config.yml` data source id. Fallback if not: legacy metrics
declared in the same `config.yml` (deprecated but supported in 5.0.1).

## R5 — Metrics

**Decision**: one fact table over `ab_conversions` (`visitor_id`,
`converted_at AS timestamp`, `confirmed_at`) and two binomial fact metrics:
« Lead envoyé » (primary, FR-017) and « Lead confirmé » (secondary, filter
`confirmed_at IS NOT NULL`). Created through the API (`POST /v1/fact-tables`,
`POST /v1/fact-metrics`) by the CMS on first use and found again by name —
no separate setup script, works the same in dev, CI and production.

## R6 — GrowthBook API calls (5.0.1, verified in the tagged spec)

| Need | Call |
|---|---|
| Declare a test (FR-011) | `POST /v1/experiments` (trackingKey = `growthbookExperimentKey`, data source, assignment query, variations keyed by page id, control first, metrics) then `POST /v1/experiments/{id}/start` |
| Refresh (FR-012) | `POST /v1/experiments/{id}/snapshot`, then `GET /v1/snapshots/{id}` until done |
| Read results | `GET /v1/experiments/{id}/results` → per variation `users`, `numerator` (conversions), `analyses[]` with `chanceToBeatControl`, `ciLow`/`ciHigh`, `percentChange`; `checks.srm` (p-value) |
| Close (FR-011) | `POST /v1/experiments/{id}/stop` |

The CMS calls GrowthBook's API on the internal network
(`http://growthbook:3100/api`), so Cloudflare Access (019) is not in the way.
Authentication: a GrowthBook secret API key created once in its UI by the
owner, stored as `GROWTHBOOK_API_KEY` (cms only, git-crypt'd `.env`).

## R7 — Where the analysis lives and when it refreshes

**Decision**: the CMS stores the last analysis on the `experiments` document
(aggregates only: per arm users/conversions, per challenger chance, range,
verdict; split check; refreshed-at; last error). The test screen and the list
read it — they never call GrowthBook, so they stay fast and show the counts
and the last analysis when GrowthBook is down (FR-016, SC-006).

A Payload task `ab-analysis` scheduled hourly (`0 * * * *`, queue `default`,
already run by `JOBS_AUTORUN`) declares any running test not yet declared,
asks a snapshot, waits for it (≤ 2 min), stores the result. A « Rafraîchir »
button calls an endpoint doing the same for one test. Concluding a test runs
a last refresh then stops it in GrowthBook (analysis frozen, FR edge case).

Tests running before 018 ships are declared by the first hourly run; their
GrowthBook phase starts then, and the screen says « Analyse disponible pour
les visites à partir du <date> ».

## R8 — Verdict rules (FR-013, FR-014)

Computed by Trefle from GrowthBook's numbers (a pure, unit-tested function):

1. `checks.srm < 0.001` (GrowthBook's default threshold) → split warning,
   no verdict for any challenger.
2. Either compared arm under **30 conversions or 300 visitors** →
   « Pas encore assez de données » + estimate: missing visitors =
   `max(300 − users, ceil((30 − conversions) / rate))` per arm, with `rate`
   the pooled conversion rate (if no conversion yet, say « au moins N leads
   de plus »).
3. `chanceToBeatControl ≥ 0.95` → reading « better »; `≤ 0.05` → « worse »;
   otherwise « Pas de différence nette pour l'instant ».
4. A reading is announced (« <variante> est probablement meilleure / moins
   bonne ») only once it has held for 72 hours of refreshes in a row; until
   then « Tendance : … semble meilleure (à confirmer le <date>) ». The reading
   and its start are stored in the analysis and carried across refreshes;
   a dropped or flipped reading restarts the hold. (Decided 2026-10-20, R9.)

Range shown = `ciLow`…`ciHigh` of the relative change (Bayesian credible
interval, GrowthBook default engine).

**Known limit**: the Bayesian engine has no sequential correction and the
screen is looked at repeatedly. The minimum sample and the 95 % threshold are
the guard; SC-001's "identical variants never called a winner in ≥ 95 % of
runs" is checked by simulation **with hourly peeking** (R9), not assumed.

## R9 — Checking SC-001 / SC-003

Offline simulation script (`specs/018-ab-significance/simulation/`, Python,
`gbstats` — GrowthBook's own stats package, dev-only): 1,000 simulated tests
per scenario, verdict function applied at every simulated hour of a 4-week
test: (a) +50 % true lift, 2,000 visitors per arm → reported better;
(b) A = B → reported winner in < 5 % of runs at any peek; (c) 70/30 split on
a 50/50 test, ≥ 1,000 visitors → warning in 100 %. Results committed with the
feature. If (b) fails, raise the minimum sample before shipping (decision
recorded here).

**Outcome (2026-10-20, `simulation/results.md`)**: (b) failed with the
instant rule — 6.6 % false winners (23.1 % counting false losers too).
Raising the minimum is useless at this traffic (100 leads per variant are
never reached with 2,000 visitors at 3 %); a sequential frequentist test
keeps errors low but detects almost nothing at these volumes; a 99 %
threshold costs half the detection. Chosen by the owner: hold the reading
72 hours (1.4 % false winners, 60.6 % detection). Fixed-horizon (verdict
only at a planned end date, 2.0 % / 72.8 %) was the alternative.

## R10 — The measurement page and objection (FR-006)

**Decision**: the renderer serves `/mesure-audience` on every domain (a fixed
route, like `/confirmation`): text describing the measurement (purpose,
identifier, lifetime 13 months, data deleted 30 days after the test) and one
form button — « Je m'oppose à la mesure » or, when the objection cookie is
present, « Je retire mon opposition ». The button POSTs to the same address
(works without JavaScript, Principle V): objecting sets
`tf-measure-objection=1` (`Max-Age=34128000`, host-only, `HttpOnly; Secure;
SameSite=Lax`) and expires `tf-visitor`; withdrawing expires the objection.
Then 303 back to the page with a confirmation line.

- `/mesure-audience` becomes a reserved path (pages cannot use it, same guard
  as `/confirmation`) and a Worker pass path (its content depends on the
  visitor's cookie, never cached).
- Text in French (the product's language); the owner/DPO validates it before
  exposures are switched on, after running the CNIL self-assessment tool for
  exempted audience measurement against this design (no IP address is
  recorded at all; one publisher per cookie, since cookies are per domain).
- Operators add a link to it in each domain's legal-notice page
  (documentation + a checklist line in the go-live steps).
- The objection also stops attribution (R3) and the Worker's exposure (it
  already checks the cookie).

## R11 — Retention and erasure (FR-007, FR-008)

- The daily `retention-sweep` deletes exposures and conversions whose test
  ended (`endedAt`) more than 30 days ago (by `experiment_key`). The analysis
  stored on the experiment stays.
- `dsrErase` and `consentWithdraw` delete the `ab-conversions` row of every
  lead they touch (leads are anonymised, not deleted, so no cascade happens on
  its own).
- Visitor identifiers live only on visitors' devices (≤ 13 months).

## R12 — Rollout (Principle III)

1. Release A (CMS + renderer): collections and migration (role), intake live
   (renderer route forwards), attribution, measurement page, analysis task
   (does nothing while `GROWTHBOOK_API_KEY` is empty; the screen then shows
   counts only, as today), retention, erasure. Nothing is collected yet: the
   Worker still has `EXPOSURES=off`.
2. Owner: GrowthBook API key + `GROWTHBOOK_PG_PASSWORD` in the VPS `.env`,
   `config.yml` live (same release), recreate cms/growthbook; texts validated;
   links added in each domain's legal notice; processing register updated
   (the legal feature's texts gain this measurement).
3. Worker deploy with the `tf-visitor` change, then `EXPOSURES=on`.

Undo: `EXPOSURES=off` (Worker var, seconds) stops collection; the analysis
then just stops moving. Release A rolls back with `release.sh --rollback`
(the migration's down drops the tables and the role).

## R13 — Constitution

No new runtime dependency: GrowthBook, its MongoDB, the Worker, Queues are
already in the stack (008, 020). `gbstats` is a dev-only simulation tool, not
shipped. Additions are configuration (`config.yml`, a read-only Postgres
role) and code on existing surfaces. No amendment needed.

## R14 — Legal basis: consent through the cookie banner (2026-10-20)

**Finding**: the CNIL self-assessment tool for exempted audience
measurement (July 2025, read in full — `docs/mesure-ab-cnil.fr.md`)
excludes from the exemption « toute création de cohorte d'utilisateurs pour
leur présenter des contenus différenciés, que l'appartenance à une telle
cohorte soit définie de manière aléatoire […] », conversion-performance
measurement, and any tagging that retrieves personal data through forms.
R1/R10's premise (exemption + objection) does not hold.

**Decision (owner, option A)**: measure only visitors who accepted the
cookie banner of that domain (007, cookie `tf_consent`, value
`accepted|<date>`, first-party, 6 months, readable at the edge).

- Worker: `tf-visitor` set and exposure sent only with `tf_consent` =
  accepted; on a page under test without that consent, an existing
  `tf-visitor` is expired (withdrawal also removes the identifier, the next
  time the visitor sees a page under test).
- Renderer: lead attribution only with consent.
- The objection cookie and the objection button are removed (the banner's
  revisit control is the withdrawal); `/mesure-audience` stays as an
  information page showing the visitor's current choice and pointing to the
  banner's control; the privacy policy links to it (CNIL: link in the
  privacy policy).
- A domain with the banner switched off is never measured; the test screen
  says so.
- Operator content (go-live): the banner text mentions the measurement of
  page tests; the privacy policy describes it.

**Rejected**: keeping the exemption with an objection (contradicts the
2025 tool); a separate measurement-only consent prompt (a second banner; the
existing one already covers analytics and is per domain).

**A/B assignment too (owner, same day)**: the cookie `tf-ab-*` (008) also
sorts visitors into cohorts shown different content. From the next release
on, assignment needs the same consent (spec FR-018): without it, the Worker
and the origin middleware serve the original with no cookie. Cookies set
before are left to expire (30 days); the period before is not revisited.
Consequence: the raw per-arm counts (page-stats) now mix consenting and
non-consenting visitors in the original — only the GrowthBook analysis,
built on consenting exposures, compares like with like; the test screen says
so.

## R15 — Cookieless tests (2026-10-20, supersedes R1, R10 and R14)

**Finding**: with consent required before assignment (R14), a landing page —
first page of a visit, shown before the banner is answered — would show its
variants to almost nobody, and only to returning visitors who had already
seen the original.

**Decision (owner, option 1)**: nothing is stored on or read from the
visitor's device for A/B.

- **Assignment**: the version is drawn at random for every view, at the edge
  (`assignVariant(viewId, key, ids)`) and at the origin (middleware,
  random). No `tf-ab-*` cookie is read or set; old ones expire on their own.
- **View number**: the Worker already draws, for every HTML response, a
  random salt (8 bytes, base64url, 11 characters) that it puts inside the
  signed form token (`pageId.issuedAt.salt`). That salt is the view number:
  the exposure carries it, and the renderer's `/api/leads` reads it from the
  verified token and sends it to the CMS for attribution. Nothing new is
  written to the page or the device; a forged number fails the signature.
- **Exposures**: one per view of a page under test (crawlers excluded), same
  queue, same intake; the intake now checks the view-number format instead
  of a UUID. Storage names stay (`visitor_id` holds the view number) — no
  migration.
- **GrowthBook**: unchanged; its unit becomes the view (identifier type
  description updated).
- **Removed**: `tf-visitor`, the consent checks of R14 at the edge, the
  origin and the lead route, `consentChoice()`; the admin notes about consent
  and the banner. `/mesure-audience` stays as an information page without a
  « your choice » section.
- **008's stickiness (its FR-005) is withdrawn**: a reload may show the other
  version. Accepted: landing pages are mostly seen once, and both versions
  are affected alike. Repeat views count several times (unit = view).

**Rejected**: consent before assignment (R14 — landing pages untestable);
per-visitor cookie for everyone (R1 — the CNIL tool excludes A/B cohorts from
the consent exemption); per-view number in a cookie or local storage (device
storage again).

**Legal note**: article 82 governs reading/writing on the device; with none,
neither consent nor its exemption is involved. The data kept (random view
number, version, link to a lead) stays minimal and is described in the
privacy policy. To be confirmed by the owner/DPO.

## Sources

- GrowthBook config file (data sources in `config.yml`, env interpolation):
  https://docs.growthbook.io/self-host/config
- GrowthBook REST API, as of tag v5.0.1:
  https://raw.githubusercontent.com/growthbook/growthbook/v5.0.1/packages/back-end/generated/spec.yaml
- GrowthBook releases (5.0.1 deployed, 5.1.0 latest on 2026-10-19):
  https://github.com/growthbook/growthbook/releases
- CNIL — developer guide sheet 16 « analytics » (exemption conditions:
  information, objection, audience measurement and A/B tests only, no
  cross-referencing, one publisher, 13 months): https://www.cnil.fr/fr/node/677
- CNIL — lifetime not extended by later visits, 25-month retention:
  https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience
- CNIL — self-assessment tool for exempted audience measurement (July 2025),
  to run before switching exposures on:
  https://cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf
- Breaking an A/B test into assignment / measurement / cross-referencing when
  assessing the exemption: https://www.donneespersonnelles.fr/test-ab-consentement-traceurs
