# Feature Specification: Page A/B testing

**Feature Branch**: `008-ab-testing`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Add A/B testing for published landing pages.
An operator (editor/marketer) can create one or more challenger variants of
an existing published page and run them as a test against the original
page, with visitors to that page's URL split between the original and its
variants. While a test is running, the operator can review live performance
results (visits and conversions per variant) both from within the page they
are editing and from a single place that lists every test currently running
across the site. When a variant proves better, the operator can promote it
so its content becomes what every visitor sees going forward at that page's
URL, which ends the test. The feature must support more than two variants
competing at once, not just a single challenger against the original, from
the very first version."

## Context

Trefle publishes landing pages for lead capture (`001-landing-page-lead-capture`)
across a multi-domain model where each published page owns exactly one
(domain, path). This feature lets an operator compare several candidate
versions of a page's content against real visitor behaviour, then commit to
the one that performs best — without ever changing the page's public URL,
its accumulated leads, or anything another page's own settings (e.g. a
confirmation-page reference) point at.

This spec is deliberately implementation-agnostic (no specific
experimentation engine, editor, or hosting detail named) — a substantial
design exploration already happened ahead of this spec and is recorded
separately: `docs/ab-testing-exploration.md` covers the technical approach
(tool selection, caching/performance strategy, data model, rollout and
rollback sequencing), and the `growthbook` skill
(`.claude/skills/growthbook/`) covers the vendor evaluated for it. Neither
constrains this spec's requirements below, which describe the capability an
operator gets, not how it is built; `/speckit-plan` is where that technical
material gets applied.

Out of scope for this spec: configuring anything inside a third-party
experimentation tool's own UI; per-visitor-segment targeting (a test always
splits *all* of a page's visitors, not a chosen subset); testing a single
element within a page (e.g. only a headline) rather than the whole page —
this version tests whole-page variants only, matching a page's existing
authoring model.

## Clarifications

### Session 2026-09-16

- Q: What should happen for a visitor if the part of the system that
  assigns and measures variants is temporarily unavailable? → A: Always
  serve the original page, unaffected, and don't count the visit toward
  the test.
- Q: Does keeping a visitor's variant assignment consistent across visits
  require the visitor's cookie consent first, or can it happen
  automatically? → A: Strictly necessary — no consent required, same legal
  basis as other functional cookies already used by the product; distinct
  from and unaffected by any tracking/measurement consent choice.
- Q: Must a page's loading speed be explicitly protected while a test runs
  on it, with a guarantee stated in this spec? → A: Yes — add an explicit
  requirement and success criterion that a tested page's loading
  performance is not measurably degraded compared to the same page
  without a test running.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An operator creates and runs a multi-variant test (Priority: P1)

From a published page, an operator creates one or more challenger variants
— authored the same way as any other page's content — and starts a test.
From that moment, visitors loading the page's public URL are split between
the original and its variants, with no code change or deploy involved. A
visitor who returns to the page later keeps seeing the same variant they
were first shown, for as long as the test runs.

**Why this priority**: without the ability to create variants and actually
serve them to a split audience, no other part of this feature has anything
to act on. This is the floor.

**Independent Test**: from a published page, create two challenger
variants, start the test, load the page's URL from several distinct
visitor sessions, and confirm different sessions land on different
variants (original included) while a single session sees the same variant
on repeat visits.

**Acceptance Scenarios**:

1. **Given** a published page with no test running, **When** an operator
   creates a challenger variant and starts a test, **Then** the page's
   public URL immediately begins splitting visitors between the original
   and the challenger, without any deploy.
2. **Given** a running test with three variants (the original plus two
   challengers), **When** enough visitors load the page, **Then** all
   three are shown to a meaningfully split audience, not just two of the
   three.
3. **Given** a visitor has already been shown a specific variant during a
   running test, **When** that same visitor returns to the page's URL
   before the test ends, **Then** they see the same variant again, not a
   randomly reassigned one.
