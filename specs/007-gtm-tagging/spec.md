# Feature Specification: Google Tag Manager tagging & cookie consent

**Feature Branch**: `007-gtm-tagging`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Add Google Tag Manager (GTM) tagging to Trefle's
public-facing pages so marketing can manage tracking/conversion tags without
code changes: a per-domain GTM container, a documented dataLayer for key
lifecycle events, and — since the project has no cookie-consent mechanism
today beyond the lead form's own GDPR consent — a cookie-consent banner with
Google Consent Mode so tags never fire before a visitor has consented."

## Context

Trefle has one existing consent mechanism: the lead-capture form's own
GDPR consent checkbox and consent record (`001-landing-page-lead-capture`),
which is a durable, evidentiary record of a visitor agreeing to be contacted.
It has nothing today that governs *tracking cookies* — no cookie-consent
banner, no tag manager, no analytics beyond the internal `page-stats`
counters mentioned in 001's research.

Installing GTM changes that: GTM is a delivery mechanism for whatever tags a
marketer configures inside it (Google Ads, Meta Pixel, GA4, etc.), and those
tags set cookies covered by the ePrivacy directive and CNIL guidance
(consent must be freely given, specific, and as easy to refuse as to
accept). This spec therefore covers two things together, because shipping
one without the other would put the site in a non-compliant state the
moment a marketer adds a single tag inside GTM:

1. A per-domain GTM container, installed on public pages, that publishes a
   documented `dataLayer` contract marketing can build tags against.
2. A cookie-consent banner wired to Google Consent Mode, so no
   measurement/advertising cookie is set before a visitor consents, and a
   visitor can change their mind later.

Out of scope: building or configuring any actual tag, trigger, or variable
inside the GTM container itself (that happens in the GTM UI, not in this
codebase); server-side tagging / Conversions API; and any change to the
existing lead-form GDPR consent record, which is a separate lawful basis and
is untouched by this feature.

This feature depends on `005-content-language-tagging`: the consent
banner's text is displayed in the language already tagged on the page being
viewed, reusing that feature's Languages list rather than introducing a
second one (see FR-014).

## Clarifications

### Session 2026-09-16

- Q: Trefle has no cookie-consent banner today — should this spec include
  one, or install GTM alone and leave consent for a later spec? → A: Include
  a consent banner wired to Google Consent Mode as part of this spec; tags
  loaded through GTM must not fire before consent given the compliance risk
  of shipping tagging without it.
- Q: Should the GTM container be one global ID for the whole workspace, or
  configurable per domain? → A: Per domain, consistent with Trefle's
  multi-domain model — different domains can belong to different clients or
  ad accounts.
- Q: Is the cookie-consent banner's visibility derived from whether a domain
  has a GTM Container ID set, or a separate control? → A: A separate,
  independent toggle per domain. An operator can run a GTM container with
  the banner turned off, and can turn the banner on or off without touching
  the container ID.
- Q: Should the consent banner follow Trefle's existing content-language
  system (`005-content-language-tagging`), or is a single default-language
  banner acceptable for this phase? → A: It must follow the page's language
  tag from `005-content-language-tagging`, the same way every other
  page-level string does.
- Q: Should this spec fix an explicit performance requirement for how GTM
  and the consent banner load, or leave that to planning? → A: Fix it here —
  both MUST load asynchronously/non-blocking and stay within the
  constitution's existing client-JS performance budget, since that is
  already a stated product principle, not an implementation detail to
  re-derive later.
