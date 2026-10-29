# Phase 0 Research: Google Tag Manager tagging & cookie consent

## 1. GTM Container ID and the consent-banner toggle live on `domains`, not a new collection

**Decision**: Two new fields on `apps/cms/src/collections/Domains.ts`:
`gtmContainerId` (text, optional, format-validated `GTM-XXXXXXX`) and
`consentBannerEnabled` (checkbox, default `true`, FR-005).

**Rationale**: `domains` already carries per-domain settings unrelated to
routing (`senderName`/`senderEmail` from `006-double-optin-email`,
`branding`, `notFoundPagePath`) — this is the same shape of thing, and the
clarification fixed both as per-domain, independent settings. No new
collection or global needed for two scalar fields on an existing entity.

**Alternatives considered**: a `tagging` global (workspace-wide) —
rejected outright, contradicts the clarification (per-domain, not global).
A dedicated `domain-tagging-settings` collection keyed by domain — rejected
per Principle I: two fields on an existing collection is strictly simpler
than a second collection with a 1:1 relationship to maintain.

---

## 2. Consent-banner copy (translations) live on the `settings` global, not a new collection

**Decision**: Extend `apps/cms/src/globals/Settings.ts` with an array field
`cookieBannerTranslations`: `{ language: relationship→languages, title,
body, acceptLabel, rejectLabel, revisitLabel }` (all text/textarea). Seeded
at launch with entries for the same four languages
`005-content-language-tagging` seeds (fr/en/es/de), French always present
(FR-014's ultimate fallback).

**Rationale**: `Settings` is already the workspace-wide singleton for
shared, admin-editable copy (`defaultConsentPurposeText`,
`defaultPrivacyNoticeUrl`) and already has an array-field precedent
(`notifyEmails`). The banner's wording is exactly this kind of
workspace-wide, rarely-multiplied content — reusing the existing global
avoids introducing a second small "translated strings" pattern next to one
that already exists in this codebase.

**Alternatives considered**: a new `cookie-banner-translations` collection
— rejected, this content has no independent lifecycle (no draft/publish,
no per-document access rules beyond the global's own `isAdmin` update
gate) that would justify a collection over one array field, per
`006-double-optin-email`'s research.md §1 reasoning for the opposite case
(there, a relationship *did* need its own lifecycle). Per-domain banner
copy — explicitly out of scope per spec.md's Assumptions.

---

## 3. `PublishedPage` gains `language`; this feature is the first renderer-side consumer of it

**Decision**: `apps/web/src/lib/payload-client/index.ts`'s `PublishedPage`
interface gains `language?: { code: string }` (relationship, `depth: 1`
already used by `getPublishedPage`); `getPageForSubmission`'s `Pick<...>`
grows to include `"language"` and its fetch depth changes from `0` to `1`
so the relationship expands to `{ code }` instead of a bare id.

**Rationale**: `005-content-language-tagging`'s plan explicitly left
`apps/web` untouched because language was tagging-only metadata with no
renderer consumer yet (FR-012 there). This feature is that first consumer
(FR-014): the banner's language is the viewed page's language. This is a
small, additive read — no write path changes, nothing in 005 is modified.

**Alternatives considered**: resolving language a different way (e.g. from
the URL or an `Accept-Language` header) — rejected, it would silently
diverge from the language already recorded on the page itself and
duplicate a decision 005 already made a system of record for.

---

## 4. GTM snippet + Consent Mode default: `next/script` `afterInteractive`, no new dependency

**Decision**: The Consent Mode default-deny call
(`gtag('consent','default',{...})`) and GTM's own snippet are each emitted
via `next/script`'s `<Script strategy="afterInteractive">`, in that order —
default-consent script first, GTM snippet second, matching Google's own
documented Consent Mode installation order. The `<noscript>` fallback
iframe is a plain literal tag, no library involved.

**Correction during implementation**: this research originally specified
`strategy="beforeInteractive"`. Next.js only supports that strategy inside
the root layout (`app/layout.tsx`) — ESLint's
`@next/next/no-before-interactive-script-outside-document` flags it
anywhere else, and §5 below deliberately renders `<Tagging>` from each
page-level entry point, not the root layout. `afterInteractive` is used
instead. This still satisfies FR-004: the requirement is that the default
is set before GTM's own tags evaluate, not literally before hydration —
and declaration order between the two `<Script>` tags (consent-default
first, GTM second) still guarantees that, since GTM only starts firing
tags after its own script has executed.

**Rationale**: Principle II (Stack-Native) — Next.js already ships the
exact primitive this needs; no analytics/consent npm package is justified
for "insert two script tags in the right order before hydration."

**Alternatives considered**: Google Tag Manager's own official npm helper
packages — rejected, they wrap the same two script tags with no
capability this feature needs, and would be the project's first analytics
dependency for zero functional gain (Principle II requires justifying any
addition beyond the stack).

---

## 5. Tagging renders per-route, not in `RootLayout`

**Decision**: A new shared server component,
`apps/web/src/components/tagging.tsx`, exporting
`<Tagging domain={domain} language={language} />` (renders the Consent
Mode default script, the GTM snippet, the `<noscript>` fallback, and — when
`domain.consentBannerEnabled` — the consent banner). It is rendered
explicitly by each real entry point that already resolves a domain:
`[[...slug]]/page.tsx` (covers every ordinary page, including the
post-submission confirmation page from `003-post-launch-improvements`, and
the domain default/404-fallback page), `/unsubscribe/page.tsx`, and
`/confirm/page.tsx` (the double opt-in link from
`006-double-optin-email`). It is deliberately **not** rendered by
`RootLayout` (`apps/web/src/app/layout.tsx`) or by the preview route
(`apps/web/src/app/(preview)/preview/[pageId]/page.tsx` — FR-010).

**Rationale**: The consent banner's text must follow the *specific page's*
language (FR-014, per the clarification), but `RootLayout` wraps every
route generically and has no way to learn which page a child route
resolved (Next.js App Router layouts do not receive data upward from the
page they wrap). Every route that needs `<Tagging>` already resolves (or,
for `/unsubscribe` and `/confirm`, can trivially resolve) its own domain
via the existing `resolveDomain()` helper (`apps/web/src/lib/domains.ts`)
— composing explicitly at each entry point keeps language and domain
resolution colocated with the one place that actually has both, rather
than splitting the feature's logic across a layout that only has domain
and pages that only have language.

**Alternatives considered**: resolving domain in `RootLayout` via
`headers()` and threading language down via a cookie or search param —
rejected, adds an indirection layer (a second, parallel channel for
passing language) to avoid three call sites rendering one shared
component, which is not a simplification (Principle I: introduce an
abstraction on the third *duplicated* concrete use, not preemptively —
here the "duplication" is a single one-line `<Tagging .../>` call, not
logic).

---

## 6. `/unsubscribe` and `/confirm` gain domain resolution; language falls back to the domain default, then French

**Decision**: Both routes call `resolveDomain()` (same helper the catch-all
page already uses) purely to know which domain is currently being browsed
for `<Tagging>`'s sake — independent of the opt-in/unsubscribe token they
already verify, which carries no domain or language of its own. Their
`language` is `domain?.defaultLanguage?.code ?? "fr"` — there is no
"page" here to prefer over that fallback, so FR-014's fallback chain
becomes the primary (only) resolution for these two routes.

**Rationale**: Today neither route resolves a domain at all (they are
purely token-bearer pages). FR-002 ("every publicly rendered page") and
User Story 3's page-view/unsubscribe events apply to them like any other
public page, so this is a small, necessary addition, not a design choice
these routes made incorrectly before — GTM/tagging simply didn't exist
yet.

**Alternatives considered**: encoding the domain into the confirm/
unsubscribe token itself — rejected, the token's shape is
`006-double-optin-email`'s and `001`'s contract respectively; changing it
for an unrelated feature is a bigger, riskier surface than a plain
Host-header lookup that already exists as a one-line helper call.

---

## 7. The raw-HTML branches of `POST /api/leads` get their own direct injection, not a `RootLayout` pass-through

**Decision**: `apps/web/src/app/api/leads/route.ts`'s `page()` helper
(which returns hand-built HTML strings — `403`/`422`/`429`/`503`/`409`
responses and the no-confirmation-page "Merci" fallback — entirely
bypassing `layout.tsx` and the React tree) gets a new parameter carrying
the already-fetched `domain` plus a `dataLayerEvent` name/reason. The
helper is extended to prepend the same Consent Mode default script + GTM
snippet `<Tagging>` renders (as a literal, escaped string — this file
already has an `escapeHtml` helper for exactly this class of problem, per
`003-post-launch-improvements` FR-002) and to inline a
`dataLayer.push({event:'lead_form_submit_error', reason})` or

**Correction during implementation — CSP nonce required**: a hand-built
inline `<script>` string is blocked outright by `middleware.ts`'s strict
CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`, no
`'unsafe-inline'`), which applies to `/api/leads` like every other route.
`next/script` auto-nonces itself for the React path (`<Tagging>`), so this
was invisible there; the raw-HTML path needed it added explicitly.
`renderTaggingHtml` therefore takes a required `nonce` parameter and
stamps `nonce="..."` on every `<script>` tag it emits; `route.ts` reads it
once per request off the `x-nonce` header the middleware forwards. Caught
only by the Playwright suite (`gtm-consent.spec.ts`) — the Vitest unit
tests for this route mock the response body, not real browser CSP
enforcement — reinforcing why this feature kept e2e coverage on the
dataLayer contract rather than unit tests alone.
`..._success` call before returning.

**Rationale**: This is the single most important non-obvious finding of
this research phase: because this route never renders through
`RootLayout`, none of `<Tagging>`'s work reaches it "for free" the way it
does for every ordinary page. Every one of `route.ts`'s response branches
already has `domain` in scope (fetched at the top for the host allow-list
check), so the marginal cost is a small helper change, not a new lookup.

**Alternatives considered**: rewriting `POST /api/leads` to redirect
through a real Server Component page for every outcome, not just the
success-with-confirmation-page branch — rejected as far outside this
feature's blast radius (Principle III: small, reversible changes); the
existing hand-built-HTML design predates this feature and works
correctly for its own purpose (JS-optional, fast, no React render needed
for a 3-line error page) — GTM support is layered on top of it, not a
reason to replace it.

---

## 8. dataLayer events fire via an inline SSR script, not a client-side submit handler

**Decision**: Because `LeadForm` is a plain `<form method="post">` with no
JavaScript submit interception (by design — it must work with JavaScript
disabled), the "submission success" and "submission error" events (FR-003)
are pushed via an inline `<script>` emitted at server-render time on
whichever response the browser actually lands on after the POST: the
`/confirmation` page render (success, when a confirmation page is
configured), the plain "Merci" fallback or a validation-error response
from `route.ts` (§7, when there is no confirmation page or the submission
failed), or — for `lead-form-view` and generic `page-view` — a script
emitted by `<Tagging>` itself as part of every normal page render.

**Rationale**: There is no client-side event to listen for that reliably
fires exactly once per real outcome without JavaScript being required —
matching how the outcome is already communicated today (a full navigation
to a different rendered response), not inventing a second, JS-only
signalling path alongside it.

**Alternatives considered**: a `navigator.sendBeacon` call from a client
script listening for the form's `submit` event (mirroring
`web-vitals.tsx`) — rejected: it would fire on every submit attempt
including ones that fail (double-counting), requires JavaScript (silently
under-counting the no-JS path the constitution explicitly protects), and
can't know the server's actual validation outcome without a second
request.

---

## 9. Consent choice is a plain first-party cookie, scoped to the exact host

**Decision**: The visitor's consent choice + timestamp is stored in a
plain cookie (not `localStorage`), named e.g. `tf_consent`, set by the
consent-banner's own small client script (and readable, if ever needed,
server-side too since it's an ordinary cookie).

**Rationale**: Browsers already scope cookies to the exact host that set
them — FR-009 ("a consent choice recorded for one domain MUST NOT apply
to any other domain") falls out of using a plain per-host cookie for
free, with zero extra engineering, rather than a mechanism (e.g. a
`domainId`-keyed `localStorage` entry) that would need to actively
enforce the isolation cookies already give for nothing.

**Alternatives considered**: `localStorage` — rejected, provides no
isolation benefit over a cookie here (both are already origin-scoped) and
is not readable server-side, which a cookie keeps open as a future option
at no cost.

---

## 10. Performance budget: GTM's own snippet is async by design; the banner ships with zero new client-JS dependency

**Decision**: FR-015's budget is met structurally: GTM's own official
snippet loads `gtm.js` asynchronously by design (it's a small inline
loader, not a blocking `<script src>` tag), and the consent-banner
component is hand-written (no UI/animation library), consistent with
`web-vitals.tsx`'s existing minimal-client-JS style. No performance
work beyond "don't add a library" is required to meet the baseline
budget; a specific measurement is part of Phase 6 verification
(quickstart.md), not a research unknown.

**Rationale**: The constitution's ~150KB budget is a per-page ceiling on
*this codebase's own* client JS; GTM's loader itself is a few KB, and
whatever an operator later configures inside the GTM UI is explicitly
their own responsibility to keep within budget (spec.md FR-015) — not
something this feature's implementation can control from the codebase
side.

**Alternatives considered**: lazy-loading GTM behind an
`IntersectionObserver` or idle callback — rejected as unnecessary
complexity for a snippet that is already asynchronous by construction;
would also delay the Consent Mode default-deny call, which must run as
early as possible, working against the goal.

---

## 11. `<Tagging>`'s dataLayer-events script needs a `key`, not just a variable `id`, to fire the `unsubscribe_complete`/`extraEvent` push

**Decision**: `apps/web/src/components/tagging.tsx`'s `tf-datalayer-events`
`<Script>` sets `key={id}` where `id` already varies with `extraEvent`
(`tf-datalayer-events-${extraEvent}` vs the plain `tf-datalayer-events`).

**Rationale**: `/unsubscribe/page.tsx` renders `<Tagging>` twice across one
visit — once for the confirm-form view (no `extraEvent`), then again,
after the Server Action's redirect to `?done=1`, with
`extraEvent="unsubscribe_complete"`. Both renders sit at the same position
in the same component tree, so React reconciles the second as an *update*
of the first `<Script>` instance rather than an unmount/remount — varying
only the `id` prop value changes what a fresh mount would register, but
without an actual remount `next/script` never re-runs. Discovered because
this was the one dataLayer event that never fired in `gtm-consent.spec.ts`
even after the CSP nonce fix (§7) resolved the raw-HTML path's identical
symptom for a different reason. A `key` that changes exactly when the
script's *content* meaningfully changes forces React to remount it,
which is what actually makes `next/script` register and execute fresh.

**Alternatives considered**: pushing `extraEvent` from a plain
`useEffect` in a small client component instead of SSR-embedding it in
`<Tagging>` — rejected, inconsistent with research.md §8's decision that
every dataLayer push in this feature is server-rendered, not
client-effect-driven, and would reintroduce exactly the kind of
`react-hooks/set-state-in-effect`-adjacent pattern `cookie-consent-banner.tsx`
was deliberately written to avoid.