4. **Given** a page with a running test, **When** anyone loads the page's
   URL directly (no special link or parameter), **Then** they cannot tell
   from the URL alone that a test is running or which variant they landed
   on — the experience is a normal page.

---

### User Story 2 - An operator reviews live results from the page itself (Priority: P1)

While a test runs, the operator opens the page they are editing and sees,
without navigating anywhere else, how each variant — including the
original — is performing: visits and conversions per variant, updated as
data accrues.

**Why this priority**: an operator cannot make an informed decision about a
test they cannot see the results of. Running a test that cannot be observed
delivers no value on its own.

**Independent Test**: with a test running and some visitor activity
recorded, open the page being tested and confirm per-variant visit and
conversion figures are visible without leaving that page.

**Acceptance Scenarios**:

1. **Given** a running test with recorded visitor activity, **When** an
   operator opens the page being tested, **Then** they see visits and
   conversions broken down per variant, including the original.
2. **Given** a test that has just started with no visitor activity yet,
   **When** an operator opens the page, **Then** the results view shows
   all variants with zero activity rather than an error or a blank state.
3. **Given** results are being shown, **When** an operator views them,
   **Then** no individual visitor is identifiable from the data shown —
   only aggregate counts per variant.

---

### User Story 3 - An operator promotes a winner, or concludes without one (Priority: P1)

When an operator judges a variant is performing better, they promote it:
its content becomes what every visitor sees at the page's public URL going
forward, and the test ends. If no variant is clearly better, the operator
can instead end the test and keep the original, with the same one-step
simplicity. Either way, the variants that were not promoted are kept, not
discarded, so their content and results remain available for reference.

**Why this priority**: a test that can be observed but never acted upon
delivers no lasting value — this is the step that actually changes what
visitors see. Grouped at P1 with User Stories 1–2 because the three
together are the minimum flow that makes running a test worthwhile at all.

**Independent Test**: with a running test and visible results, promote a
challenger variant and confirm the page's public URL now serves that
content to every subsequent visitor, the test is marked concluded, and the
non-promoted variant is still viewable rather than gone. Separately, end
another test without promoting anything and confirm the original keeps
serving unchanged.

**Acceptance Scenarios**:

1. **Given** a running test, **When** an operator promotes a challenger
   variant, **Then** every visitor loading the page's URL from then on
   sees that variant's content, the test is marked concluded, and this
   takes effect on the same timescale as any other published-page content
   change already does.
2. **Given** a page whose variant was just promoted, **When** anything
   already pointed at that page (its existing leads, or another page
   referencing it) is checked, **Then** nothing about those references
   changed — only the page's visible content did.
3. **Given** a running test with no clearly better variant, **When** an
   operator ends the test without promoting any challenger, **Then** the
   original keeps serving unchanged and the test is marked concluded.
4. **Given** a test that has concluded (promoted or not), **When** an
   operator looks for the variants that did not win, **Then** their
   content and final results are still available, not deleted.

---

### User Story 4 - An operator sees every running test in one place (Priority: P2)

A dedicated area lists every test currently running across every page, each
with the same per-variant performance data available from the individual
page, so an operator overseeing several campaigns at once doesn't have to
open each page to know what's running and how it's doing.

**Why this priority**: valuable once more than one test runs at a time, but
User Stories 1–3 already deliver the full create → observe → conclude loop
for a single page's test on their own; this is a convenience at scale, not
a precondition for the feature to be useful.

**Independent Test**: with two tests running on two different pages, open
the dedicated area and confirm both appear with current per-variant
results, without opening either page individually.

**Acceptance Scenarios**:

1. **Given** two or more tests running on different pages, **When** an
   operator opens the dedicated area, **Then** every running test is
   listed with its own per-variant performance data.
2. **Given** no test is currently running anywhere, **When** an operator
   opens the dedicated area, **Then** it clearly shows there is nothing
   running, rather than appearing broken or empty by omission.