- Q: When a visitor withdraws previously given consent, must already-set
  tracking cookies be actively deleted, or is stopping future firing
  enough? → A: Stopping future firing is enough; retroactively deleting
  cookies a third-party tag already set is not guaranteed (often outside
  the site's technical control once set), but Trefle's own consent-choice
  cookie is always updated to the new value immediately.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No tracking cookie is set without consent (Priority: P1)

A visitor lands on a domain that has tagging enabled. Before they make a
choice, no measurement or advertising cookie is set. A clear banner lets
them accept or reject in one click each, and they can change that choice
later from any page.

**Why this priority**: this is the compliance floor. Installing GTM without
it means the very first tag a marketer configures inside GTM puts the site
in breach of ePrivacy/CNIL rules — this must ship no later than, and
ideally in the same change as, the container itself.

**Independent Test**: open a domain with tagging enabled in a fresh browser
profile, inspect cookies/storage before interacting with the banner (none
beyond strictly necessary ones), reject, confirm none appear, accept,
confirm consent-gated cookies can now be set, then use the revisit control
to change the choice back.

**Acceptance Scenarios**:

1. **Given** a domain with a GTM container configured, **When** a visitor
   loads any public page for the first time, **Then** a consent banner
   appears before any non-essential cookie is set, and Consent Mode's
   default state (analytics and advertising storage) is denied.
2. **Given** the consent banner is showing, **When** the visitor clicks
   "Reject", **Then** the banner closes, no measurement/advertising cookie
   is ever set, and the page (including the lead form) continues to work
   normally.
3. **Given** the consent banner is showing, **When** the visitor clicks
   "Accept", **Then** Consent Mode's state updates immediately (no reload
   required) and any tag depending on that consent is now allowed to fire.
4. **Given** a visitor already made a choice, **When** they return within
   the choice's validity window, **Then** the banner does not reappear and
   their previous choice is respected.
5. **Given** a visitor already made a choice, **When** they use the
   persistent "cookie preferences" control, **Then** they can change their
   choice at any time, as easily as they made it the first time.
6. **Given** a domain whose consent-banner toggle is turned off, **When** a
   visitor loads its pages, **Then** no consent banner appears — regardless
   of whether that domain has a GTM Container ID configured or not.
7. **Given** a domain whose consent-banner toggle is turned on, **When** a
   visitor loads its pages, **Then** the banner appears as described above,
   even if that domain currently has no GTM Container ID set.
8. **Given** a page tagged with a given language (per
   `005-content-language-tagging`), **When** the consent banner (and its
   revisit control) is shown on that page, **Then** its text is displayed in
   that page's language, not a fixed single language.

---

### User Story 2 - An operator installs tagging per domain without a deploy (Priority: P1)

An operator sets a domain's GTM Container ID from the CMS. From that
domain's next page publish onward, its pages' HTML correctly includes the
GTM snippet (head script and `<noscript>` fallback, per Google's standard
installation) — no code change or deploy involved. Clearing the field
removes it just as fast.

**Why this priority**: this is what makes the feature usable day-to-day
across Trefle's multi-domain model, where different domains can belong to
different clients or ad accounts, each needing their own container.

**Independent Test**: set a GTM Container ID on one domain, publish (or
republish) a page on it, view the served page's HTML source and confirm the
GTM head script and `<noscript>` snippet are both present and correctly
formed; confirm a domain with no ID set has neither. Clear the field,
republish, and confirm the snippet disappears.

**Acceptance Scenarios**:

1. **Given** the domain settings in the CMS, **When** an operator enters a
   GTM Container ID and saves, **Then** every page published for that domain
   from then on — including on its next republish — includes the GTM
   snippet correctly implemented in its HTML (head script plus `<noscript>`
   fallback), the same way an edit to a published page takes effect per
   `003-post-launch-improvements`'s FR-008.
2. **Given** a domain with no GTM Container ID set, **When** a visitor loads
   its pages, **Then** no GTM snippet is loaded and nothing errors.
3. **Given** a domain that already has a GTM Container ID, **When** an
   operator changes or clears it, **Then** subsequently served pages reflect
   the new value without any deploy.
4. **Given** two different domains each with their own GTM Container ID,
   **When** each is visited, **Then** each loads only its own container, never
   the other's.

---

### User Story 3 - Marketing measures the visitor funnel via a documented dataLayer (Priority: P2)

