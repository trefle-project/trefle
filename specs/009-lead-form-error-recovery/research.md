# Phase 0 Research: Lead form error recovery

## 1. The re-rendered page cannot be produced inside `POST /api/leads` itself — it must redirect to a real Server Component route

**Decision**: On a per-field validation failure, `POST /api/leads` stops
building its own HTML response for that case. Instead it stashes the
submitted values and per-field errors in a short-lived, single-use
server-side record and issues a `303` redirect to a new dedicated route,
`/form-retry?err=<token>&page=<pageId>`, which does the actual
`PageShell`/`LeadForm` re-render.

**Rationale**: Two independent constraints, both already hit and solved by
earlier features in this exact codebase, rule out rendering `PageShell`
JSX directly from the route handler:

- `apps/web/src/app/(confirmation)/confirmation/page.tsx`'s own comment
  records that Next.js rejects importing a component that pulls in
  `react-dom/server` from a Route Handler ("You're importing a component
  that imports react-dom/server ... render or return the content directly
  as a Server Component instead"). `PageShell` is exactly such a component.
  The confirmation-page feature (003) already solved this by redirecting to
  a dedicated Server Component route instead of rendering inline — this
  feature reuses that same shape.
- `apps/web/src/app/[[...slug]]/page.tsx` — the route that would otherwise
  be the obvious place to show "this page, with errors" — is ISR-cached
  (`revalidate = 3600`) and shared by every visitor. `008-ab-testing`'s
  research.md §1 already established, against the bundled Next.js 16 docs,
  that reading `searchParams`/`cookies()`/`headers()` anywhere in that
  route's render tree makes the *entire* route dynamic on *every* request —
  not just the one showing an error — which would regress caching and LCP
  sitewide (violating 007's FR-015/SC-007) for a feature that only needs to
  affect one specific, rare response. Per-visitor error state is exactly
  the kind of thing `confirmation/page.tsx`'s own comment already flags as
  wrong to fold into the shared route: "must never render a request-
  specific value ... either leak one visitor's [data] to another (if
  cached) or force the whole general page route dynamic for everyone (if
  not)."

A new `force-dynamic` route, entered only via this feature's own redirect,
is unreachable from normal navigation and therefore costs nothing to the
shared route's cacheability — the same trade-off already accepted for
`/confirmation`.

**Alternatives considered**: Rendering the error state inline from
`[[...slug]]/page.tsx` via `searchParams` — rejected per the caching
regression above. Keeping the failure response entirely inside the Route
Handler as hand-built HTML (today's behaviour, just with values spliced in
as strings) — rejected: it would duplicate `PageShell`'s non-trivial
rendering pipeline (`sanitizeHtml`, `splitAroundForm`, `rewriteImageTags`)
a second time outside JSX, the exact kind of parallel rendering path
Principle I/II argue against, and reintroduces manual escaping this
feature is trying to get rid of (§3 below).

---

## 2. Passing state across the redirect: a bounded in-memory flash store, not the URL

**Decision**: `apps/web/src/lib/form-error-store.ts` — a new, small module
mirroring the existing bounded/swept `Map` pattern in
`apps/web/src/lib/rate-limit.ts` (hard key cap, opportunistic sweep of
expired entries, no background timer). It stores
`{ pageId, values, fieldErrors }` keyed by a random opaque token, with a
short TTL (5 minutes — long enough to survive a visitor reading the error
and correcting a field, short enough that it's never a durability
concern) and single-use semantics (a read deletes the entry). The redirect
carries only that opaque token (`err=`) plus the non-sensitive `pageId`
(`page=`) — never the submitted values themselves — in the query string.

**Rationale**: The submitted values can include the visitor's email and
other personal fields. `POST /api/leads`'s existing invariant (contracts/
lead-intake.md: "No personal field value written to logs at any level",
FR-038 in 001) means those values must not end up somewhere a reverse
proxy or access log would capture them — a redirect `Location` query
string is exactly such a place. A signed token (mirroring
`signFormToken`) would stop forgery but not this exposure: signing proves
authenticity, it doesn't hide the payload from a URL that still gets
logged. An in-memory store sidesteps this: the URL carries only a random
lookup key, meaningless without the corresponding server-side record, and
that record is deleted the moment it's used. This project already accepts
the single-instance, in-memory trade-off for exactly this shape of
problem (`rate-limit.ts`, hardened in `003-post-launch-improvements`
phase 5 specifically to bound it against abuse) — reusing that precedent
here is Stack-Native (Principle II) rather than inventing a new mechanism
or a database table for what is, by design, disposable, seconds-scale
state.

Passing `pageId` in the clear alongside the token is safe (it's a CMS
document id, not personal data — the same value `/api/leads` already
receives as a plain hidden form field) and lets `/form-retry` degrade
gracefully if the flash record has already expired or been consumed (§4).

**Alternatives considered**: Encoding `{pageId, values, fieldErrors}`
directly in a signed token in the URL — rejected for the log-exposure
reason above. A cookie instead of a query param — rejected as
unnecessary complexity for a value that only needs to survive one
redirect hop, and it would need the same server-side lookup-by-token
shape anyway once size limits and encoding are accounted for (some
submitted values, e.g. a `textarea`, can exceed what's comfortable in a
cookie). A real database table — rejected: this state is intentionally
disposable and short-lived, unlike everything else the schema models.

