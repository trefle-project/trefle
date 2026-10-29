# Feature Specification: Edge protection & media caching (lot 1 of 4)

**Feature Branch**: `017-edge-protection`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Rendre Trefle résistant à un fort volume de trafic par conception, avec une protection anti-attaques nécessaire ; pouvoir invalider le cache d'une image qui en écrase une autre. Ne pas casser l'A/B test." Context: pre-spec research in `docs/cdn-cache-exploration.fr.md` (2026-10-09), §6–§9. This spec covers **lot 1** only; lots 2–4 are separate features.

## Context

Today every request to every Trefle host — public pages, images, fonts, the
admin, GrowthBook — reaches the single production server directly. Nothing in
front of it absorbs an attack or a traffic spike, and the server's address is
public. Images are re-processed by the image service every time a visitor's
browser does not already hold them, and fonts are served without any caching
instruction, so browsers keep re-checking them.

The research (see the exploration note) concluded that resisting high traffic
*by design* requires, in order:

1. **Lot 1 (this spec)** — put an edge network (Cloudflare) in front of every
   host, make the server reachable only through it, and serve images and fonts
   from the edge. Page HTML is still produced by the server on every request.
2. Lot 2 — move the per-visit elements (form anti-bot token, page-view
   counting) out of the page HTML.
3. Lot 3 — serve page HTML from the edge cache, with the security nonce
   injected at the edge and the cache purged on publish.
4. Lot 4 — move A/B assignment to the edge.

*Update 2026-10-12: lots 2–4 were delivered together as feature 020
(`specs/020-edge-html-cache`), live on every host since that date.*

Lot 1 delivers the attack protection and removes most of the bytes (images,
fonts) from the server's load, while leaving the page-rendering path — and
therefore A/B testing (008), the per-request security policy (002), the lead
form and view counting — exactly as they work today.

## Clarifications

### Session 2026-10-09

