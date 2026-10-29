# Feature Specification: Page HTML served from the edge cache

**Feature Branch**: `020-edge-html-cache`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Étudier la possibilité de mettre en cache Cloudflare du html de pages pour pouvoir augmenter le nombre de pages livrables par seconde tout en ne perdant aucune fonctionnalité." Study and decisions: `docs/cdn-cache-exploration.fr.md` §11 (2026-10-11). This feature replaces lots 2–4 of the edge programme (017 spec, Context).

## Context

Since 017, every Trefle host sits behind an edge network (Cloudflare) and
images and fonts are served from its cache. Page HTML is not: the server
renders every page view. Load tests on 2026-10-10 show the server saturates
at about **26 page views per second** (half the requests wait 10 s or more),
while the programme's target is **1,000 per second sustained, with peaks of
10,000 per second**.

Page HTML is not cached today because each response carries values specific
to one visit: the security policy's one-time value (002), the lead form's
anti-bot token (001), the A/B variant assigned to the visitor (008), and the
page view counted while rendering. Caching the HTML as is would break all
four.

This feature serves page HTML from the edge cache **without losing any of
them**: a small program at the edge adds the per-visit values to the cached
page on every view, assigns A/B variants there, and records views and A/B
exposures without the server having to work on each view. The server renders
each page only when its cached copy is missing or has been invalidated.

## Clarifications

### Session 2026-10-11

Decisions taken during the study (`docs/cdn-cache-exploration.fr.md` §11):

- Q: Caching rule only, or a program at the edge? → A: **A program at the edge runs on every view** and personalises the cached page (security one-time value, form token, A/B variant). A plain "cache everything" rule would break the security policy, the lead form, A/B tests and view counting.
- Q: How does the lead form get a fresh anti-bot token on a cached page? → A: **The edge signs it on every view**, in the same format the server checks today. The form keeps working without JavaScript.
- Q: How are page views counted? → A: **Recorded at the edge in an analytics store, added to the existing counters once per minute.** Counters in the admin may lag by a few minutes (typically one to two: views are summed per closed minute, once the analytics store has ingested them); the server must not do one write per view. At very high volume the store samples, so totals are precise estimates rather than exact counts — accepted for view counters.
- Q: How are A/B exposures recorded (for 018)? → A: **Through a lossless queue, delivered to the server in batches; only the first exposure of a visitor to a test.** Never sampled, never one write per view. Writing into the statistics engine's own database and counting through the tag manager (GTM) were rejected.
- Q: Running cost? → A: **Accepted**: about $0.35 per million page views beyond the 10 million included, plus a $5/month base.
- Q: Scope? → A: **One feature (020) for former lots 2–4**, delivered in reversible slices (see Assumptions).
- Q: May a "not found" answer for an unknown or inactive host be cached? → A: **Yes**, like any "not found": it is short-lived in practice because any domain change refreshes all cached pages (analysis I1).
- Q: How is a failed cache refresh reported? → A: **Retries, then an error-level log**, like a failed revalidation today; no admin display (analysis C1 — simpler; the 24-hour expiry bounds the impact).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pages stay fast during a traffic spike (Priority: P1)

A caterer's landing page is mentioned on television; thousands of visitors
arrive in the same minute. Every one of them gets the page in well under a
second. The server barely notices: it rendered the page once, and the edge
serves the copies.

**Why this priority**: This is the reason for the feature — today a spike
above ~26 page views per second makes pages take 10–20 s for everyone.

**Independent Test**: Run the load-test scenario on a published test page at
1,000 page views per second for 10 minutes, then 10,000 per second for one
minute; measure response times and count how many times the server rendered
the page.

**Acceptance Scenarios**:

1. **Given** a published page not under A/B test, **When** 1,000 page views
   per second arrive for 10 minutes, **Then** 95 % of them are answered in
   under 1 s, none fails, and the server renders the page fewer than 50
   times (SC-003).
