# Feature Specification: Statistical significance for page A/B tests

**Feature Branch**: `018-ab-significance`

**Created**: 2026-10-09

**Status**: Deployed (2026-10-22, measurement on)

**Input**: User description: "Puisque nous décidons de conserver l'outil [GrowthBook], créer l'affichage de la significativité statistique sur les A/B tests de pages." Legal basis first chosen: the CNIL audience-measurement exemption (2026-10-09); then, on 2026-10-20, the cookie banner's consent (the CNIL self-assessment tool of July 2025 excludes A/B cohorts from the exemption — `docs/mesure-ab-cnil.fr.md`), and finally, the same day, **cookieless tests**: nothing is stored on or read from the visitor's device, so neither the exemption nor consent is involved (landing pages must be testable from the first view). Exposures deleted 30 days after the test ends. Context: `docs/ab-testing-exploration.md` §8 (GrowthBook's real role, decision 8.4 to keep it and wire it).

## Context

Page A/B tests (008) let an operator compare whole-page variants. The test
screen shows, per variant, the number of visits and of conversions (leads)
over a period. It shows nothing that says whether the difference between
variants is real or just chance. With small numbers — « B : 12 leads, A : 9 » —
an operator is very likely to promote a variant that is not actually better.

GrowthBook, already deployed, has a statistics engine that answers exactly
that question, but it is not connected to anything: Trefle records only daily
totals per page, while a statistics engine needs to know, for each visitor,
which variant they saw and whether they converted. Today no visitor
identifier exists and tests are not declared in GrowthBook.

This feature records who saw which variant and who converted (anonymously),
connects GrowthBook to that data, and shows its verdict on the test screen,
next to the existing counts.

## Clarifications

### Session 2026-10-09

- Q: Legal basis for recording which variant each (anonymous) visitor saw? → A: ~~Audience-measurement exemption (no consent)~~ — **superseded on 2026-10-20 by consent** (see that session). The other conditions stay: strictly statistical use for Trefle's own tests, no cross-site use, identifier lifetime ≤ 13 months, exposure data deleted 30 days after the test ends.

### Session 2026-10-11

Decisions taken while studying the edge HTML cache (`docs/cdn-cache-exploration.fr.md` §11, feature 020):

- Q: Which exposures are recorded? → A: **Only the first exposure of an identifier to a test.** The engine uses the first exposure per visitor; repeat views add volume and nothing to the analysis.
- Q: Who writes exposures once page HTML is served from the edge cache? → A: **The edge layer (020), not a browser beacon.** It runs on every view anyway, needs no JavaScript, is not blocked by ad blockers and involves no third party. Exposures reach the database in batches (one write per batch, delay up to a few minutes), never one server write per view.
- Q: Can the engine's own database receive exposures directly, or can a tag manager (GTM) count them? → A: **No to both.** The engine stores only its configuration and results; it reads exposures from Trefle's database. A tag-manager tag is blocked by ad blockers, depends on each client's container and involves a third party, which the audience-measurement exemption excludes.
- Q: May exposures be sampled? → A: **No.** A missing exposure would leave a converted visitor out of the experiment and bias the verdict; the sampled store used for page-view counters (020) is not used for exposures.

### Session 2026-10-19

- Q: How does a visitor object to the measurement? → A: ~~A fixed page with an objection button~~ — **superseded on 2026-10-20**: consent and its withdrawal go through the cookie banner; the fixed page `/mesure-audience` stays, as information only.
- Q: What minimum sample before a variant can be called better or worse? → A: **At least 30 leads and 300 visitors in each compared variant** (the challenger and the original); below that the verdict is « Pas encore assez de données ».
- Q: While the edge cache is switched off (incident fallback), does the server record exposures itself? → A: **No.** Only the edge layer writes exposures; visitors who arrive during a cut are left out of the analysis (their leads stay in the existing totals). Cuts are rare, short and affect every variant alike.

### Session 2026-10-20

- Q: Which legal basis, now that the CNIL self-assessment tool (July 2025) excludes « toute création de cohorte d'utilisateurs pour leur présenter des contenus différenciés, […] aléatoire » and form-linked tagging from the consent exemption? → A: ~~**Consent (option A)**~~ — **superseded the same day by cookieless tests (next answer)**: a visitor would have been measured only after accepting the cookie banner (007, `tf_consent=accepted`) on that domain; withdrawing consent (the banner's revisit control) stops the measurement and removes the identifier. Domains without the banner are not measured. `/mesure-audience` becomes an information page (no objection button). Assessment: `docs/mesure-ab-cnil.fr.md`.
- Q: With consent required before any assignment, a landing page — the first page of a visit, seen before the banner is answered — shows its variants to almost nobody. What then? → A: **Cookieless tests (owner, option 1)**: nothing is read from or written to the visitor's device. The variant is drawn at random for every view; each view gets a random number carried only inside the page's signed form token; exposures are recorded per view and a lead is attributed through that number. No consent is needed, the banner plays no part, and a variant is shown from the first visit. Supersedes the two consent answers (just above and below) and 008's per-visitor stickiness (FR-005 of 008): a reload may show the other version. Unit of analysis = one view.
- Q: The A/B assignment cookie `tf-ab-*` (008) also sorts visitors into cohorts shown different content: what from now on? → A: ~~**Consent too**~~ — **superseded by cookieless tests (previous answer)**: (past cookies are left to expire, nothing is done about the period before): a visitor who has not accepted the cookie banner always sees the original and gets no variant cookie; only those who accept are split between variants (FR-018).
- Q: The simulation (research R9) shows that with the screen checked every hour, an instant 95 % verdict calls identical variants winners in 6.6 % of runs (SC-001 asks < 5 %). Which rule? → A: **A better/worse verdict is announced only once it has held for 72 hours in a row**; until then the screen shows a trend « à confirmer » with the date it would be confirmed. Simulated: 1.4 % false winners, a real +50 % lift detected in 60.6 % of 4-week tests (2,000 visitors per variant).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator knows whether a variant really wins (Priority: P1)