- Q: Client domains used at the root (e.g. `client-site.example`) — the provider only proxies a root domain by simple DNS pointing on its top tier. Move each client's DNS zone into Trefle's account, make `www.` the main host with the root redirected at the client's registrar, or decide per client? → A: **`www.` becomes the main host of every client domain; the root is redirected (permanent) to `www.` at the client's registrar.** Clients keep their own DNS; onboarding needs one CNAME record.
- Q: Target load for "resistant to high traffic by design"? → A: **1,000 page views per second sustained, with peaks ×10 (10,000/s).** This is the target of the whole programme (met once page HTML is served from the edge, lot 3); lot 1 records the baseline and must not regress it.
- Q: Provider plan level? → A: **Start on the Free plan; move to Pro when a documented trigger is met.** No architecture change between the two.
- Added by the user after planning: before an editor overwrites an image with a new file, warn them that the change applies everywhere the image is used, and **list the pages that use it** (« Attention, l'image que vous voulez remplacer est utilisée dans ces pages : … »).
- Q: And deleting an image that is used? → A: **Block it.** A used image cannot be deleted; the editor is told which pages use it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The sites stay up under attack (Priority: P1)

An attacker floods one of the public sites (or the admin, or the image host)
with traffic. The flood is absorbed before it reaches the server: visitors
keep loading pages and submitting the lead form, editors keep working. An
attacker who finds the server's address and targets it directly gets no
response, because the server only answers traffic arriving through the
protection layer.

**Why this priority**: Attack protection is the stated requirement, and the
direct-to-server bypass would void every other protection.

**Independent Test**: After the switch, request each host through its public
name (works) and directly by the server's address (refused or no answer).
Run a controlled burst against a public page from a single source and check
the protection layer limits it while a normal visitor is still served.

**Acceptance Scenarios**:

1. **Given** every Trefle host is behind the protection layer, **When** anyone
   sends a request straight to the server's address (any port, any host name),
   **Then** the server does not serve it.
2. **Given** a single source sends a burst of lead-form submissions, **When**
   it exceeds the edge limit, **Then** it is blocked at the edge and the
   server never sees the excess.
3. **Given** the switch is complete, **When** the server's previous address is
   looked up in public DNS history, **Then** it no longer points at the live
   server.

---

### User Story 2 - Nothing changes for visitors, editors and running A/B tests (Priority: P1)

The switch is invisible to people using Trefle. A visitor lands on a page that
has a running A/B test, gets a variant, keeps the same one when they come back,
fills the form and becomes a lead. Two visitors behind different connections
are never mistaken for one another by the lead form's abuse limits. An editor
on an allowed network still reaches the admin and GrowthBook; someone outside
it still cannot. Page scripts, analytics tags and admin custom code run as
before.

**Why this priority**: The user's explicit constraint ("ne pas casser l'A/B
test") and the reason the work is sliced: lot 1 must not regress anything
that already works.

**Independent Test**: Re-run the existing end-to-end suites (A/B bucketing,
lead capture, consent/tagging, custom code, admin access) against the switched
environment, plus a check that many distinct visitors can each submit the form
without being rate-limited as a group.

**Acceptance Scenarios**:

1. **Given** a page with a running A/B test, **When** two fresh visitors open
   it, **Then** each is assigned a variant independently, keeps it on reload,
   and their views and leads are counted for their own variant.
2. **Given** 50 visitors from distinct connections each submit the form once
   within a minute, **When** the submissions arrive, **Then** all 50 are
   accepted (none blocked by a per-visitor limit meant for one source).
3. **Given** an editor on an allowed network, **When** they open the admin or
   GrowthBook, **Then** it loads; **Given** a request from any other network,
   **Then** it is refused.
4. **Given** a published page with analytics tags and admin custom code,
   **When** a visitor loads it, **Then** the page's security policy is the
   same as before the switch and no script is blocked or rewritten by the
   protection layer.
5. **Given** an editor publishes a change, **When** a visitor reloads the
   page, **Then** they see the change exactly as fast as today (page HTML is
   not cached at the edge in this lot).

---

### User Story 3 - Images and fonts are served from the edge (Priority: P2)

During a traffic spike, images and fonts — most of a page's weight — come from
the edge network rather than from the server. Visitors whose browser supports
modern image formats get them; older browsers get the original format, never a
broken image.

**Why this priority**: The first concrete step towards "resistant by design":
it removes the heaviest and most repetitive load from the server without
touching page rendering.

**Independent Test**: Load a page twice from two different locations/clients;
on the second load, image and font responses are reported as served from the
edge cache. Request the same image with and without modern-format support and
check each gets a format it can display.

**Acceptance Scenarios**:

1. **Given** an image has been requested once, **When** another visitor
   requests it, **Then** it is served from the edge cache without reaching the
   server.
2. **Given** a browser that supports WebP and one that does not, **When** both
   request the same image URL, **Then** the first receives WebP and the second
   the original format.
3. **Given** a domain font file, **When** a returning visitor loads a page,
   **Then** the browser reuses its copy without re-checking it with the server
   on every visit.

---

### User Story 4 - Replacing an image updates it everywhere (Priority: P2)

An editor replaces a photo in the media library with a new file. Every page
that uses it shows the new photo to every visitor shortly after — the old one
is never served from a browser or edge cache in its place. When an image must
be taken down urgently (e.g. a rights complaint), an operator removes it and it
stops being served everywhere.

Before the new file is saved, the editor sees where the image is used. The
media item's page always shows « Utilisée dans : » with the pages (title,
domain, published or draft) and domains that use it. When the editor picks a
new file and saves, a confirmation lists those pages — « Attention, l'image
que vous voulez remplacer est utilisée dans ces pages : … » — explains that
the new image will appear in all of them, and suggests adding a new image
instead when only one page should change. Cancelling keeps the old file.

**Why this priority**: The user's explicit requirement; without it, long-lived
image caching (already one year in browsers today) makes replacements
unreliable, and edge caching would make it worse. Without the warning, an
editor fixing one page silently changes others.

**Independent Test**: Publish a page using an image, load it, replace the
image's file in the media library, reload the page from a fresh client and from
a client that had the old one cached: both show the new image within the target
delay. Run the take-down procedure and check the old image URLs no longer
return it.

**Acceptance Scenarios**:

1. **Given** a published page showing image X, **When** an editor replaces X's
   file, **Then** within 1 minute every page using X references the new file
   and visitors (new or returning) see it.