3. **Given** a test has concluded, **When** an operator opens the
   dedicated area, **Then** that test no longer appears among the running
   ones (its record remains reachable, per User Story 3's Scenario 4, just
   not in this "currently running" list).

---

### Edge Cases

- A page already has a running test — starting a second test on the same
  page before the first concludes is not allowed; the operator must
  conclude the current one first (see FR-004).
- An operator edits a page's own content directly while a test on that
  page is running — since the original is itself one of the variants being
  compared, this changes a live test arm mid-test. The system MUST make it
  clear a test is currently running whenever that page is being edited, so
  this isn't done unknowingly; it is not blocked outright (see FR-013).
- A visitor blocks or clears the mechanism the system uses to keep their
  variant consistent across visits (e.g. clears cookies) — they MAY be
  reassigned a variant on their next visit; this does not need to be
  prevented, only not required to persist beyond what a first-party,
  strictly-necessary preference already would (see FR-009).
- A search engine, or anyone without a direct operator-shared link,
  attempts to reach a challenger variant on its own — it MUST NOT be
  independently reachable; only the page under test has a public URL (see
  FR-010).
- A page with an active or past test is deleted — its variants and their
  recorded results MUST be handled by the same safeguards that already
  protect a page's leads and stats from silent loss on deletion (see
  FR-012).
- The part of the system that assigns visitors to variants or measures
  their results becomes temporarily unavailable — every visitor MUST still
  see the original page, fully working, and that visit MUST NOT be counted
  toward the test (see FR-016).
- A challenger variant that was never promoted still captured some
  conversions before the test concluded — that data MUST remain attached
  to it, not discarded or merged into the promoted variant's own figures
  (see FR-011).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An operator MUST be able to create one or more challenger
  variants of an existing published page, each authored through the same
  content-editing experience as any other page.
- **FR-002**: An operator MUST be able to start a test on a page that has
  at least one challenger variant, at which point the page's public URL
  begins splitting visitors across the original and every challenger
  variant defined at that time.
- **FR-003**: The system MUST support three or more variants (the original
  plus two or more challengers) competing in a single test — not only a
  single original-vs-one-challenger comparison — from the first version of
  this feature.
- **FR-004**: A page MUST have at most one running test at a time. Starting
  a new test on a page that already has one running MUST be rejected until
  the current one is concluded.
- **FR-005**: A visitor's variant assignment for a given running test MUST
  remain consistent across that visitor's repeat visits to the page's URL
  for the life of the test.
- **FR-006**: A visitor MUST NOT be able to tell, from the URL or from
  anything requested to load the page, that a test is running or which
  variant they were assigned — the page MUST behave like an ordinary page
  in every other respect.
- **FR-007**: An operator MUST be able to view, from within the page being
  tested, each variant's (including the original's) visit and conversion
  counts for the currently running test, updated as visitor activity
  accrues, without navigating elsewhere.
- **FR-008**: The system MUST provide a single place listing every test
  currently running across every page, each with the same per-variant
  results available from FR-007, and MUST clearly distinguish "nothing
  running" from an error.
- **FR-009**: Performance results shown to an operator (FR-007, FR-008)
  MUST only ever be aggregate counts per variant — no individual visitor
  MUST be identifiable from them.
- **FR-010**: An operator MUST be able to conclude a running test in one of
  two ways: promoting one challenger variant, or ending the test without
  promoting any variant. Promoting a variant MUST make its content what
  every subsequent visitor sees at the page's existing public URL, on the
  same timescale an ordinary published-page content change already takes
  effect; ending without promoting MUST leave the original serving
  unchanged. Either way MUST mark the test concluded.
- **FR-011**: Promoting a variant MUST NOT change the page's public URL,
  MUST NOT affect anything already pointing at that page (its accumulated
  leads, or another page referencing it), and MUST NOT discard the
  non-promoted variants or their recorded results — they remain reachable
  after the test concludes.
- **FR-012**: A challenger variant MUST NOT be independently reachable by a
  visitor or a search engine — only the page under test is publicly
  reachable at a URL; variants exist solely to be compared and eventually
  promoted into that URL's content.
