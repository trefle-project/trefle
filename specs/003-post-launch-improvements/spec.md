# Feature Specification: Post-launch debugging & improvements (phase 1)

**Feature Branch**: `003-post-launch-improvements`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "First round of post-launch fixes and essential
functional gaps found since 001-landing-page-lead-capture and
002-security-hardening shipped and Trefle went live on the Hostinger VPS."

## Context

Trefle is now live in production. This phase closes the gap between "shipped"
and "solid" before more landing-page features are built on top:

1. **The six non-blocking security findings deferred out of
   002-security-hardening** are now due: X-Forwarded-For rate-limit bypass,
   unescaped reflected content in the lead-intake route, unsanitised
   editor-authored HTML, no admin-panel MFA/IP allow-list, an unprotected
   shared rate-limit store, and preview tokens that never expire.
2. **A temporary body-size stopgap** (`payload.config.ts`'s
   `bodyParser.limits.fieldSize`, raised 1 MB → 10 MB to unblock multipart
   admin saves) was never revisited with a deliberate, documented value now
   that the system is public.
3. **Four functional gaps** surfaced by day-to-day use since launch:
   editing an already-published page does not reliably update the live site;
   the post-submission "thank you" response is a hard-coded message instead
   of an editable page with the visitor's unsubscribe link; a domain or
   subdomain pointed at the VPS with no page yet created dead-ends in a 404
   (including the common apex-vs-`www` mismatch); and every new page starts
   from a blank canvas instead of a starter template.

Out of scope for this phase: any landing-page feature beyond the confirmation
page and starter-template items below; multi-tenant changes to the domain
model beyond making the apex/`www` pair both resolve to something; anything
not listed here that surfaces during planning is logged as a follow-up, not
folded in silently.

## Clarifications

### Session 2026-09-11

- Q: The deferred finding "no MFA or IP allow-list" names two different
  controls — which does this phase deliver? → A: An IP allow-list on the
  admin login (no MFA in this phase).
- Q: Must a landing page have a confirmation page selected before it can be
  published, or does publishing stay allowed with a fallback message when
  none is selected? → A: Publishing stays allowed; a landing page with no
  confirmation page selected keeps showing today's generic "Merci..."
  message.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close the deferred security findings (Priority: P1)

An attacker probing the now-public site cannot bypass the lead-intake rate
limit by spoofing `X-Forwarded-For`, cannot inject a script via reflected
content on the lead route or via unsanitised editor HTML, cannot keep using a
leaked preview link indefinitely, and cannot brute-force or casually reach the
admin login from anywhere on the internet. The shared rate-limit store itself
cannot be driven into resource exhaustion.

**Why this priority**: these are the findings 002 explicitly deferred as
non-blocking for going live; the site is live now, so they are the highest
residual security exposure.

**Independent Test**: for each finding, a targeted repro (spoofed header,
crafted reflected input, an editor-submitted `<script>` block, an expired
preview link, a login attempt from outside the allow-list, a burst against
the rate-limit store) fails the way it should instead of succeeding; the
existing Playwright e2e suite and 002's verification steps still pass.

**Acceptance Scenarios**:

1. **Given** the lead-intake endpoint, **When** a request carries a
   spoofed `X-Forwarded-For` header, **Then** the rate limit is still enforced
   against the connection's real client address, not the header value.
2. **Given** the lead-intake route, **When** a submission includes
   HTML/script-like content in a reflected field, **Then** the response
   renders it as inert text, not executable markup.
3. **Given** a page published through the GrapesJS editor, **When** its
   content includes a script tag or an inline event handler, **Then** the
   renderer never executes it for a visitor.
4. **Given** a preview link generated for a draft, **When** it is opened after
   its expiry window, **Then** access is refused instead of showing the draft.
5. **Given** the admin login page, **When** it is reached by a client whose
   address is outside the configured IP allow-list, **Then** authentication
   is refused before credentials are checked.
6. **Given** the shared rate-limit store, **When** it receives a burst far
   above normal traffic, **Then** it degrades by rejecting excess requests
   rather than exhausting shared resources.

---

### User Story 2 - Editing a published page reliably republishes it (Priority: P1)

An editor opens an already-published page, changes its content, saves, and
the public site reflects the change without any extra step or ambiguity about
whether it "took".

**Why this priority**: this is the core CMS workflow. If saving an edit does
not reliably update the live page, every other feature in the product is
undermined — editors cannot trust the tool.