---

## 3. Echoing values back is safe "for free" via JSX, not extra escaping code

**Decision**: `/form-retry`'s values/errors reach the browser exclusively
through `LeadForm`'s existing JSX props (`value`/`defaultValue`,
`{error}` text nodes) — the same component already used for a normal page
render. No new escaping helper is introduced for this feature.

**Rationale**: React escapes every value interpolated into JSX text or
`value`/`defaultValue` attributes by default; `LeadForm`
(`apps/web/src/components/lead-form.tsx`) never uses
`dangerouslySetInnerHTML` for a field's value or error text. This already
satisfies FR-006. `apps/web/src/lib/escape-html.ts`'s `escapeHtml()`
remains necessary only where it's used today — the hand-built HTML strings
in `/api/leads/route.ts`'s other (non-per-field-validation) branches and
in `renderTaggingHtml` — none of which this feature touches.

**Alternatives considered**: Manually escaping values before storing them
in the flash record — rejected as redundant work that also risks
double-escaping if `LeadForm` ever changes how it renders a value; storing
raw submitted values and relying on JSX's own escaping at render time
(the chosen decision) is both simpler and the same trust boundary already
in effect for every other page render in this codebase.

---

## 4. Graceful degradation when the flash record is gone

**Decision**: If `/form-retry` cannot find the record for `err` (expired,
already consumed, or the process restarted), it falls back using the
`page` query param alone: resolve that page id to its live path
(new small lookup, §5) and redirect to the page's own normal URL — the
visitor lands on a fresh, blank form rather than a dead end. If `page`
itself cannot be resolved either (deleted/unpublished since the original
submission), show a minimal inline fallback message, mirroring
`confirmation/page.tsx`'s existing `fallbackPage()` pattern.

**Rationale**: Matches this codebase's established tolerance for
best-effort state that can legitimately be gone (preview tokens expiring,
`confirmation`'s own "page no longer resolvable" fallback) — the visitor
never sees a broken response, only ever "start over" in the worst case,
which is exactly what would have happened before this feature existed.

**Alternatives considered**: Treating a missing record as a hard error
(404/500) — rejected, worse than today's behaviour for the rare
expiry/restart case this is meant to cover gracefully.

---

## 5. Fetching the full page by id for the re-render

**Decision**: `getPageForSubmission` (`apps/web/src/lib/payload-client/index.ts`)
already fetches `GET /pages/:id?depth=1` from Payload without a `select`
parameter — Payload's REST API returns the full document regardless; only
the function's TypeScript return type (`Pick<PublishedPage, "id" |
"status" | "form" | "language">`) currently narrows what's visible to
callers. Widening that return type to the full `PublishedPage` shape
(`builder`, `path`, `seo` included) costs nothing extra over the network
and is enough for both `/api/leads` (unchanged use) and the new
`/form-retry` route (needs `builder`/`path` too) to share one fetch
function, instead of adding a second, near-identical one.

**Rationale**: Principle I ("introduce an abstraction only on the third
concrete use") cuts the other way here too — this isn't a new
abstraction, it's removing an artificial type-level restriction on data
already being returned by the one function that exists. `getPublishedPage`
(domain+path keyed) stays as-is; it serves a different, incompatible
lookup shape (`/form-retry` only has a `pageId`, not a guaranteed
domain+path pair without an extra round trip).

**Alternatives considered**: A new `getPageById()` function duplicating
`getPageForSubmission`'s fetch — rejected as an unjustified second
function returning the same data through the same endpoint.

---

## 6. `dataLayer` parity on the error page — full parity, not deferred

**Decision**: `/form-retry` renders `<Tagging domain language path
formPageId extraEvent={{ event: "lead_form_submit_error", reason }} />`.
`Tagging`'s `extraEvent` prop is widened from a bare event-name string to
`string | { event: string; reason?: string }` (a bare string remains
valid — `/unsubscribe`'s existing `extraEvent="unsubscribe_complete"` call
is untouched), and the script it emits now also includes `path`/
`formPageId` on that push, matching `lead_form_view`'s.

**Rationale (revised during implementation)**: The original draft of this
decision deferred `reason` as "not required by this feature's spec."
That was wrong: `contracts/datalayer-events.md` (007-gtm-tagging) already
specifies `lead_form_submit_error` as requiring `domain`, `path`,
`formPageId`, **and** `reason` (one of `validation_failed`/
`consent_not_given`/`rate_limited`/`upstream_unavailable`) — an existing,
formal data contract, not a detail internal to this feature. Deferring it
would have silently broken that contract for every validation-failure
case (the only case this feature touches), which
`gtm-consent.spec.ts`'s existing `"a rejected submission pushes
lead_form_submit_error with a non-personal reason"` test caught live
during implementation (`reason` came back `undefined`, and `path`/
`formPageId` were missing from the push entirely — `extraEvent` had only
ever needed to support `unsubscribe_complete` before, whose contract
needs none of them). Widening the prop was the correct fix, not
documenting the gap away.

**Alternatives considered**: Leaving `extraEvent` bare and updating the
gtm-consent contract/test instead — rejected: the contract predates this
feature and this feature has no reason to narrow it; the fix belongs in
the renderer, not the spec.