2. **Given** an image is replaced, **When** anyone requests one of its old
   URLs, **Then** this never causes the new image to be hidden or the old one to
   reappear on the pages.
3. **Given** an operator follows the take-down procedure for an image,
   **When** it completes, **Then** none of that image's URLs return it any more,
   from the server or the edge.
4. **Given** an image used by pages « Accueil » (published) and « Mariage »
   (draft), **When** an editor opens it, **Then** they see both pages listed
   with their domain and status, each linking to the page.
5. **Given** that image, **When** the editor chooses a new file and saves,
   **Then** before anything is saved a confirmation lists the pages using it
   and says the new image will appear in all of them; **When** they cancel,
   **Then** the old file is kept; **When** they confirm, **Then** the
   replacement proceeds (scenario 1).
6. **Given** an image used by no page, **When** the editor replaces its file,
   **Then** no confirmation is asked and the media page says it is not used.
7. **Given** an image used by at least one page, **When** anyone tries to
   delete it (from its page or from the media list), **Then** the deletion is
   refused with a message naming the pages that use it, and nothing is
   deleted; **Given** the same image once no page uses it, **Then** deletion
   works.

---

### User Story 5 - Onboarding a new client domain keeps the protection (Priority: P3)

An operator adds a new client domain to Trefle. Following the deployment guide,
they connect it so that it is protected like the existing ones from day one,
with a valid certificate and no window during which it is exposed directly.

**Why this priority**: Needed as soon as the next client arrives, but not for
the switch of the two existing domains.

**Independent Test**: Follow the updated guide on a test domain end to end and
check it behaves as in User Stories 1–3.

**Acceptance Scenarios**:

1. **Given** the updated deployment guide, **When** an operator onboards a new
   client domain, **Then** it is served through the protection layer with a
   valid certificate and the server refuses it when reached directly.

---

### Edge Cases

- The protection layer is unreachable or misconfigured during the switch:
  the switch must be reversible quickly back to direct serving, and the guide
  says how.
- A visitor's address is reported differently by the protection layer (IPv6,
  shared corporate network): the lead form's per-visitor limits use the
  visitor's real address as reported by the protection layer, never the
  protection layer's own address, and never a value the visitor can forge.
- Bot-detection features of the protection layer inject their own script into
  pages: it must work with the page security policy, or be disabled; it must
  never cause the security policy to be loosened.
- Certificate renewal for the server's own certificates must keep working
  while the server is reachable only through the protection layer.
- Server-to-server traffic (CMS → renderer revalidation, renderer → CMS API,
  image service → object store) stays on the internal network and is not
  affected.
- Email sending and the existing DNS records (mail, sender authentication for
  Brevo) keep working after the DNS move.
- A visitor or a search engine follows an old link to a client domain's root
  or to a root URL with a path: they land, through one permanent redirect, on
  the same path under `www.`, with the query string preserved.
- The client's registrar redirect does not support HTTPS on the root: the
  guide lists which registrar setups are acceptable and what to do otherwise
  (FR-016).
- An image used on many pages is replaced: all of them are updated, not just
  the one the editor came from.
- An image is replaced several times in a row: only the latest file is ever
  shown.
- An image is used by many pages (e.g. a logo on 40 pages): the list shows the
  first 20 and « et N autres », with a link to the full list.
- A page still references the image by one of its previous addresses: it is
  listed like any other user of the image.
- An image is the share image (Open Graph) of a page or the default share
  image of a domain: it is listed as such.
- A page uses the image only while in draft: it is listed with its draft
  status (it will show the new image once published). It also blocks
  deletion.
- Several images are deleted at once from the media list, some used: the
  used ones are refused (each with its pages), the unused ones are deleted.
- An unfinished page or site import cleans up the images it created: this
  automatic cleanup is not blocked (those images belong to the cancelled
  import only).
- An image that must be taken down urgently is still used: the take-down
  replaces its file (FR-015), which removes the old file without breaking the
  pages.
- Today, replacing a media file deletes the old file while pages still point
  at it (found during planning, research R11): after this feature, pages that
  used the replaced image show the new one instead of a broken image.