**Independent Test**: publish a page, edit and save it, and confirm — without
any other action — that the public URL serves the new content within 10
seconds; repeat across a restart of the renderer/cache layer to rule out a
propagation gap.

**Acceptance Scenarios**:

1. **Given** a published page, **When** an editor changes its content and
   saves, **Then** the public page reflects the new content within 10
   seconds, with no additional editor action required.
2. **Given** a published page mid-edit, **When** the save fails validation
   (e.g. a publish-guard rule), **Then** the previously published version
   keeps serving unchanged and the editor sees why the save was rejected.
3. **Given** the admin UI, **When** an editor saves a change to a published
   page, **Then** the UI confirms the save succeeded and the change is live,
   removing any ambiguity about whether a separate "republish" step exists.

---

### User Story 3 - An editable confirmation page with the unsubscribe link (Priority: P2)

After a visitor submits a lead form, they land on a confirmation experience
that the editor built and can change like any other page, and which shows
their personal unsubscribe link.

**Why this priority**: the current hard-coded "thank you" fragment cannot
carry campaign-specific messaging or branding, and confirmation is a moment
visitors associate with trust in how their data (and the ability to withdraw
consent) is handled.

**Independent Test**: select a confirmation page for a landing page, publish
both, submit the lead form, and confirm the visitor is shown the selected
page's content with a working, personalised unsubscribe link; change the
confirmation page and resubmit to confirm the new content is used.

**Acceptance Scenarios**:

1. **Given** a landing page with a confirmation page selected, **When** a
   visitor submits a valid lead, **Then** they see the selected page's
   content rather than the generic message.
2. **Given** a confirmation page that includes the unsubscribe placeholder,
   **When** it is shown after a submission, **Then** the placeholder resolves
   to that specific visitor's working unsubscribe link.
3. **Given** two different landing pages with two different confirmation
   pages selected, **When** each is submitted, **Then** each visitor sees
   their own landing page's confirmation content, not the other's.
4. **Given** a landing page with no confirmation page selected, **When** a
   visitor submits it, **Then** they see today's generic "Merci..." message
   — publishing is not blocked by a missing confirmation-page selection.

---

### User Story 4 - A domain or subdomain never dead-ends in a 404 (Priority: P2)

An operator points a new domain (or its `www` subdomain) at the VPS before
any page has been created for it. A visitor who reaches it sees a default
landing experience instead of a bare 404, and this holds for both the apex
domain and its `www` counterpart.

**Why this priority**: a 404 on a freshly pointed marketing domain looks
broken to anyone who visits it during setup, and undermines confidence in the
domain being live at all.

**Independent Test**: register a domain with no page assigned to `/` and
confirm the root path renders a default page instead of 404; register both
`domaine.com` and `www.domaine.com` and confirm both resolve to a working
response.

**Acceptance Scenarios**:

1. **Given** a registered, active domain with no page at `/`, **When** a
   visitor requests the root path, **Then** they see a default landing
   experience, not a 404.
2. **Given** a domain with a real page already assigned to `/`, **When** a
   visitor requests the root path, **Then** that page is served unchanged
   (the default experience never shadows real content).
3. **Given** an operator has pointed both `domaine.com` and
   `www.domaine.com` at the VPS, **When** either is visited, **Then** both
   produce a working response (a page or the default experience), not a 404
   on one of them because only the other was registered.
4. **Given** an unregistered, unrelated host, **When** it is requested,
   **Then** the response is still not-found — the default experience only
   applies to domains Trefle knows about.

---

### User Story 5 - New pages start from a template (Priority: P3)

An editor creating a new page begins from a predefined starter layout in the
block editor and customises it, instead of building every page from a blank
canvas.

**Why this priority**: a quality-of-life improvement for editors; it lowers
the effort to start a new landing page and nudges pages toward a consistent
baseline structure, but nothing is broken without it.

**Independent Test**: create a new page and confirm the block editor opens
with the starter template's structure already in place and fully editable;
confirm it can still be cleared and rebuilt from scratch if desired.

**Acceptance Scenarios**:

1. **Given** an editor creates a new page, **When** the block editor first
   opens for it, **Then** it already contains the starter template's
   structure rather than an empty canvas.
2. **Given** the starter template is loaded, **When** the editor edits,
   removes, or adds blocks, **Then** it behaves exactly like a page built
   from scratch — nothing about the template is locked or special-cased.