An operator opens a running test on a caterer's landing page. Next to each
variant's visits and leads, the screen now says, for each challenger, how
likely it is to beat the original (« Probabilité de battre l'original : 87 % »),
the likely range of the improvement (« entre −4 % et +31 % »), and a plain
verdict: « Pas encore assez de données », « Pas de différence nette pour
l'instant », « B est probablement meilleure », or « B est probablement moins
bonne ». The operator decides to wait instead of promoting B too early.

**Why this priority**: This is the feature — the decision to promote a variant
is the reason A/B tests exist, and raw counts alone lead to wrong decisions.

**Independent Test**: Run a test with seeded traffic where B clearly converts
better and one where A and B are identical; the first shows a high probability
and « B est probablement meilleure », the second stays at « Pas de différence
nette » or « Pas encore assez de données ».

**Acceptance Scenarios**:

1. **Given** a running test with enough visitors and a clear difference,
   **When** the operator opens the test, **Then** each challenger shows its
   probability of beating the original, the range of the improvement, and a
   verdict in plain French.
2. **Given** a test that has just started, **When** the operator opens it,
   **Then** the verdict is « Pas encore assez de données » with what is
   missing (« encore environ N visiteurs par variante »), and no probability
   is presented as conclusive.
3. **Given** a test with three variants (original + 2 challengers), **When**
   the operator opens it, **Then** each challenger is compared with the
   original.
4. **Given** the statistics engine cannot be reached, **When** the operator
   opens the test, **Then** the visits and leads counts show exactly as today
   with « Analyse statistique momentanément indisponible ».
5. **Given** the test list (« Tests A/B »), **When** the operator scans it,
   **Then** each running test shows its current verdict in one line.

---

### User Story 2 - The operator is warned when the test itself is broken (Priority: P2)

Visitors are supposed to be split evenly between variants. If the split is
clearly uneven — a sign that something is wrong (a caching or assignment
problem, bots hitting one variant) — the test screen shows a warning that the
results cannot be trusted until it is fixed, instead of a verdict.

**Why this priority**: A broken split silently invalidates every number on the
screen; once A/B decisions move to the edge (feature 020),
this is the main safety net.

**Independent Test**: Seed exposures with a 70/30 split on a 50/50 test; the
screen shows the warning and no « probablement meilleure » verdict.

**Acceptance Scenarios**:

1. **Given** a 50/50 test whose recorded visitors split 70/30 on a large
   enough sample, **When** the operator opens it, **Then** a warning
   « Répartition des visiteurs anormale : les résultats ne sont pas fiables »
   replaces the verdicts.
2. **Given** a normal split, **Then** no warning appears.

---

### User Story 3 - Visitors' privacy is respected (Priority: P1)

A visitor lands on a page under test and sees one of its versions, drawn at
random for this view. Nothing is stored on or read from their device. A
random number, valid for this view only and carried in the page's form,
lets the system count the view once and, if they send the form, know which
version the request came from — nothing else. Thirty days after a test ends,
everything recorded about which view saw what is deleted.

**Why this priority**: tests must work on landing pages (first view, before
any banner answer) without a legal basis tied to the device; it ships with
the feature, not later.

**Independent Test**: Visit a page under test: no cookie set or needed, one
exposure (view number, test, variant, time) recorded per view; send the form:
the lead is attributed to that view's variant; end a test, advance the clock
30 days, check its exposure data is gone.

**Acceptance Scenarios**:

1. **Given** a page without a running test, **When** a visitor loads it,
   **Then** nothing is recorded for A/B and no A/B cookie is set.
2. **Given** a page under test, **When** a visitor loads it (first visit
   included, whatever their cookie-banner choice), **Then** a version drawn at
   random is shown, no cookie is set, and one exposure (view number, test,
   variant, time) is recorded; each later view is a new draw and a new
   exposure.
3. **Given** a view of a page under test, **When** the visitor sends its form,
   **Then** the lead is attributed to that view's number and variant.
4. **Given** a test ended 30 days ago, **When** the retention sweep runs,
   **Then** all its exposures and conversion attributions are deleted; its
   aggregated results (counts, final verdict) remain.
5. **Given** any screen in the admin, **Then** no per-view data is shown
   (008 FR-009 still holds).

---

### Edge Cases

- A test started before this feature: no exposure data exists for its past;
  the screen says « Analyse disponible pour les visites à partir du <date> »
  and analyses only from that date.
- The operator picks a sub-period with the period filter (010): counts follow
  the period as today; the statistical verdict always covers the whole test
  and says so.
- A lead submitted without a view number (the form was not served by the
  edge Worker — edge cut, direct submission): counted in the existing totals
  as today, not attributed in the analysis.
- Obvious bots (declared crawler user agents) are not recorded as exposures.
- A visitor sees the page several times, or reloads it: each view is a new
  random draw (they may see the other version) and a new exposure. The unit
  of analysis is the view, not the person; both versions are affected alike.
- A test is concluded or a variant promoted: the analysis is frozen at the
  conclusion time and stays visible on the concluded test.
- A lead is later erased (DSR erasure, consent withdrawal): its conversion
  attribution is erased with it.
- Page HTML is served from the edge cache (feature 020): the server does not
  see each view; exposures are written by the edge layer, in batches — this
  feature must not depend on where the exposure is written.
- The edge cache is switched off (incident fallback, 020): pages and A/B
  assignment (random per view, no cookie) fall back to the server, which
  records no exposure; views during the cut are not analysed, their leads
  count in the existing totals only.

## Requirements *(mandatory)*

### Functional Requirements

**Data collection**

- **FR-001**: (2026-10-20, cookieless) On a page with a running test, the
  version shown MUST be drawn at random for every view, and nothing MUST be
  stored on or read from the visitor's device for A/B purposes (no cookie,
  no local storage, no fingerprint). Each view of a page under test gets a
  random view number, carried only inside the page's signed form token.