A marketing operator opens GTM and finds a consistent, documented set of
events already arriving in the `dataLayer` — page view, lead-form view,
submission success, submission error, and unsubscribe — and builds a
conversion tag (e.g. Google Ads, GA4) off them without asking an engineer to
add anything.

**Why this priority**: this is what makes installing GTM worth doing beyond
a bare container — it turns on measurable value for marketing. It is P2
because User Stories 1 and 2 already ship a safe, working container; this
story makes it useful.

**Independent Test**: with a GTM container configured and GTM's Preview mode
open, walk a visit end to end (load a landing page, view the form, submit it
successfully, then trigger a submission validation error on a second
attempt, then follow an unsubscribe link) and confirm each documented event
appears in the dataLayer with its documented fields and no personal data.

**Acceptance Scenarios**:

1. **Given** a public page loads, **When** it finishes rendering, **Then** a
   page-view event is pushed to the `dataLayer` with the page's path, type,
   and domain.
2. **Given** a page with a lead-capture form, **When** the form is rendered
   to the visitor, **Then** a lead-form-view event is pushed identifying the
   form and page.
3. **Given** a visitor submits a lead form successfully, **When** the
   submission is accepted, **Then** a submission-success event is pushed
   identifying the form and page, without any submitted field values (no
   email, name, phone, or free-text content).
4. **Given** a visitor submits a lead form that fails validation, **When**
   the submission is rejected, **Then** a submission-error event is pushed
   identifying the form, page, and a non-personal reason category (e.g.
   "validation_failed", "consent_not_given"), without any submitted field
   values.
5. **Given** a visitor completes the unsubscribe flow, **When** it succeeds,
   **Then** an unsubscribe event is pushed identifying the page/domain,
   without any personal identifiers.

---

### Edge Cases

- A visitor blocks GTM entirely (extension, network-level blocker, or
  strict browser tracking protection) — the page, including the consent
  banner's absence of effect on it and the lead form, MUST keep working
  exactly as if no tagging existed (see FR-011).
- A domain's GTM Container ID is invalid or the ID for a container that has
  been deleted in Google's own system — the snippet still loads without
  breaking the page; GTM's own failure handling takes over from there.
- Preview links for unpublished drafts, and the Payload admin UI itself,
  must never load GTM or the consent banner — only publicly published pages
  do (see FR-010).
- A visitor accepts, then later actively rejects, then reloads — the
  rejected state must still be honoured (no stale "accepted" cookie
  outliving an explicit later choice); a cookie a previously consented tag
  already set before the rejection is not guaranteed to be deleted, only
  prevented from being set again (see FR-008).
- A domain gets a GTM Container ID added after visitors already hold a
  cached page or a previous "no banner needed" state — the banner must
  start appearing for that domain going forward without requiring visitors
  to clear their browser data.
- Consent recorded on one domain must never be read as covering a different
  domain, even where both domains belong to the same Trefle workspace.
- An operator turns the consent-banner toggle off on a domain that has a GTM
  Container ID configured — GTM keeps loading, but Consent Mode is no longer
  gated by this feature's banner; the operator is responsible for whatever
  is configured inside that container from that point on (see FR-005).
- An operator turns the consent-banner toggle on for a domain with no GTM
  Container ID set — the banner still appears even though there is, for now,
  nothing configured that depends on it.
- A page's language (per `005-content-language-tagging`) has no banner
  translation configured yet (e.g. an administrator just added a new
  language to the Languages list) — the banner MUST still render, falling
  back to the domain's default language, or to French if the domain has
  none, rather than showing blank or broken text (see FR-014).
- The dataLayer's error-reason categories (FR-003) must never leak which
  specific field failed validation in a way that could reconstruct
  submitted content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The domain settings in the CMS MUST support an optional GTM
  Container ID per domain, empty by default.