3. **Given** the starter template includes a lead-form block, **When** the
   page is published unchanged, **Then** it still satisfies the existing
   publish requirements (exactly one lead-form block, required form
   settings, etc.).

---

### User Story 6 - Admin login reflects Trefle, not the underlying platform (Priority: P3)

An editor or administrator opening the CMS login page sees Trefle's own
identity, not the stock branding of the platform Trefle is built on.

**Why this priority**: cosmetic, but a public-facing admin login carrying a
third-party product's logo looks unfinished and can be confusing about whose
system this is.

**Independent Test**: load the admin login page and confirm no stock platform
logo appears.

**Acceptance Scenarios**:

1. **Given** the CMS admin login page, **When** it loads, **Then** it no
   longer displays the underlying platform's default logo.

---

### Edge Cases

- The X-Forwarded-For fix must not break rate limiting when Trefle legitimately
  sits behind the production reverse proxy (Caddy) — the trusted proxy's own
  header must still be honoured; only an untrusted client-supplied value is
  rejected.
- Sanitising editor-authored HTML must not strip the block markup GrapesJS
  itself needs to keep pages editable and re-render correctly.
- A confirmation page must not itself be selectable as a landing page's
  lead-capture target in a way that creates a submission loop.
- Deleting or unpublishing a page that is currently set as another page's
  confirmation page must not silently break that page's publish state —
  the editor must be told.
- The default domain/`www` experience must not mask a genuine 404 on a path
  other than the root, and must not interfere with existing preview links or
  the unsubscribe route.
- A starter template used unedited must still pass every existing
  publish-guard rule — no exemption (see FR-020).
- The body-size limit change must not reintroduce the original 1 MB failure
  on media-heavy admin saves that motivated the stopgap.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The lead-intake rate limiter MUST key on the request's actual
  client address as seen by the trusted reverse proxy, and MUST NOT trust a
  client-supplied `X-Forwarded-For` value beyond that trust boundary.
- **FR-002**: Any value reflected back in a lead-intake response MUST be
  escaped/encoded such that it cannot execute as script or break out of its
  intended context.
- **FR-003**: Editor-authored HTML from the GrapesJS field MUST be sanitised
  before it is rendered to a visitor, removing script execution vectors while
  preserving the page's intended structure and styling.
  *Amended by 014-custom-code-editing: the allow-list is widened (tables,
  buttons, media, iframes, inline SVG…) and exported as a single
  `SANITIZE_CONFIG` shared by publication, the editor's « Code » view and
  the import tests; script vectors are still removed.*
- **FR-004**: The CMS admin login MUST be protected by an IP allow-list —
  a request from an address outside the configured range MUST be refused
  before credentials are checked. Multi-factor authentication is explicitly
  out of scope for this phase.
  *Superseded by 019-admin-access (2026-10-16): the address list is replaced by Cloudflare Access (an e-mail code for members only), a token check in Caddy and a second factor at the admin login.*
- **FR-005**: The shared rate-limit store MUST itself be protected against
  being overwhelmed by an abusive volume of requests.
- **FR-006**: Preview links MUST stop granting access to their draft after a
  defined expiry window has passed.
- **FR-007**: The CMS's admin body-size limit (`payload.config.ts`) and the
  renderer's server-action body-size limit (`next.config.mjs`) MUST both be
  set to **500 KB** (down from the ad hoc 10 MB stopgap), documented with its
  rationale (see Assumptions), and MUST stay equal to each other.
- **FR-008**: Saving an edit to an already-published page MUST update what
  the public site serves for that page, without requiring any action beyond
  the save itself.
- **FR-009**: The admin UI MUST make it unambiguous, at the moment of saving
  a published page, that the save has published the change live.
- **FR-010**: A landing page MUST support selecting one existing page as its
  confirmation page, shown to a visitor after a successful lead submission in
  place of the current fixed message.
- **FR-011**: The confirmation experience MUST be able to display the
  submitting visitor's own working unsubscribe link, resolved per submission.
- **FR-012**: Confirmation-page selection MUST be independent per landing
  page — selecting or changing one landing page's confirmation page MUST NOT
  affect any other landing page.
- **FR-013**: A landing page with no confirmation page selected MUST remain
  publishable; publishing is NOT blocked by a missing confirmation-page
  selection, and the existing generic "Merci..." message is shown as a
  fallback.
