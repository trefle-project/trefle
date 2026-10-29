# Trefle features

Trefle builds and publishes landing pages and small websites on many domains,
captures leads in a GDPR-compliant way, and measures pages with A/B tests. This
document describes every feature, grouped by what you do with it. Each section
links to the specifications (`specs/NNN-…`) where the detailed requirements,
design decisions and tests live.

- [At a glance](#at-a-glance)
- [Architecture](#architecture)
- [1. Authoring pages](#1-authoring-pages)
- [2. Importing existing designs](#2-importing-existing-designs)
- [3. Domains and publishing](#3-domains-and-publishing)
- [4. Lead capture](#4-lead-capture)
- [5. Privacy and GDPR](#5-privacy-and-gdpr)
- [6. Tagging and consent](#6-tagging-and-consent)
- [7. A/B testing and statistics](#7-ab-testing-and-statistics)
- [8. Edge delivery and protection (Cloudflare)](#8-edge-delivery-and-protection-cloudflare)
- [9. Admin, security and operations](#admin-security-and-operations)
- [Current limits](#current-limits)
- [Feature map: specs by area](#feature-map-specs-by-area)

## At a glance

| Area | What you get |
|---|---|
| Authoring | Visual block editor (GrapesJS) inside the admin (Payload), page types and templates, carousel, direct HTML/CSS editing, custom scripts with consent gating, per-domain self-hosted fonts |
| Import | A web page by URL (AI-assisted conversion), a saved web page file, or a whole Penpot design as editable draft pages |
| Publishing | Any number of domains from one workspace, host-based routing, instant revalidation, legal pages generated per domain |
| Leads | Spam-resistant lead form, consent evidence, double opt-in e-mail, error recovery, notifications, CSV export |
| GDPR | Consent records, data-subject export and erasure, unsubscribe, retention sweeps, privacy policy and legal notice, cookie banner |
| Measurement | GTM with Google Consent Mode, page view statistics, multi-variant A/B tests with Bayesian significance and broken-test warnings |
| Edge (optional) | Cloudflare WAF and rate limiting, edge-cached images and fonts, edge-cached HTML personalised per request by a Worker, client domains as custom hostnames |
| Admin security | Roles, invitations, two-factor login, Cloudflare Access in front of the admin with a second token check at the origin, activity log |

## Architecture

| Component | Stack | Role |
|---|---|---|
| `cms` (`apps/cms`) | Payload 3 on Next.js, GrapesJS | Admin, content and lead storage, GDPR endpoints, background jobs (imports, retention, A/B analysis) |
| `web` (`apps/web`) | Next.js (App Router, ISR) | Public renderer for every domain, lead intake API, legal and confirmation pages |
| `edge` (`apps/edge`) | Cloudflare Worker | Optional: serves cached HTML, assigns A/B variants, signs form tokens, counts views |
| `db` | PostgreSQL 16 | Payload's database; only the CMS talks to it |
| Object storage | Garage (S3-compatible) | Media, fonts, imported images |
| `imgproxy` | imgproxy | Resizes images on the fly from signed URLs only |
| GrowthBook | self-hosted | A/B experiment analysis |
| Caddy | reverse proxy | TLS, host routing, security headers, Access token check |

The renderer never touches the database: it reads published content through
Payload's REST API with a read-only service key. A **domain is a routing
unit, not a tenant**: one workspace serves every domain. Everything runs with
Docker Compose, on a laptop or on a single VPS.

## 1. Authoring pages

**Block editor.** Pages are built in GrapesJS, embedded as a field of the
Payload `Pages` collection. The block library includes Section, Columns,
Text, Image, Testimonial, Call-to-action button, the lead Form, Carousel and
Custom code. Previews show desktop, tablet and mobile widths, and a preview
link renders the draft exactly as the public site would. *(001, 012 US3)*

**Page types.** Every page is one of three types *(004)*:

| Type | Purpose | Rules |
|---|---|---|
| Subscription | A landing page that captures leads | Must contain exactly one lead form to publish |
| Free | A content page (home, article, about…) | No form required |
| Confirmation | Shown after a submission | Always carries the unsubscribe link, can never be a form target |

New pages start from a template matching their type *(003 US5, 004 US3)*.
A guided creation flow asks for the domain, path and type first and checks
for a path conflict before any work is done *(004 US4)*.

**Languages.** An admin-managed list of languages; every page is tagged
with one, every domain has a default, and every lead is stamped with the
language of the page it came from *(005)*.

**Direct code editing.** A « Code » view edits the page's HTML and CSS with
syntax highlighting and formatting. Before applying, it lists everything the
sanitiser will remove at publication (scripts, inline handlers,
`javascript:` links, `<style>`, foreign forms). *(014 US2)*

**Custom scripts and widgets (admins only).** Page-level scripts in the head
or at the end of the body, and a « Custom code » block placed anywhere in
the page. Each script is either *essential* or *requires cookie consent*;
consent-gated code starts as soon as the visitor accepts, without a reload,
and never runs after a refusal. Scripts also apply to A/B variants and the
confirmation page; every change is written to the activity log. *(014 US1,
US3)* — guide: [Custom code](custom-code.md).

**Carousel.** An accessible carousel block: 1–12 slides that hold any
blocks, 1–3 visible slides on desktop, optional autoplay (paused on hover,
focus or interaction, never with reduced motion), arrows and dots, keyboard
and swipe navigation, lazy-loaded images, and it still scrolls without
JavaScript. A lead form cannot be put inside a carousel. *(016)* — guide:
[Carousel](carousel.md).

**Media.** A media library on S3 storage; published images are served
through imgproxy at the right size. « Replace everywhere » swaps an image
across all pages, and the edge cache is purged so the new image shows at
once *(017 US4)*.

**Domain fonts.** Google Fonts are added to a domain by name and weight.
Trefle downloads the files once and serves them itself: visitors never
contact Google. Each font shows how many pages use it *(015 US4)*.

## 2. Importing existing designs

Three importers turn existing work into ordinary, editable draft pages.
None of them ever modifies or publishes an existing page.

**From a URL** *(012)*. Paste the address of a public page: a headless
browser renders it at three widths, an AI model (Claude, through the
Anthropic API) maps it to Trefle's blocks, texts are kept verbatim, images
go to the media library, and the source page's form becomes the lead form.
Costs are capped by a monthly budget and a per-user budget set in the admin.
The import refuses private network addresses (SSRF guard). Hidden unless an
API key is configured.

**From a saved file** *(013)*. When a site blocks automated visits, or the
page is only visible to the editor (behind a login), save it from the
browser (« Web page, complete » or a single-file HTML/MHTML) and upload the
file. Same conversion as the URL import.

**From a Penpot design** *(015)*. Upload a `.penpot` export: each top-level
board becomes a draft page, made of editable blocks. No AI and no cost — a
deterministic converter that keeps flex and grid layouts responsive, texts
verbatim with their typography, heading levels from text styles, images (to
WebP, with alt text from layer names), vector shapes as SVG, and prototype
links as real links between the new pages. Fonts are added to the domain.
Each draft carries an import report: what to do before publishing,
what was simplified, accessibility warnings (contrast, headings) and layout
problems found at three screen widths. Switched on with `PENPOT_IMPORT=on`.
Guide: [Penpot import](penpot-import.md).

## 3. Domains and publishing

**Multi-domain.** Register any number of domains (and subdomains) in the
admin; assign each page a domain and a path; publish. The renderer routes by
`Host` header. Unknown paths return 404. A domain (or its `www`) pointed at the
server before any page exists shows a default landing page instead of a bare
404 *(001, 003 US4)*.

**Publishing.** Publishing or editing a published page revalidates exactly
the affected cache entries, with retries so an edit always reaches the
public site *(003 US2)*. With the edge enabled, the edge cache is purged too
*(020 US3)*.

**Legal pages per domain** *(021, 022 US3)*. Every domain serves a privacy
policy (`/privacy`) and a legal notice (`/legal-notice`),
generated from the operator's identity, the domain owner's identity (who
owns the content and manages the leads), the list of suppliers and editable
texts in every language. Lead forms link to the domain's policy. The admin
lists what is still missing; headings of empty sections are hidden.

**Confirmation and form-retry pages.** Each domain has an editable
confirmation page with the unsubscribe link *(003 US3)*, and a no-JavaScript
fallback page for form errors *(009)*.

## 4. Lead capture

**Lead form.** A single form block, configurable fields, consent checkbox
with the purpose text. Submissions go to the `web` intake API, which
validates them with the shared zod schemas and stores them through the CMS.
*(001 US1)*

**Spam resistance.** A honeypot field, a fill-time check, a signed form
token, and rate limits per IP and per e-mail address. Behind Cloudflare, a
rate-limiting rule protects the intake endpoint as well *(001, 017)*.

**Error recovery.** When a submission is rejected, the visitor gets the
page back with their input kept and the message next to the field to fix —
also without JavaScript *(009)*.

**Double opt-in.** Confirmation e-mails are authored in the admin (per
language) and attached to a page. A submission sends the e-mail; the click
on the link records the confirmation, and staff see who confirmed *(006)*.

**Notifications.** Optional e-mail to a list of addresses for every new
lead; a per-installation sender address.

**Review and export.** Leads are listed with filters (page, domain,
language, date range) and exported as CSV, by default only those with
consent *(001 US2, 005 US5, 010)*.

## 5. Privacy and GDPR

GDPR compliance is part of the design, not an option *(001 US3–US4, 021)*:

- **Consent evidence** for every lead: the exact consent text and its
  version, timestamp, IP address and user agent, the page and variant seen.
- **Unsubscribe and consent withdrawal** from a signed link in every
  e-mail and on the confirmation page.
- **Data-subject requests**: export or erase all data about an e-mail
  address from the admin, recorded in a request log.
- **Retention**: a scheduled job deletes leads older than the configured
  retention period (24 months by default) and A/B data 30 days after a
  test ends.
- **Logs** never contain personal data (redaction is tested).
- **Legal templates** for operators in France: a data processing agreement
  and a record of processing activities, in `docs/legal/` (French).

## 6. Tagging and consent

**Google Tag Manager per domain** *(007)*. Enter a GTM container id on a
domain — no deployment needed. A cookie banner (translated per language)
drives Google Consent Mode, so no tag sets a cookie before the visitor
accepts. A documented `dataLayer` contract (`page_view`, `lead_form_view`,
`lead_form_submit_success`, `lead_form_submit_error` with a reason,
`unsubscribe_complete`) lets marketing build funnels.

**Audience measurement page.** Each domain explains how its pages are tested
and measured (`/audience-measurement`) *(018)*.

## 7. A/B testing and statistics

**Page statistics.** Views and submissions per page, per hour, with a
calendar date-range filter on every admin list and report; one row per
page with its totals over the chosen period *(010, 022 US1)*.

**A/B tests** *(008)*. From any published page, create variants (copies you
edit freely), start a test with a traffic split, and watch live results from
the page itself. Promote the winner (it replaces the original at the same
address) or conclude without promoting. All running tests are listed in one
place. The variant is drawn at random on every view, with no cookie, which also
keeps pages cacheable.

**Statistical significance** *(018)*. Results are analysed by a self-hosted
GrowthBook reading a dedicated read-only view: Bayesian « chance to win » and a
sample-ratio-mismatch check that warns when the test itself is broken.

**Privacy by design.** Measurement stores nothing on the visitor's device: each
view gets a random number carried only in the page's signed form token, one
"exposure" (number, test, variant, date) is recorded per view, and a lead sent
from that view is linked to it. No cookie means no consent banner is needed
for tests; the data is deleted 30 days after the test ends. The reasoning,
checked against the French data protection authority's (CNIL) 2025 guidance,
is in [ab-measurement-cnil.md](ab-measurement-cnil.md). Exposures reach the
server losslessly through a queue, in batches.

## 8. Edge delivery and protection (Cloudflare)

The edge layer is optional: Trefle runs without it, and every edge feature
has a switch to turn it off (`infra/cloudflare/edge-off.sh`). It is fully
described as code in `infra/cloudflare/` (rules, settings, Access, routes).

**Protection** *(017)*. Cloudflare in front of every host: WAF managed and
custom rules, rate limiting on lead intake, the origin reachable only from
Cloudflare (firewall + Authenticated Origin Pulls with a private CA, TLS
certificates by DNS-01 delegation).

**Media at the edge** *(017 US3–US4)*. Images and fonts are cached at the
edge for a year; replacing an image purges exactly its URLs.

**Client domains** *(017 US5)*. A client's domain is added as a custom
hostname on the operator's zone, so it gets the same protection without
moving its DNS (`infra/cloudflare/add-client-domain.sh`).

**HTML at the edge** *(020)*. Published pages are cached at the edge and
personalised per request by a Worker: a fresh form token and the A/B variant
drawn for this view. Nothing is lost compared with the origin. Edits
purge the edge cache immediately. Views are counted at the edge (Analytics
Engine) and synced to the CMS in batches, so a traffic spike never reaches
the server. Load tests (`infra/loadtest/`, k6) cover pages, images and
leads.

## Admin, security and operations

**Members and roles** *(001 US5, 019 US3)*. Two roles: *admin* (everything)
and *editor* (pages, media, imports; no scripts, no settings, no member
management). Members are invited by e-mail and set their own password.
Admins add, remove and recover members, including resetting a lost second
factor.

**Two-factor login** *(019 US2)*. Authenticator-app codes (TOTP) at the
admin login, required in production.

**Access at the edge** *(019 US1)*. The admin and GrowthBook sit behind
Cloudflare Access: only active members, proven by an e-mail code, reach
them — no IP allow-list to maintain. Caddy verifies Access's signed token
again at the origin. The member list is synchronised from the CMS.

**Hardening** *(002, 003 US1)*. Strict security headers and a Content
Security Policy on every public surface, no known-vulnerable dependencies
in CI, a documented secret-delivery mechanism, and a production stack that
refuses to start with weak or missing secrets.

**Activity log.** Sensitive changes (scripts, custom code, settings,
members) are recorded with their author.

**Admin experience** *(022)*. Navigation grouped the way the team works;
the operator's own logo, icon, background pattern and favicon on the
admin; member avatars; dates shown in each member's time zone.

**Admin language** *(023)*. The admin is in French or English: the
framework's screens, Trefle's labels and screens, the page editor, server
messages and import reports. The installation sets the default (also the
login page's); each member can choose their own in their account. Trefle's
own texts shown to visitors (form messages, confirmation and unsubscribe
pages, carousel controls…) follow the page's language: French on a French
page, English on any other. Public legal paths are English (`/privacy`,
`/legal-notice`, `/audience-measurement`); the old French addresses
redirect to them.

**Operations.** Docker Compose for development (with Mailpit and a local
Garage) and production; a step-by-step runbook for a single VPS
([`infra/deploy/README.md`](../infra/deploy/README.md)); `preflight.sh`
checks the configuration; `release.sh` deploys a release tag and rolls back
to the previous one; nightly database dumps. CI runs lint, type checks,
unit tests and the whole stack with Playwright end-to-end tests.

## Current limits

- The **admin interface is in French or English** only; the generated
  legal pages are in French (editors add their own translations). Public
  page content can be in any language.
- The production runbook assumes **one VPS behind Cloudflare**. Running
  without Cloudflare is possible (see the runbook's rollback section) but
  less documented.
- **Legal templates** target French and EU law.
- Imports do not create carousel blocks yet; an imported carousel keeps its
  first slide and is reported.

## Feature map: specs by area

| Spec | Title | Area |
|---|---|---|
| [001](../specs/001-landing-page-lead-capture/) | Landing pages with GDPR-compliant lead capture | Foundation: authoring, publishing, leads, GDPR, roles |
| [002](../specs/002-security-hardening/) | Deploy-blocking security hardening | Security |
| [003](../specs/003-post-launch-improvements/) | Post-launch fixes and improvements | Publishing, security, templates |
| [004](../specs/004-page-types/) | Page types (subscription / free / confirmation) | Authoring |
| [005](../specs/005-content-language-tagging/) | Content language tagging | Authoring, leads |
| [006](../specs/006-double-optin-email/) | Double opt-in confirmation e-mail | Leads |
| [007](../specs/007-gtm-tagging/) | Google Tag Manager and cookie consent | Tagging |
| [008](../specs/008-ab-testing/) | Page A/B testing | Experiments |
| [009](../specs/009-lead-form-error-recovery/) | Lead form error recovery | Leads |
| [010](../specs/010-date-range-filters/) | Date-range filters | Admin |
| [012](../specs/012-url-page-import/) | Import a page from a URL | Import |
| [013](../specs/013-saved-page-import/) | Import a page from a saved file | Import |
| [014](../specs/014-custom-code-editing/) | Custom code and direct HTML editing | Authoring |
| [015](../specs/015-penpot-site-import/) | Import a website from a Penpot file | Import |
| [016](../specs/016-carousel-block/) | Carousel block | Authoring |
| [017](../specs/017-edge-protection/) | Edge protection and media caching | Edge |
| [018](../specs/018-ab-significance/) | Statistical significance for A/B tests | Experiments |
| [019](../specs/019-admin-access/) | Admin access: edge identity and two-factor login | Security |
| [020](../specs/020-edge-html-cache/) | Page HTML served from the edge cache | Edge |
| [021](../specs/021-legal-pages/) | Legal pages per domain | GDPR |
| [022](../specs/022-ux-improvement/) | Admin UX improvements | Admin |
| [023](../specs/023-admin-i18n/) | Bilingual admin (French / English) | Admin |

Number 011 is not used.