- **FR-002**: Every view of a page under test MUST record one exposure: view
  number, test, version shown, time. Recording MUST NOT slow down or block the
  page, and MUST NOT cost the server one write per page view: exposures MAY
  reach the analysis in batches, up to a few minutes late. Every exposure MUST
  be kept (no sampling).
- **FR-003**: When a lead form served with a view number is submitted, the
  system MUST attribute that lead to the view number and to the version shown.
- **FR-004**: Declared crawlers MUST NOT be recorded as exposures.
- **FR-005**: Exposures MUST be recorded with the same test and variant
  identifiers the statistics engine uses, whichever part of the system writes
  them (the edge layer since 020).

**Privacy (cookieless, since 2026-10-20)**

- **FR-006**: The A/B tests and their measurement MUST NOT depend on the
  cookie banner (nothing is stored on the device). Every domain MUST serve,
  at the same fixed address, a page describing the tests and their
  measurement (purpose, view number, nothing stored on the device, retention);
  the privacy policy links to it.
- **FR-007**: Exposures and conversion attributions MUST be deleted 30 days
  after their test ends (concluded or promoted), by the existing retention
  sweep; aggregated results MUST be kept.
- **FR-008**: Erasing a lead (DSR, consent withdrawal) MUST erase its
  conversion attribution.
- **FR-009**: No admin screen, export or API available to operators MUST
  expose per-view rows (008 FR-009 extended to the new data).
- **FR-010**: The data MUST be used only for Trefle's own A/B test analysis:
  not combined with lead data beyond the attribution in FR-003, not shared
  with third parties, not used across sites.

**Analysis**

- **FR-011**: Every test started from now on MUST be declared to the
  statistics engine with its variants when it starts, and closed when it is
  concluded.
