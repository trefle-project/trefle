# Phase 0 Research: Page A/B testing

## 1. Bucketing MUST happen via a route-param rewrite, never `cookies()`/`headers()`/`searchParams` in the rendered page

**Decision**: A running test's bucket decision is made entirely in
`apps/web/src/middleware.ts` (cookie read/write, deterministic hash), which
then `NextResponse.rewrite()`s the request to a new route,
`apps/web/src/app/ab-variant/[pageId]/page.tsx`, that resolves its content purely
from `params.pageId` — a Next.js dynamic route **parameter**, not
`searchParams`, `cookies()`, or `headers()`.

**Rationale**: `apps/web/next.config.ts` does not set `cacheComponents:
true`, so this project is on Next's classic (pre-Cache-Components) caching
model — confirmed against the bundled docs
(`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`),
which lists `cookies()`, `headers()`, and `searchParams` together as
Dynamic APIs, with Suspense-boundary partial-rendering as the *only*
escape hatch, and that escape hatch requires Cache Components. Without it,
using any of the three anywhere in a route's render tree makes the whole
route dynamic on every request — no partial exception. This directly
threatens FR-018/SC-008 (no performance regression) and, without care,
would regress *every* page's caching, not only tested ones, since these
are read inside the single shared render path (`[[...slug]]/page.tsx`)
every request goes through.

Route **params**, in contrast, are exactly what `[[...slug]]/page.tsx`
already reads today (`params.slug`) under `export const revalidate = 3600;
export const dynamicParams = true;` — reading them does not opt a route out
of ISR; each distinct param value is its own cache entry, generated on
first request and served from cache after. This is the same mechanism
`(preview)/preview/[pageId]/page.tsx` already uses to fetch a page purely
by id, independent of domain/path resolution — `ab-variant/[pageId]` reuses that
exact shape (id-keyed fetch, `PageShell`/`splitAroundForm`/`sanitizeHtml`
render pipeline), the difference being it serves already-published variant
content instead of a signed-token draft preview.

Net effect: a page with **no** running test is completely untouched — its
request never enters the rewrite branch, so this feature adds zero
render-path risk to the ~sitewide majority of pages that are never under
test. A page **with** a running test gets `N` (variant count) independent,
normally-cacheable ISR entries instead of one — the bounded cost already
identified in `docs/ab-testing-exploration.md` §3, now backed by a
concrete, doc-verified mechanism rather than a general intention.

**Alternatives considered**: Reading a bucket cookie or `searchParams`
directly inside `[[...slug]]/page.tsx` — rejected outright per the finding
above (would make the shared route dynamic for every page, not just tested
ones). Adopting Cache Components (`cacheComponents: true`) to use its
Suspense-island escape hatch instead — rejected as disproportionate: it is
a project-wide rendering-model change with its own migration cost
(`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`),
not something to take on as a side effect of one feature, when the
route-param rewrite achieves the same caching goal with a strictly smaller,
fully-contained blast radius. (Cache Components remains the natural choice
*if* a future in-page, sub-page-fragment test — the "Option B" granularity
noted as out of scope in spec.md's Context — is ever built; not needed for
this whole-page version.)

---

## 2. The "which paths currently have a running test" lookup middleware needs