- **FR-013**: Deleting a page that has an active or past test MUST be
  guarded against silently losing that page's variants or their recorded
  results, consistent with how the product already guards a page's leads
  and stats from silent loss on deletion.
- **FR-014**: While a page has a running test, the system MUST clearly
  indicate this to an operator editing that page's own content directly,
  since doing so changes a live test arm.
- **FR-015**: Creating, starting, reviewing, and concluding a test MUST be
  restricted to the same operators already permitted to edit and publish
  pages — no broader or narrower access is introduced by this feature.
- **FR-016**: If the part of the system that assigns visitors to variants
  or measures their results becomes temporarily unavailable, every visitor
  MUST still be served the original page's content, fully functional; that
  visit MUST NOT be counted toward the test's results.
- **FR-017**: The mechanism that keeps a visitor's variant assignment
  consistent across visits (FR-005) MUST be treated as strictly necessary
  to the page's core functioning and MUST NOT require the visitor's
  cookie-consent choice — it is distinct from, and unaffected by, any
  tracking/measurement consent choice recorded elsewhere on the same page.
- **FR-018**: A page's loading performance MUST NOT be measurably degraded
  by having a test running on it, compared to the same page without a
  test, consistent with the product's existing page-performance budget.

### Key Entities

- **Test**: a comparison, scoped to exactly one page, between that page's
  current content (the original) and one or more challenger variants,
  running until an operator concludes it either by promoting a variant or
  by ending it without one. A page has at most one running test at a time,
  and may have a history of past, concluded tests.
- **Variant**: one candidate version of a tested page's content — the
  original itself counts as a variant — carrying its own visit and
  conversion results for the test it belongs to. A variant that is not
  promoted is retained after its test concludes, not discarded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can go from "page is published" to "a multi-variant
  test is live and splitting visitors" in a single sitting, with zero code
  changes or deploys.
- **SC-002**: An operator can see a running test's per-variant results
  without leaving the page they are editing.
- **SC-003**: An operator overseeing several pages can see every currently
  running test from one place, without opening each page individually.
- **SC-004**: Promoting a variant changes what every new visitor sees at
  that page's URL on the same timescale an ordinary published-page edit
  already takes effect.
- **SC-005**: A visitor returning to a page during a running test sees the
  same variant on every visit, 100% of the time, for the life of that test.
- **SC-006**: Zero challenger variants are ever reachable independently of
  the page under test, verified by attempting direct/search access to one.
- **SC-007**: 100% of leads captured through any variant remain correctly
  attached to their originating record after the test concludes, regardless
  of which variant (if any) was promoted.
- **SC-008**: A page's loading performance shows no measurable regression
  while a test is running on it, compared to the same page measured
  without a test.

## Assumptions

- Multiple concurrent challenger variants (not just one) are supported
  from the first version, per the input description; three-or-more-way
  tests are a first-class case, not an afterthought (FR-003).
- Traffic is split evenly across a test's active variants; letting an
  operator set custom per-variant weights is a reasonable later extension,
  not required for this version.
- All of a test's variants are defined before the test starts; adding a
  challenger to an already-running test is out of scope — concluding the
  current test and starting a new one covers that need instead.
- A test always splits the entirety of a page's visitors; targeting a test
  to a chosen visitor segment is out of scope for this version.
- Any published page is eligible to be tested; nothing about a page's
  purpose or internal categorisation excludes it.
- The system does not enforce a minimum sample size or confidence
  threshold before allowing an operator to promote a variant — performance
  data is surfaced, and the decision to conclude is the operator's, the
  same way publishing decisions already work elsewhere in the product.
- Concluded tests and their non-promoted variants are retained
  indefinitely rather than automatically purged, consistent with how the
  product already treats page and lead data.
- This version tests whole-page content variants only; testing a single
  element within a page (e.g. one headline) while leaving the rest
  untouched is a reasonable later extension, not required here.