- **FR-002**: When a domain has a GTM Container ID set, every publicly
  rendered page on that domain MUST load the GTM snippet, correctly
  implemented in the page's HTML (head script plus `<noscript>` fallback,
  per Google's standard installation) from that page's next publish onward;
  when unset, no GTM snippet MUST be loaded and this MUST NOT be treated as
  an error.
- **FR-003**: The public renderer MUST push a documented, versioned set of
  `dataLayer` events — page view, lead-form view, lead-form submission
  success, lead-form submission error, and unsubscribe completion — each
  carrying only non-personal fields (page path/type, domain, form
  identifier, a non-personal error-reason category). Submitted field values
  (email, name, phone, free text, or any other visitor-entered content)
  MUST NEVER be included in a `dataLayer` push.
- **FR-004**: Before a visitor makes a consent choice, Consent Mode's
  default state for analytics and advertising storage MUST be denied, so no
  measurement or advertising cookie is set pre-consent.
- **FR-005**: The domain settings in the CMS MUST support a "cookie-consent
  banner enabled" toggle per domain, independent of the GTM Container ID
  field — an operator MUST be able to turn the banner on or off without
  changing, and regardless of, whether a Container ID is set. When enabled,
  the domain MUST show the banner to a visitor who has not yet made (or
  whose prior choice has expired) a choice, before any non-essential tag can
  fire, offering "Accept" and "Reject" as equally prominent, one-click
  actions, and Consent Mode gating (FR-004, FR-008) applies. When disabled,
  no banner is shown and this feature does not gate Consent Mode — an
  operator who disables it while a GTM Container ID is configured takes on
  responsibility for the compliance of whatever is set up inside that
  container.
- **FR-006**: A visitor's consent choice and its timestamp MUST be stored
  per domain, MUST persist across page loads and sessions, MUST NOT trigger
  the banner again while valid, and MUST expire after 6 months, after which
  the banner reappears.
- **FR-007**: A visitor MUST be able to change a previously given consent
  choice at any time via a persistent, easy-to-find control (e.g. a footer
  link), with rejecting remaining exactly as easy as accepting.
- **FR-008**: Accepting, rejecting, or changing consent MUST update Consent
  Mode's state at runtime, without requiring a page reload, so gated tags
  start or stop firing from that moment. Withdrawing a previously given
  consent MUST stop any further consent-gated tag from firing, but does NOT
  need to retroactively delete a cookie a tag already set before the
  withdrawal — only Trefle's own consent-choice cookie is required to be
  updated to the new value immediately.
- **FR-009**: A consent choice recorded for one domain MUST NOT be applied
  to, or read from, any other domain.
- **FR-010**: GTM and the consent banner MUST NOT load on unpublished draft
  preview links or within the Payload admin UI — only on publicly published
  pages.
- **FR-011**: A published page — including its lead-capture form — MUST
  remain fully functional when the GTM script fails to load or is blocked by
  the visitor's browser or an extension.
- **FR-012**: A domain's GTM Container ID MUST be editable from the CMS by
  an operator without requiring a code change or deployment, taking effect
  on the next page request.
- **FR-013**: The GTM snippet and the consent-banner logic MUST be
  implemented with the existing stack's own primitives (a script tag and
  first-party consent logic) — no new runtime dependency beyond the stack is
  required for this feature.
- **FR-014**: The consent banner's text — including its accept/reject
  controls and the persistent revisit control (FR-007) — MUST be displayed
  in the language tagged on the page being viewed, per
  `005-content-language-tagging`. Translated banner copy MUST be
  maintainable per language without a code change or deployment, consistent
  with how that feature's Languages list is itself admin-managed. When a
  page's language has no banner translation configured, the banner MUST
  fall back to the domain's default language, or to French if the domain
  has none, rather than showing blank or missing text.