- **FR-012**: The analysis MUST be refreshed automatically at least every hour
  while a test runs, and an operator MUST be able to refresh it on demand.
- **FR-013**: For each challenger the test screen MUST show: probability of
  beating the original, range of the relative improvement, and one verdict
  among « Pas encore assez de données » (with an estimate of what is missing),
  « Pas de différence nette pour l'instant », « <variante> est probablement
  meilleure », « <variante> est probablement moins bonne ». A variant is
  called « probablement meilleure / moins bonne » only at ≥ 95 %
  probability (or ≤ 5 %), only once the minimum sample is reached (at
  least 30 leads and 300 views — recorded exposures — in both the
  challenger and the original), and only once that reading has held for 72
  hours in a row; before that the screen shows « Tendance : <variante> semble
  meilleure / moins bonne (à confirmer le <date>) ». « Pas encore assez de
  données » states what is missing against that minimum.
- **FR-014**: When the split of views deviates significantly from the planned
  split, the screen MUST show the warning of US2 instead of verdicts.
- **FR-015**: The test list MUST show each running test's verdict (or warning)
  in one line.
- **FR-016**: The existing counts (visits, conversions, period filter) MUST
  keep working exactly as today, including when the statistics engine is
  unavailable; the verdict always covers the whole test and says so when a
  sub-period is selected.
- **FR-018**: (2026-10-20, cookieless) The A/B assignment of 008 MUST draw
  the version at random for every view, at the edge and at the origin, with
  no cookie, whatever the visitor's cookie-banner choice (008's per-visitor
  stickiness is withdrawn). Variant cookies set before are left to expire.
- **FR-017**: The primary metric is the submitted lead (the existing
  « Conversions »); confirmed leads (double opt-in, 006) MUST be available as
  a secondary metric in the analysis.

### Key Entities

- **View number**: random value drawn for one view of a page under test,
  carried only in that page's signed form token; never stored on the device.
- **Exposure**: one view of a variant of a running test (view number, time). Deleted 30 days after the test ends.
- **Conversion attribution**: link between a lead and the view number and
  variant that produced it. Deleted with the exposures, or with the lead.
- **Test analysis**: per challenger, probability to beat the original,
  improvement range, verdict, split-health flag, last refresh time; the last
  one is kept after the test ends.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On seeded tests, a clear winner (true conversion rate +50 %,
  2,000 visitors per variant) is reported « probablement meilleure », and
  identical variants are never reported as a winner in at least 95 % of
  simulated runs.
- **SC-002**: An operator can read the verdict of a running test in under
  10 seconds from opening it, without any statistics vocabulary beyond the
  probability.
- **SC-003**: A 70/30 split on a 50/50 test with ≥ 1,000 visitors triggers the
  split warning in 100% of cases; a normal split never does in the test set.
- **SC-004**: Pages under test show no measurable loading regression compared
  with before this feature (same measure as 008 SC-008).
- **SC-005**: 100% of exposures and attributions of a test are gone 31 days
  after it ends; no A/B cookie is ever set on a visitor's device.
- **SC-006**: The analysis shown is never older than 1 hour while a test runs
  (or the screen says when it was last refreshed and why it is older).

## Assumptions

- **Statistics engine**: GrowthBook, already deployed (decision of
  2026-10-09, `docs/ab-testing-exploration.md` §8.4), reading the Trefle
  database through a read-only access; its default analysis (Bayesian
  « chance to win », sample-ratio-mismatch check) is the method — this spec
  describes what the operator sees, not the formulas.
- **Legal basis**: nothing is stored on or read from the device, so the
  ePrivacy rule on trackers (article 82) and its consent exemption do not come
  into play (to be confirmed by the user/DPO; `docs/mesure-ab-cnil.fr.md`).
  The data kept — a random view number, the version, and, for a lead, the
  link to it — is described in the privacy policy, which links to
  `/mesure-audience`. Measured on every view, so verdicts come as fast as the
  traffic allows.
- **Past tests**: no backfill; analysis starts at deployment.
- **Edge programme**: 020 serves page HTML (and A/B assignment) from the
  edge on every host since 2026-10-12. The edge layer records first exposures
  and sends them in batches to the intake reserved for this feature, which
  answers « not found » and receives nothing until 018 ships (exposure
  recording switched off at the edge). Block-level tests (later) reuse the
  same exposure data.
- **Out of scope**: block-level tests, targeting/segments, multiple
  simultaneous metrics beyond FR-017, sequential-testing configuration
  beyond the engine's defaults, showing results anywhere outside the admin.