**Decision**: `apps/web/src/lib/ab-testing/active-tests.ts` exposes a
function returning the set of currently-running tests (keyed by domain +
path, with each variant's page id), refreshed by an explicit revalidation
webhook — `apps/cms/src/hooks/experiments-revalidate.ts` (an `afterChange`
hook on the `experiments` collection, firing when a test starts or
concludes) calling a new `apps/web/src/app/api/experiments-revalidate/route.ts`
endpoint, the same shape `pages-revalidate.ts`/`pageRevalidate` already use
for published-page content changes.

**Rationale**: Middleware runs on every request regardless of any route's
own cache state (it executes before Next's route-cache decision, not as
part of it — the existing CSP-nonce logic in the same file already does
per-request work unconditionally). The risk this decision heads off is
different: a naive implementation could have middleware call Payload's API
directly on every request to check "is this page under test," which would
reintroduce a live backend call on the hot path for *every* request to
*every* page, defeating the purpose of the whole route-param-rewrite design
in §1. A webhook-refreshed cache, invalidated only on the rare
start/conclude action rather than polled per-request, avoids that.

**Verified during implementation**: `getRunningTestFor` (data-model.md;
implemented in `apps/web/src/lib/payload-client/index.ts`, called from
`middleware.ts`) is functionally correct end-to-end against the real
stack — confirmed live: bucketing splits real traffic correctly, sticks
per visitor, and the `experiments-revalidate` webhook (research.md
elsewhere) visibly fires and takes effect on a real start/conclude
transition.

**Now confirmed (T045, Polish phase)**: this was left as an open
performance question above — instrumented live via Postgres's own
`pg_stat_user_tables` `seq_scan`/`idx_scan` counters (no query logging or
`pg_stat_statements` available on this stack), taking a before/after
snapshot across 20 identical requests to the same page under test. Result:
partial caching, not full. `experiments` picked up 5 fresh `seq_scan`s and
`pages` 15 fresh `idx_scan`s over those 20 requests — i.e. `middleware.ts`'s
`fetch()` calls do *not* get the same strict Data Cache coverage a Server
Component's equivalent call does (separately confirmed: an already-warm
page's own content survives a full `cms` outage and keeps rendering,
T046 — proof that *that* fetch path is genuinely cached). This matches
Next.js's own documented limitation that middleware fetches aren't covered
by the Data Cache the way component-tree fetches are. Practical impact at
this stack's local scale: negligible — every one of these DB round-trips
still completed in single-digit milliseconds, and T045's cold/warm timing
checks found no perceptible difference on the tested page. Accepted as
sufficient for FR-018/SC-008's "no measurable regression" bar as currently
verifiable; the short-TTL in-memory cache scoped to the middleware module
(this section's original fallback plan) remains the documented next step
if production traffic ever makes the gap measurable — not implemented now,
per Principle I (no cache layer for a cost that isn't currently observable).

**Alternatives considered**: Polling Payload on a fixed interval from a
background job instead of a webhook — rejected, adds a second scheduling
mechanism for no benefit over an event-driven revalidation the codebase
already has a working pattern for. Encoding "is this page under test"
directly into the page's own cached data (so middleware wouldn't need a
separate lookup at all) — rejected: middleware runs *before* any page data
is fetched, by definition it cannot read something only available inside
the render it hasn't started yet.

---

## 3. Deterministic bucket assignment is a small, self-contained pure function — not delegated to GrowthBook's SDK for the assignment itself

**Decision**: `apps/web/src/lib/ab-testing/bucket.ts` implements the
visitor-id + experiment-key → variant hash directly (same deterministic
approach GrowthBook's own SDKs document, per
`.claude/skills/growthbook/references/nextjs-integration.md`), unit-tested
in isolation, independent of whether GrowthBook itself is reachable.

**Rationale**: The bucket decision has to be made inside
`middleware.ts` (§1), a context where pulling in GrowthBook's full Node
SDK is heavier than necessary for "hash this visitor id against this
experiment's variant list." GrowthBook is still the system of record for
the experiment's *definition* (variant list, traffic weights, exposure/
conversion tracking, significance) — this function only needs the already-
resolved variant list from `active-tests.ts` (§2) to compute *which one*
a given visitor lands on, matching GrowthBook's own published hashing
approach so results stay consistent with what GrowthBook itself would
compute if asked directly.

**Alternatives considered**: Calling GrowthBook's API from middleware per
request to get the bucket assignment — rejected, reintroduces a live
network call on the hot path (the exact problem §2 avoids for the
"is a test running" lookup) for something a small, deterministic, offline
function already gives for free.

---

## 4. The bucket-consistency cookie is strictly necessary — no consent-banner gate

**Decision**: The sticky-bucket cookie `middleware.ts` sets (§1) is
classified the same way `007-gtm-tagging`'s own consent-choice cookie
already is in this codebase: strictly necessary to the page's core
function, set unconditionally, never gated behind the cookie-consent
banner's accept/reject choice (spec.md FR-017, Clarifications session
2026-09-16).

**Rationale**: Its only purpose is keeping *this test itself* coherent —
without it, a visitor could see a different variant on every request,
which is not a measurement or advertising purpose (the category the
consent banner exists to gate, per `007-gtm-tagging`'s spec). This mirrors
the exact distinction already drawn in that feature between the banner's
own consent-choice cookie (functional, ungated) and the measurement/
advertising cookies GTM's configured tags may set (gated).

**Alternatives considered**: Gating it behind consent (Option B/C from the
clarify session) — rejected by the clarification answer; would make test
data unreliable for any visitor who rejects cookies, without a
corresponding privacy benefit, since the cookie carries no
tracking/identification payload beyond a random bucket assignment.

---

## 5. GrowthBook is the one new dependency this feature needs, and why nothing lighter suffices

**Decision**: Self-hosted GrowthBook (Docker image + MongoDB, Postgres
reused as the metrics datasource) is the experimentation engine, per the
comparison already completed in `docs/ab-testing-exploration.md` §2 and
formalized as a skill at `.claude/skills/growthbook/`.

**Rationale**: Restated here only to satisfy Principle II's requirement
that a dependency beyond the stack be justified in the change that adds
it — the comparison itself (GrowthBook vs. Flagsmith vs. PostHog vs.
Unleash, against self-hostability, GDPR posture, and VPS resource limits)
is not re-litigated; see the linked document for the full reasoning.

**Alternatives considered**: See `docs/ab-testing-exploration.md` §2.

---

## 6. Admin surface reuses Payload's native document-tab mechanism — no new UI framework

**Decision**: The control page's "Tests A/B" tab is a `DocumentTabConfig`
entry under `apps/cms/src/collections/Pages.ts`'s `admin.components.views`
— the exact mechanism already backing that collection's `wizard` view,
confirmed against the installed Payload 3.88 types
(`node_modules/payload/dist/admin/views/document.d.ts`: `tab?:
DocumentTabConfig` on a views-map entry). The `experiments` collection's
own list/edit views are free once the collection exists. One shared
`ExperimentStats` component mounts in both places.

**Rationale**: Zero new admin infrastructure — Payload 3 already supports
exactly this shape. Reiterates `docs/ab-testing-exploration.md` §5.5's
conclusion with the type-level confirmation behind it.

**Alternatives considered**: A custom sidebar panel instead of a real
document tab — rejected per the user's own stated preference
(2026-09-16 conversation) for a tab specifically, to avoid crowding the
page-edit view.