- **FR-015**: The GTM snippet and the consent-banner logic MUST load
  asynchronously and MUST NOT block a page's initial render (e.g. must not
  delay Largest Contentful Paint). Their combined weight MUST stay within
  the existing published-page client-JS performance budget (~150KB gzipped
  per page, per the project constitution); exceeding it MUST be documented
  with a reason, the same way any other page exceeding that budget already
  requires (this feature's own baseline installation is expected to comfortably
  fit — tags an operator later configures inside GTM are their own
  responsibility to keep within budget).

### Key Entities

- **Domain (tagging settings)**: the existing `domains` collection gains two
  independent fields — an optional GTM Container ID, and a "cookie-consent
  banner enabled" toggle. Neither is derived from the other. No new
  collection.
- **Consent choice**: a lightweight, per-domain, client-side preference
  (choice + timestamp) distinct from and independent of the existing
  lead-form GDPR consent record (`001-landing-page-lead-capture`), which
  remains the durable, server-side evidentiary record for a different
  lawful basis (contacting the lead). The cookie-consent choice is not a
  legal evidentiary record and is not stored server-side.
- **Banner copy (translation)**: consent-banner text keyed by language,
  reusing the Languages list from `005-content-language-tagging` rather than
  introducing a second, parallel language list. Admin-editable per language,
  with the fallback described in FR-014.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a domain with tagging enabled, zero measurement or
  advertising cookies are set for a visitor before they make a consent
  choice, verified by inspecting browser storage on first visit across a
  sample of pages.
- **SC-002**: An operator can add, change, or remove a domain's GTM
  Container ID from the CMS and see the effect on the next page load, with
  zero code changes or deploys.
- **SC-003**: A marketing operator can build a working conversion tag inside
  GTM using only the documented `dataLayer` events, without requesting any
  engineering change.
- **SC-004**: A visitor who rejects cookies still completes and submits the
  lead-capture form successfully, every time.
- **SC-005**: A visitor can change a previously given consent choice from
  any public page in one click to reach the control.
- **SC-006**: A visitor who already made a choice is not shown the banner
  again on return visits within its 6-month validity window.
- **SC-007**: A published page's Largest Contentful Paint is not measurably
  delayed by the GTM snippet or the consent banner, and the page's client-JS
  weight stays within the existing ~150KB gzipped budget with this feature's
  baseline installation alone (before any operator-configured tag is added
  inside GTM).

## Assumptions

- Google Tag Manager is the tag management system in scope; configuring the
  tags/triggers/variables inside a GTM container is a marketing-operations
  task performed in Google's own UI, out of scope for this codebase.
- Server-side tagging (a GTM server container, Conversions API) is out of
  scope for this phase; only the client-side (web) GTM container is
  specified here.
- The cookie-consent banner's visual design (layout, styling) is a single
  shared default across all domains for this phase; only its text content is
  localized, following the page's language (FR-014), and only the GTM
  Container ID and the banner toggle are themselves per-domain settings (per
  the clarifications). A domain overriding the banner's wording beyond
  translation (e.g. different phrasing for one specific client) is a
  reasonable fast-follow, not required here.
- Default banner translations ship for the same seeded languages as
  `005-content-language-tagging` (fr, en, es, de); an administrator adding a
  new language to that feature's Languages list is expected to also add its
  banner translation, with French as the ultimate fallback in the meantime
  (FR-014) so nothing ever renders blank.
- A 6-month consent-validity window is used as a conservative default
  (CNIL guidance allows up to 13 months); this is a simple constant, not a
  schema decision, and can be adjusted later without a data-model change.
- Consent Mode is implemented in its basic form (default denied, updated on
  choice); advanced/URL-passthrough or modeling features are out of scope.
- The consent-banner toggle defaults to enabled for a domain, so the safer
  state (banner shown) is what a newly configured domain gets unless an
  operator deliberately turns it off.
- No existing analytics/marketing tags are being migrated into GTM as part
  of this feature — the internal `page-stats` counters from
  `001-landing-page-lead-capture` are unaffected and continue running
  alongside GTM, not replaced by it.