- **FR-014**: Requesting the root path of a registered, active domain that
  has no page assigned to `/` MUST return a default landing experience
  instead of a not-found response.
- **FR-015**: A domain's default landing experience MUST NOT be shown when a
  real page is assigned to that domain's root path — real content always
  takes precedence.
- **FR-016**: Registering a domain and its `www` counterpart MUST both be
  reachable with a working response (a real page or the default experience)
  once both hostnames are registered as active domains.
- **FR-017**: Requests for a hostname that is not a registered, active
  domain MUST continue to return a not-found response — the default
  experience applies only to domains Trefle knows about.
- **FR-018**: Creating a new page MUST initialise its block-editor content
  from a predefined starter template rather than an empty canvas.
- **FR-019**: The starter template's content MUST remain fully editable —
  removable, replaceable, and extendable — with no special locked state.
- **FR-020**: A page built from the unedited starter template MUST still be
  subject to every existing publish requirement (one lead-form block,
  required domain/path, required form settings, etc.).
- **FR-021**: The CMS admin login page MUST NOT display the underlying
  platform's default logo/branding.

### Key Entities

- **Page (confirmation relationship)**: existing `pages` collection gains a
  reference from a landing page to another page designated as its
  confirmation page. No new collection; a landing page and a confirmation
  page are both ordinary `Page` documents.
- **Domain (default-page path)**: no schema change. The `domains` collection
  already has a `notFoundPagePath` field (a path string); this phase is the
  first to make the renderer actually consult it as a fallback when no page
  is assigned to the requested path — resolved through the same `Page`
  lookup as any other request, not a hard-coded static response and not a
  new relationship field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the six deferred security findings has a passing,
  independent repro test demonstrating the exploit no longer succeeds.
- **SC-002**: 100% of published-page edits are visible on the public URL
  within 10 seconds of saving, verified across at least 20 consecutive
  edit-and-check cycles with zero misses.
- **SC-003**: A visitor completing a lead form on any landing page that has a
  confirmation page configured sees that page's content and a working
  unsubscribe link, verified across at least 2 distinct landing pages with 2
  distinct confirmation pages.
- **SC-004**: Visiting an apex domain or its `www` counterpart that has been
  registered but has no page yet never returns a 404 — verified for both
  hostnames.
- **SC-005**: An editor can go from "create page" to "have a structured,
  on-brand page ready to customise" without first building layout from
  scratch.
- **SC-006**: The admin login page shows zero instances of the underlying
  platform's stock branding.
- **SC-007**: The CMS's and renderer's body-size limits are documented in one
  place with a stated rationale, and match each other exactly.

## Assumptions

- Production is the Hostinger VPS already documented in
  `infra/deploy/README.md`; no new hosting environment is introduced by this
  phase.
- The renderer sits behind the project's own trusted reverse proxy (Caddy) in
  every deployed environment, so "the request's actual client address" can be
  derived from the proxy's own forwarded-for header, not a client-supplied
  one (FR-001).
- The default landing experience for a domain/`www` root path (User Story 4)
  is itself an ordinary, editable `Page` document rather than a hard-coded
  static fallback, for consistency with how every other page in the product
  works and to avoid adding a second content-authoring path.
- No canonical redirect between an apex domain and its `www` counterpart is
  required by this phase — FR-016 only requires both to resolve to a working
  response. Canonicalising one to the other (for SEO) is a reasonable
  fast-follow, not required here.
- The unsubscribe placeholder in a confirmation page's content is inserted by
  the editor (opt-in), matching today's optional-unsubscribe-link behaviour,
  rather than being force-appended by the system.
- This phase does not change who can access the admin panel beyond the new
  IP allow-list — no new user roles are introduced, and multi-factor
  authentication remains a tracked follow-up rather than part of this phase.
- "Preview links expire" (FR-006) uses a fixed time window from generation,
  consistent with how the unsubscribe/consent tokens already work elsewhere
  in the product; the exact window is a planning-time decision, not a
  product-scope one.
- The body-size limit in FR-007 is set to **500 KB**. This bounds the
  serialized block-editor JSON (`_payload` field) only — the block tree,
  generated HTML/CSS, and SEO text for one page — not the page's total
  rendered weight: images never enter this field (inline base64 is already
  rejected, and real images are referenced by URL and served separately
  through ImgProxy from Garage). 500 KB of text/JSON comfortably covers even
  a page built from many blocks.