## Requirements *(mandatory)*

### Functional Requirements

**Protection & origin lock-down**

- **FR-001**: Every Trefle public host (each client domain, the image host,
  the asset host) and every internal tool host (admin, GrowthBook UI and API)
  MUST be served through the edge protection layer.
- **FR-002**: The server MUST refuse every request that does not come through
  the protection layer, and MUST additionally authenticate that the request
  comes from Trefle's own protection-layer account (not merely from the
  provider's network).
- **FR-003**: After the switch, the server MUST move to an address that has
  never been published in DNS, and no public record MUST point at it.
- **FR-004**: Traffic between the visitor and the protection layer, and
  between the protection layer and the server, MUST be encrypted with
  certificates that are verified end to end; certificate issuance and renewal
  MUST keep working unattended.
- **FR-005**: The protection layer MUST rate-limit lead-form submissions per
  source before they reach the server.
- **FR-006**: The protection layer's features that rewrite page HTML or
  scripts (script loaders, email obfuscation, automatic image re-optimisation)
  MUST be off.

**No regression**

- **FR-007**: The renderer MUST keep seeing each visitor's real address,
  taken only from the value the protection layer sets (never from a header a
  visitor could forge); the lead form's existing per-visitor limits
  (003-post-launch-improvements FR-001) MUST behave as before.
- **FR-008**: Access to the admin and GrowthBook MUST stay restricted to the
  allowed networks, enforced at the edge and still at the server.
  *Superseded by 019-admin-access (2026-10-16): the restriction is by verified identity (Cloudflare Access + Caddy token check), not by address; the address rule and `ADMIN_ALLOWED_IPS` are removed.*
- **FR-009**: Page HTML MUST NOT be cached by the protection layer in this
  lot: every page request still reaches the renderer, so A/B assignment and
  stickiness (008 FR-005/FR-006), the per-request security policy (002), the
  form anti-bot token and view counting behave exactly as today.
- **FR-010**: The page security policy MUST be unchanged by this feature; any
  script the protection layer adds MUST run within it, or the feature that
  adds it MUST be off.

**Images & fonts**

- **FR-011**: Image responses MUST be cached at the edge, separately for
  clients that accept WebP and clients that do not.
- **FR-012**: Font and other asset-host files MUST carry explicit caching
  instructions so browsers and the edge reuse them, and MUST change URL when
  their content changes.
- **FR-013**: Every image URL a published page uses MUST change whenever the
  underlying media file changes, so that a replaced image can never be served
  from any cache in place of the new one.
- **FR-014**: Replacing a media file MUST refresh every published page that
  uses it, within 1 minute.
- **FR-015**: Operators MUST have a documented procedure to take an image down
  so that none of its URLs return it any more, from the server or the edge —
  for an unused image by deleting it, for a used one by replacing its file
  (FR-021) — followed by a purge of its old addresses.
**Domains & operations**

- **FR-016**: Every client domain MUST be served on its `www.` host, connected
  to the protection layer by a DNS record the client adds at their own
  registrar; clients keep managing their DNS zone. The root of a client domain
  MUST permanently redirect to the same path (and query string) on `www.`,
  over HTTP and HTTPS. Trefle's own domain is not concerned (its zone is in
  Trefle's account).
- **FR-016a**: For the existing client domain served at the root
  (`client-site.example`), the domain's configuration in the admin
  (and any canonical URL or sitemap entry, should one exist — none is
  generated today) MUST move to `www.`, and every existing root URL MUST keep working through the redirect,
  so search ranking and shared links are preserved.
- **FR-017**: The deployment guides (EN + FR) MUST cover the switch, the
  rollback, onboarding a new client domain, and the image take-down procedure.
- **FR-018**: The protection layer configuration MUST be reproducible from the
  repository (documented or scripted), not held only in a dashboard.
- **FR-019**: Legal notices and the processing register MUST list the
  protection layer provider as a processor.

**Media usage (admin)**

- **FR-020**: A media item's page in the admin MUST show where it is used:
  every page whose content references it (by its current or any previous
  address) or that uses it as share image, with the page title, domain,
  published/draft status and A/B-variant marker, each linking to the page;
  and every domain using it as default share image or favicon. Unused media
  MUST say so.