2. **Given** the same page, **When** 10,000 page views per second arrive for
   one minute, **Then** no request fails and the server receives fewer than
   50 requests for that page.
3. **Given** a cached page, **When** the server is temporarily unreachable,
   **Then** visitors still get the last good version of the page.

---

### User Story 2 - Visitors and clients lose nothing (Priority: P1)

A visitor on a cached page sees exactly what they would see today: the
consent banner in the right language, the client's custom code (chat widget,
ad pixels) behaving as configured, the GTM events, the fonts and images. They
fill in the lead form, with or without JavaScript, and their lead is
accepted. The page's security policy is as strict as today, with a value that
is different on every view.

**Why this priority**: "Without losing any feature" is the stated condition;
a faster page that drops leads or weakens security is a regression.

**Independent Test**: Run the existing end-to-end suite against the stack
with the edge layer in front, and compare two views of the same page: same
content, different per-visit values.

**Acceptance Scenarios**:

1. **Given** a cached page, **When** two visitors load it, **Then** each
   response carries its own security one-time value and its own form token,
   and the page content is otherwise identical.
2. **Given** a cached page with the lead form, **When** a visitor submits it
   (JavaScript on or off) after a few seconds, **Then** the lead is accepted
   exactly as today.
3. **Given** a cached page, **When** a visitor submits the form in under
   2 seconds or more than 2 hours after loading it, **Then** it is refused
   exactly as today.
4. **Given** a page with custom code waiting for consent (014), **When** the
   visitor accepts cookies, **Then** the code runs without a reload, as
   today.
5. **Given** a domain with a GTM container (007), **When** a visitor loads a
   cached page, **Then** the same `page_view` / `lead_form_view` events are
   pushed as today.
6. **Given** a draft preview link, an unsubscribe link, a confirmation link
   or the form error page, **When** it is opened, **Then** it is never served
   from the cache and behaves as today.

---

### User Story 3 - Editors' changes appear right away (Priority: P1)

An editor publishes a change, unpublishes a page, replaces an image, changes
a domain's fonts or consent banner. Visitors see the change within seconds,
as they do today. After a new version of Trefle is deployed, no visitor gets
a page that refers to files of the previous version.

**Why this priority**: A cache that shows stale content after publishing
breaks the editors' basic workflow and erodes trust in the tool.

**Independent Test**: Publish a visible change on a cached page and reload it
from another browser; replace an image used on a cached page; deploy a new
build — in each case, check what visitors get within 30 seconds.

**Acceptance Scenarios**:

1. **Given** a cached page, **When** the editor publishes a change, **Then**
   visitors see the new version within 30 seconds.
2. **Given** a cached page, **When** the editor unpublishes it, **Then**
   visitors get the domain's "not found" behaviour within 30 seconds.
3. **Given** a path that answered "not found", **When** a page is published
   at that path, **Then** visitors see it within 30 seconds.
4. **Given** an image used on cached pages, **When** the editor replaces its
   file, **Then** no visitor gets a broken image on those pages.
5. **Given** a change to a domain's settings (fonts, banner, tag container)
   or to the shared banner translations, **When** it is saved, **Then** the
   affected pages show it within 30 seconds.
6. **Given** a new version of Trefle deployed, **When** visitors load any
   page, **Then** the page and its scripts all come from the new version.

---

### User Story 4 - Statistics keep counting without loading the server (Priority: P2)

The operator watches page visits and A/B test counts in the admin as today.
Every view served from the edge is counted, and counts appear within a few
minutes (typically one to two). The server no longer writes to the database on each view, and
views that arrive at the same moment are no longer lost.

**Why this priority**: Visit counts feed the A/B test screen and the
conversion rates; losing them would make tests unreadable. It ranks after
US1–US3 because a short counting delay is acceptable.

**Independent Test**: Send a known number of views to a page through the
edge, wait two minutes, and compare the admin's visit count with the number
sent.

**Acceptance Scenarios**:

1. **Given** N views of a page served from the edge, **When** three minutes
   have passed, **Then** the page's visit count has grown by N (within 1 %).
2. **Given** many simultaneous views, **Then** none is lost by the counter
   itself.
3. **Given** the analytics store is unavailable for a while, **Then** pages
   are still served normally and counting resumes afterwards.

---

### User Story 5 - A/B tests keep working at the edge (Priority: P2)

An operator runs a page A/B test. Each visitor is assigned a variant on
their first visit and keeps it on later visits; the split follows the
planned proportions; each variant is served from the cache like any other
page. When the statistics feature (018) is in place, each visitor's first
exposure to the test is recorded for the analysis, completely and without
loading the server on each view.

**Why this priority**: Pages under test are precisely the pages that receive
campaign traffic; leaving them uncached would leave the spike problem where
it matters most. Ranked after US4 because the first slices can serve pages
under test from the server, as today.

**Independent Test**: Start a 50/50 test, send 10,000 fresh visitors and
check the split and that returning visitors keep their variant; check that
both variants are served from the cache and that the variant identifier does
not appear in response headers.

**Acceptance Scenarios**:

1. **Given** a running test, **When** a new visitor arrives, **Then** they get
   a variant according to the planned split and keep it on later visits
   (30 days, as today).
2. **Given** 10,000 new visitors on a 50/50 test, **Then** each variant gets
   between 48 % and 52 % of them.
3. **Given** a running test, **When** a variant is shown, **Then** it comes
   from the cache, and nothing in the response reveals which variant it is
   beyond what the page content itself shows.
4. **Given** the test is concluded or a variant promoted, **When** visitors
   arrive, **Then** within 30 seconds they get the outcome page, as today.
5. **Given** 018 in place and a visitor who has not objected, **When** they
   see a page under test for the first time, **Then** one exposure is
   recorded and reaches the analysis within a few minutes; later views add
   none; a visitor who objected gets a variant but no exposure.

---

### User Story 6 - Safe fallback and rollback (Priority: P3)

If the edge program fails or is switched off, pages are rendered by the
server exactly as they are today. Turning the edge cache off is a single
documented operation.

**Why this priority**: The constitution requires every change to have an
obvious undo; a failing edge layer must degrade to today's behaviour, not to
an outage.

**Independent Test**: Make the edge program fail on purpose (or detach it)
and check that pages, forms and A/B tests work as today.

**Acceptance Scenarios**:

1. **Given** the edge program raises an error on a request, **Then** that
   request is served by the server as today.
2. **Given** the edge cache switched off by the documented operation,
   **Then** all pages behave as before this feature, with no deployment of
   the server needed.
3. **Given** the local development and end-to-end stacks, **Then** they keep
   working without the edge layer.

---

### Edge Cases

- **Tracking parameters** (`utm_*`, `gclid`, `fbclid`…): pages with and
  without them share the same cached copy; the lead still records the UTM
  values as today.
- **Framework navigation requests** (the renderer's internal data requests on
  the same address) are never cached nor served as HTML.
- **Unknown or inactive host**: answers "not found" as today; that answer
  may be cached like any "not found" and is dropped when a domain is
  activated or changed.
- **"Not found" answers**: cached briefly, and dropped as soon as a page is
  published on that domain.
- **Server errors**: never cached; if a good copy exists, it is served
  instead.
- **Visitor with cookies blocked** on a page under test: gets a random
  variant on each visit and no exposure is recorded — same as today's
  behaviour for the variant.
- **Declared crawlers**: served from the cache like anyone; not recorded as
  A/B exposures (018 FR-004).
- **Test starting or ending**: the page's cached copy switches between
  "plain page" and "page under test" within 30 seconds.