- **FR-021**: Saving a new file over a media item that is used (FR-020) MUST
  first show a confirmation listing those usages, stating that the new image
  will appear everywhere it is used and suggesting to add a new image instead
  for a one-page change. Cancelling MUST leave the media item unchanged.
  Unused media are replaced without confirmation.
- **FR-022**: Deleting a media item that is used (FR-020) MUST be refused,
  whoever asks and from wherever (its page, the media list, bulk delete, the
  API), with a message naming the pages that use it and what to do (remove it
  from those pages or replace its file). The only exception is the automatic
  cleanup of an unfinished import of the images that import created.

### Key Entities

- **Protected host**: a hostname Trefle serves (client domain, image, asset,
  admin, GrowthBook) with its protection settings (proxied, cache rules,
  access restriction).
- **Media version**: a value that changes whenever a media item's file
  changes, carried in every URL derived from that media item.
- **Media usage**: for a media item, the pages (and domains) that use it,
  derived from page content and share-image settings; computed when asked,
  not stored.
- **Page ↔ media usage**: which published pages reference which media items,
  so a media change can refresh exactly those pages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests sent directly to the server's address, on any
  host name, are refused.
- **SC-002**: The full existing end-to-end suite (A/B, lead capture, consent &
  tagging, custom code, admin access) passes against the switched environment
  with no change to its expectations.
- **SC-003**: 50 visitors from distinct connections can each submit the lead
  form within one minute with zero rejections.
- **SC-004**: After warm-up, at least 95% of image and font requests are
  served without reaching the server.
- **SC-005**: A replaced image is shown on every page using it, to new and
  returning visitors, within 1 minute of the editor saving it.
- **SC-006**: A load test is recorded before and after the switch. The
  programme target is **1,000 page views per second sustained, with peaks of
  10,000/s**, with no failed lead submission; it is the acceptance target of
  lot 3. For lot 1, the after-switch run MUST show no regression on page views
  versus the baseline, and at the target volume image and font traffic MUST
  NOT reach the server beyond the first request of each file.
- **SC-007**: Rolling back to direct serving takes under 15 minutes following
  the guide.
- **SC-008**: Every root URL of a client domain reaches the same page on
  `www.` in exactly one redirect.
- **SC-009**: In 100% of attempts to replace the file of a used image, the
  editor sees the list of pages using it before anything is saved, and every
  page listed actually uses the image (no missing page, no false entry, in the
  test set).
- **SC-010**: 100% of attempts to delete a used image are refused with the
  list of pages, and no published page ever loses an image through a
  deletion.

## Assumptions

- **Provider**: Cloudflare, per the exploration note (anti-attack requirement
  rules out a pure CDN). **Plan: Free to start** (unmetered DDoS mitigation,
  5 custom firewall rules, 1 rate-limiting rule, basic managed rules). The
  deployment guide documents when to move to Pro (~20 $/month per zone: full
  OWASP rule set, more rate-limiting rules) — e.g. an application-layer attack
  the Free rules cannot stop, or a need for a second rate-limiting rule.
  Client domains are custom hostnames on Trefle's zone, so the plan applies
  once, not per client.
- The Trefle zone (`example.com`) moves to the provider's DNS; all
  existing records (mail, Brevo sender authentication) are copied over first.
- The provider's servers and edge logs are outside the EU; this is acceptable
  with an updated processor listing (FR-019).
- Page HTML caching, the edge-injected security nonce, moving the form token
  and view counting out of the HTML, and edge A/B assignment are out of scope
  (lots 2–4).
- The two existing domains are the only ones to switch now; new client
  domains follow FR-016/FR-017. Connecting client `www.` hosts uses the
  provider's custom-hostname service (100 hostnames included, then a small
  monthly fee each).
- How Payload stores a replaced media file (same object key or a new one) is
  verified in planning; FR-013 holds either way.
- The image service already sends one-year public caching; edge caching relies
  on it rather than on a separate rule.
- Adding an edge layer outside the declared stack is a constitution matter
  (Principle II, Architecture section); it is justified in the plan and the
  Architecture section is amended as part of this feature.