- **Very large page** (above the edge's cacheable size): served by the
  server, as today.
- **Same path on two client domains**: always two separate cached copies.
- **Image replaced while its old file is already deleted**: the pages using
  it are refreshed in the same operation (US3 scenario 4).
- **Admin, image, asset, statistics-engine hosts and the lead and webhook
  endpoints**: not handled by the edge program; unchanged.

## Requirements *(mandatory)*

### Functional Requirements

**Serving from the cache**

- **FR-001**: The system MUST serve published pages (plain pages and A/B
  variants) from the edge cache, rendering a page on the server only when
  its cached copy is missing or invalidated.
- **FR-002**: Cached copies MUST be separate per host and per path, and MUST
  NOT depend on tracking query parameters.
- **FR-003**: The following MUST never be served from the cache: draft
  previews, unsubscribe, opt-in confirmation, post-submission confirmation
  and form-error pages, every endpoint (lead intake, webhooks, vitals,
  errors), the framework's internal navigation requests, any method other
  than reading a page, and server errors. A "not found" answer (including
  for an unknown or inactive host) may be cached like a page and is dropped
  when the domain changes.
- **FR-004**: When the server cannot answer and a cached copy exists, the
  system SHOULD serve that copy rather than an error.

**Per-visit values**

- **FR-005**: Every page response MUST carry a security-policy one-time value
  unique to that response, applied consistently to everything in the page
  that uses it (framework scripts, the client's custom code, the consent
  runner). The security policy MUST stay as strict as today (002, 014).
- **FR-006**: Every page response containing the lead form MUST carry a
  freshly issued anti-bot token, accepted by the existing lead-intake checks
  unchanged (minimum 2 s, maximum 2 h), with the form still working without
  JavaScript.
- **FR-007**: Apart from the values in FR-005 and FR-006 and the A/B choice in
  FR-015, two responses for the same page MUST be identical.
- **FR-008**: Responses served to visitors MUST NOT be stored by browsers or
  intermediate caches (each carries one-time values).

**Freshness**

- **FR-009**: Publishing, unpublishing or changing a page MUST make the
  change visible to visitors within 30 seconds, including a page newly
  published at a path that previously answered "not found".
- **FR-010**: Replacing a media file MUST refresh every cached page that uses
  it in the same operation, so that no visitor gets a broken image.
- **FR-011**: Changing a domain's settings, its fonts, or the shared consent
  banner translations MUST refresh the affected cached pages within
  30 seconds.
- **FR-012**: Deploying a new version of the renderer MUST refresh all cached
  pages, so that no page refers to files of a previous version.
- **FR-013**: A failed refresh MUST be retried and, if it still fails, logged
  at error level (the same visibility as a failed revalidation today), and
  cached copies MUST expire on their own within a bounded time
  (at most 24 hours) even without a refresh.

**A/B tests**

- **FR-014**: The edge MUST assign variants with the same rules as today:
  planned split, sticky for 30 days through the existing per-test cookie,
  a new test never inheriting a previous test's cookie (008).
- **FR-015**: Each variant MUST be served from the cache like any other page;
  the list of running tests used at the edge MUST reflect a start, stop or
  promotion within 30 seconds.
- **FR-016**: Variant assignment MUST use one shared implementation for the
  server path and the edge path.
- **FR-017**: Response headers MUST NOT reveal the assigned variant (removes
  the residual header leak documented in 008).

**Counting**

- **FR-018**: Every page view served MUST be counted in the existing per-page
  daily visit counts, within 3 minutes, without one server write per view.
  Simultaneous views MUST NOT be lost by the counter.
- **FR-019**: When 018 is in place, the first exposure of a non-objecting
  identifier to a running test MUST be recorded and delivered to the server
  in batches, without loss or sampling, within a few minutes (018 FR-002,
  FR-005). Declared crawlers MUST NOT be recorded.
- **FR-020**: A failure of counting or exposure recording MUST NOT affect
  page delivery.

**Fallback and operations**

- **FR-021**: If the edge program fails on a request, that request MUST be
  served by the server with today's behaviour.
- **FR-022**: The server MUST keep today's behaviour for requests that do not
  come from the edge program (local development, end-to-end tests,
  fallback), and MUST accept the "edge" rendering mode only from the edge
  program.
- **FR-023**: Turning the edge cache off MUST be one documented operation,
  without redeploying the server.
- **FR-024**: The edge configuration and program MUST be kept as code in the
  repository and applied by script (constitution, "Edge").
- **FR-025**: The admin, image, asset and statistics-engine hosts and the
  lead and webhook endpoints MUST NOT go through the edge program.

### Key Entities

- **Cached page copy**: the rendered HTML of one page (or variant) for one
  host and path, identical for every visitor, tagged with its page and
  domain so it can be refreshed precisely.
- **Per-visit values**: security one-time value, form token, A/B assignment
  — added at the edge, never stored in the cached copy.
- **Running-test list**: the tests currently running per domain and path,
  with their variants and split, published by the server for the edge.
- **View record**: one page view (page, day) recorded at the edge, summed
  into the existing daily visit counts.
- **Exposure** (018): first showing of a variant of a test to an anonymous
  identifier; delivered in batches to the server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A published page sustains 1,000 page views per second for
  10 minutes with 95 % of responses under 1 s and no failed request.
- **SC-002**: A published page absorbs 10,000 page views per second for one
  minute with no failed request.
- **SC-003**: During SC-001, the server renders the test page fewer than
  50 times.
- **SC-004**: The full existing end-to-end suite passes through the edge
  layer, and lead submissions during SC-001 are all accepted.
- **SC-005**: Among 1,000 responses for the same page, all security one-time
  values and all form tokens are distinct.
- **SC-006**: In 10 out of 10 trials, a published change is visible to a
  fresh visitor within 30 seconds; after a deployment, 0 pages refer to a
  previous version's files.
- **SC-007**: After a known number of views, the admin's visit count matches
  it within 1 %, within 3 minutes.
- **SC-008**: On a 50/50 test with 10,000 new visitors, each variant gets
  48–52 %, and 100 % of returning visitors keep their variant.
- **SC-009**: Monthly edge cost stays within the accepted rate (about $0.35
  per million page views beyond the included 10 million, plus the $5 base).

## Assumptions

- **Platform**: Cloudflare (017), with its paid edge-program plan; the zone
  itself stays on the Free plan unless 017's documented trigger is met.
- **Slices** (constitution III, each reversible on its own):
  1. server "edge" rendering mode (fixed placeholder one-time value, no A/B,
     no cookie) and batch intake for view counts — no visible change;
  2. edge program: per-visit values, view recording, cached pages with
     refresh on publish and deploy; pages under test still rendered by the
     server as today;
  3. A/B assignment and exposure recording at the edge, pages under test
     cached; load tests at 1,000/s and 10,000/s.
- **Constitution**: the "Edge" bullet ("page HTML is not cached at the edge
  until an amendment allows it") and Principle II's list of justified
  additions are amended before the edge first caches page HTML — on the test
  host, at the start of slice 2 — with real hosts following at go-live.
- **018 ordering**: independent. If 018 ships first, the server records first
  exposures itself through the same batch intake (batches of one); slice 3
  moves recording to the edge without changing the data.
- **Block-level A/B tests** (later feature): the edge program is built to
  select fragments within a page as well as whole pages, but block-level
  tests themselves are out of scope.
- **Load generation**: 10,000 page views per second cannot come from one
  laptop (2026-10-10 runs were capped by its downlink); SC-002 uses a
  distributed load generator.
- **Privacy**: no new personal data. View records carry no visitor
  identifier; exposures are 018's data under 018's legal basis. Cloudflare is
  already a declared processor (017).
- **Out of scope**: changing what pages contain, the lead-intake checks, the
  admin, image or asset caching (017), and moving the zone to a paid plan.
