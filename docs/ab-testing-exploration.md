# A/B testing — exploration notes

Status: **pre-spec exploration**. This captures a design conversation, not a
committed plan — no `spec.md`/FRs exist yet for this feature, one item is
deliberately deferred to a separate session (see §6), and nothing here
should be treated as decided until it goes through Spec Kit
(`/specify` → `/plan`) like every other feature in `specs/`. Written to be
picked back up later without re-deriving this reasoning from scratch.

Vendor-behavior reference (self-hosting specifics, the Next.js SDK, the
cache/cookie pitfall, GrowthBook's official AI-agent tooling) lives
separately in the `growthbook` skill
(`.claude/skills/growthbook/SKILL.md`) — this document is the project's
design record ("what we're building"), that skill is technology reference
("how the vendor's API/SDK actually behaves"). Read both before writing
the spec.

## 1. Motivation

Trefle publishes landing pages for lead capture. A/B testing page content
(headline, hero, CTA, or whole-page layout) against real conversion data is
a natural next capability, but the stack has constraints most generic A/B
tooling doesn't assume: everything is self-hosted on a single VPS, the
renderer is deliberately cache-first (ISR + cache tags, ADR-adjacent
Principle II "Stack-Native"), and the block editor (GrapesJS, inside
Payload) exports a flat, sanitised HTML/CSS string — not a component tree
the renderer can parameterise.

## 2. Tool landscape

Evaluated against: self-hostable, no third-party cookies/consent banner
required, operationally light enough for a single Hostinger KVM 2 VPS,
first-class Next.js App Router support.

| Tool | Storage | Infra weight | A/B stats engine | Verdict |
|---|---|---|---|---|
| **GrowthBook** | 1 Docker image (Next + Express + Python stats engine) + **MongoDB** for config/metadata; can use the existing Postgres as the *datasource* for experiment metrics (no separate warehouse needed) | Light | Best in class OSS (Bayesian + frequentist), visual editor | **Primary candidate** |
| **Flagsmith** | Postgres natively — no second DB engine | Light | Weaker than GrowthBook's, feature-flag-first | Fallback if avoiding a second DB engine outweighs stats quality |
| **PostHog** | Postgres + ClickHouse + Kafka + Redis + MinIO | Heavy — docs recommend 16GB+ RAM, "a dedicated server, not a VPS workload" | Good, but buried in a much larger analytics suite | Ruled out — over-provisioned for this VPS |
| **Unleash** | Postgres | Light | Weak on experimentation, mostly feature flags | Ruled out — OSS Edge sunsets 2026-12-31, adds a future paid dependency |

**Leaning GrowthBook.** Its only real operational cost versus Flagsmith is
a second database engine (MongoDB) to back up alongside Postgres — worth
weighing against the fact that the offsite backup cron isn't installed yet
on the production VPS (see the Trefle prod VPS memory note). Everything
else favours it: reuses Postgres as the metrics datasource, MIT-licensed
core, local (cookie-optional) deterministic-hash assignment — no vendor
cookies, no consent-banner trigger — and a first-class Next.js App Router
SDK via the Vercel Flags SDK adapter.

## 3. Performance: avoiding cache loss

Confirmed risk, not hypothetical: reading `cookies()`/`headers()` during
render — which cookie-based bucketing does — makes the *entire* Next.js
route dynamic and uncacheable (`private/no-store`). There is currently no
`Vary`-for-ISR mechanism in Next.js (see the linked core-team discussion
below); a naive integration would silently undo the ISR/cache-tag
architecture `apps/web` is built around, sending every request for a
tested page through to Payload.

> **Superseded (2026-10-09)** — the Partial Prerendering mitigation below
> does not hold in this stack: Next 16 documents PPR as incompatible with a
> nonce-based CSP, which 002-security-hardening keeps. Block-level tests are
> instead resolved at render time today and at the edge once HTML is cached
> — see §8.

**Mitigation: Partial Prerendering (stable in Next 16, already in this
stack).** Isolate the cookie-dependent read inside a small `Suspense`
boundary — a leaf component, never a page-level `cookies()` call — so only
that fragment is dynamic and everything else keeps being served from the
existing ISR cache untouched. This is the deciding factor behind preferring
the fine-grained test granularity (§4, Option B) wherever the test is
small enough to fit it: it turns "lose the page's cache" into "one cheap,
DB-free dynamic island."

Where a whole page differs (Option A), there is no fragment to isolate —
accept that each variant becomes its own independent ISR cache entry
(bounded ×2 storage/revalidation per tested page, not full cache loss).

Sources: [Next.js and Vary — why it's currently impossible to cache
variants "properly" (vercel/next.js
discussion)](https://github.com/vercel/next.js/discussions/82571),
[Next.js 16 — Partial Prerendering /
Cache Components](https://nextjs.org/blog/next-16), [GrowthBook + Next.js
App Router guide](https://docs.growthbook.io/guide/nextjs-app-router).

## 4. Two test granularities, mapped onto GrapesJS

The renderer only ever consumes `builder.html`/`builder.css` — a flat
export, sanitised through a fixed DOMPurify allow-list
(`apps/web/src/lib/render.ts`) that already permits `data-*` attributes.
Each GrapesJS block carries a `data-block="<type>"` marker from a closed
vocabulary (`apps/cms/src/fields/grapesjs/blocks.ts`), counted server-side
and enforced by `publishGuard`. `render.ts` already does targeted
marker-based HTML surgery once, for the lead-form placeholder
(`splitAroundForm`) — the precedent any new swap logic should follow.

### Option A — whole-page variant

Reuses Payload's existing page-duplication mechanics (`beforeDuplicate`
hooks already customised on `title`/`path`/`status`/`publishedAt`).

- A new self-relationship field, `experimentOf: relationship → pages`,
  marks a page document as a challenger variant of a control page.
- Variant pages are edited in GrapesJS exactly like any other page — **no
  GrapesJS work required**.
- `publishGuard`'s domain/path requirements and (domain, path) uniqueness
  check need an exception for documents with `experimentOf` set: a variant
  is never resolved by its own URL, only via the control's page lookup.
- `apps/web`'s page-fetch, when the resolved control has active variants,
  asks GrowthBook for the visitor's bucket and fetches the winning
  variant's `builder.html`/`css` instead of the control's.
- Lowest implementation effort; cache cost is the bounded ×2 described in §3.

### Option B — in-page element variant

Needs a genuinely new GrapesJS component, on the model of the existing
`lead-form` leaf block, but as a *container* with two fixed drop zones
("Variant A" / "Variant B") instead of one leaf.

- New `GJS_BLOCKS` entry, e.g. `id: "ab-test"`; each slot carries
  `data-experiment="<key>" data-variant="a|b"` — already passes
  `ALLOW_DATA_ATTR: true` in `sanitizeHtml`, no allow-list change needed.
- `render.ts` gains a sibling of `splitAroundForm` to extract both
  fragments before sanitisation, leaving a marker for the renderer.
- At render time the marker becomes the `Suspense`-wrapped island from §3
  — reads the local GrowthBook bucket (no network call), injects only the
  winning fragment. Every other block on the page is untouched, so ISR
  caching on the rest of the page is fully preserved.
- Higher implementation effort (a real constrained-slot GrapesJS
  component), but the better cache fit for granular tests on high-traffic
  pages.

**Recommendation:** ship Option A first — it needs zero GrapesJS surface
work and validates the GrowthBook integration and `apps/web` branching
logic end to end. Build Option B later if/when fine-grained tests on
high-traffic pages justify the custom-component investment.

**The two are orthogonal, not mutually exclusive.** Option A decides which
whole *page document* gets fetched (before rendering); Option B decides
which *fragment* gets rendered inside whatever page was fetched (during
rendering). A challenger page produced by Option A is an ordinary `Page`
document, rendered through the same `render.ts` pipeline as any other —
nothing about building Option A first forecloses giving that same page an
in-canvas Option B test later. Two things to design for now so the eventual
composition stays clean:

- **Experiment-key namespacing** — an Option A experiment's
  `growthbookExperimentKey` (one per control page) and an Option B test's
  `data-experiment="<key>"` (set inside the canvas) must be guaranteed
  distinct in GrowthBook, or two unrelated experiments could collide.
  Straightforward (e.g. prefix by page id) but worth stating explicitly
  before Option B's schema is designed.
- **Promotion doesn't cascade** — promoting an Option A winner (§5.2) does
  not conclude any Option B test embedded inside that page's own canvas;
  they are independent state machines. Worth surfacing in the promotion UI
  later so an operator isn't surprised that an in-page test kept running
  after a whole-page promotion.

## 5. Option A mechanics, worked through

### 5.1 Duplication has two distinct, explicit actions — not one action that branches

A single "Duplicate" button silently producing two different outcomes
would be ambiguous; the operator must choose.

- **"Duplicate"** — Payload's existing behaviour, unchanged: independent
  page, own `-copy` path, publishes on its own.
- **"Create test variant"** — a new custom admin action (same pattern as
  `PageLiveUrl`/`RevalidationStatus`, already registered in `Pages.ts`'s
  `beforeDocumentControls`), backed by a dedicated endpoint (same pattern
  as `pageConflictCheckEndpoint`). It copies `builder`/`form`/`seo`, sets
  `experimentOf` to the source page's id, and leaves `domain`/`path`
  unset — those fields become admin-hidden (`admin.condition` on
  `experimentOf`) since a variant is never looked up by its own URL.
  **Repeatable by design** (multivariate is the committed default, not a
  later extension — see §5.3): invoking it again on the same control adds
  variant C, D, etc. Nothing about the action assumes exactly one
  challenger.

### 5.2 Promotion: content copy, never an identity swap

The winning variant's document **never becomes** the control. The control
page's id is load-bearing elsewhere — `leads.page`, `page-stats`,
`pageActivity`, and other pages' `confirmationPage` relationships all
point at it — so swapping identity would require migrating every one of
those relationships for no benefit. Instead, promotion:

1. Copies the winning variant's `builder`/`form`/`seo` fields **onto** the
   control document — same id, same `domain`/`path`, same leads already
   attached, no relationship migration.
2. Saves the control normally, so the existing `afterChange: [pageRevalidate,
   pageActivity]` hooks fire — cache invalidation for the promoted content
   is free, no new invalidation code needed.
3. Archives (never deletes) the losing variant(s) — an
   `experimentStatus: "lost"`-style field, consistent with how
   `leadReferenceGuardOnDelete`/`cascadePageStatsOnDelete` already protect
   against silent data loss elsewhere in this collection.
4. Concludes the experiment on both sides — 100% rollout to control in
   GrowthBook, `experimentOf`/variant list cleared or marked concluded in
   Payload — so `apps/web` stops branching entirely and serves
   `control.builder.html` directly, same as any ordinary page today.

Promotion should be a **manual, confirmed** action, not automatic on
reaching statistical significance — consistent with this collection's
existing high-impact-action pattern
(`confirmationGuardOnDelete`/`confirmationGuardOnUnpublish`).

### 5.3 Experiment definition: a dedicated `experiments` collection

Resolves the "where's the source of truth" question: an experiment's own
lifecycle (`draft → running → concluded`) is independent of any single
page's lifecycle (`draft`/`published` — the control stays `published`
throughout, and stays `published` after conclusion too). That's a genuine
independent lifecycle, the same test `006-double-optin-email`'s research.md
used to justify a relationship needing its own collection (and the inverse
of `007-gtm-tagging`'s research.md §1/§2, where two scalar fields on an
existing collection were enough *because* the settings had no lifecycle of
their own) — so a new collection is justified here, not a group field on
`Pages`.

```
experiments
  name                        text
  controlPage                 relationship → pages
  growthbookExperimentKey     text   (join key into GrowthBook)
  status                      select: draft | running | concluded
  startedAt / endedAt         date
  winner                      relationship → pages   (set on promotion)
```

`experimentOf` stays on the variant `Page` itself (§5.1) — that's what
`publishGuard` and the admin UI need cheaply, per-document. Variants
belonging to one experiment are found by querying `pages` where
`experimentOf == controlPage.id`, never duplicated into an array on the
`experiments` document — one copy of the relationship, no drift risk.
**Multivariate is the committed design from day one**, not a binary A/B
retrofitted later — deliberately, since building the N-variant shape up
front is simpler than reshaping a hardcoded A/B pair afterwards. The schema
above already supports it with no changes between 2 and N variants (any
number of pages can share one `experimentOf`); what has to be built
N-aware from the start is the UI (§5.5's variant list, never a fixed
two-column layout) and the traffic-weighting (even split by default across
however many variants exist, editable per-variant, summing to 100%) and
GrowthBook's own experiment definition, created with as many arms as there
are Payload variants.

### 5.4 Preview, indexing, and locking need no special-casing

Checked directly against the current code, not assumed:

- **Preview** — `(preview)/preview/[pageId]/page.tsx` fetches purely by
  Payload id via the `page-preview` endpoint, gated by a per-page signed
  token, `force-dynamic`, with no dependency on `domain`/`path` anywhere in
  the chain (`getPagePreview` posts `{ pageId }`, nothing else). A variant
  is an ordinary `Page` document with its own id, so it previews exactly
  like any page — no new code path needed.
- **Indexing** — there is no `sitemap.ts`/`robots.ts` in `apps/web` today
  (only excluded from the middleware matcher, no route implementing them),
  so there's no indexing surface to guard in the first place. More to the
  point, a variant has neither `domain` nor `path` (§5.1) — `apps/web`'s
  only public resolution path (by domain+path) can structurally never
  reach one. The single access route is the signed, non-crawlable preview
  URL. Closed by the schema, nothing to build.
- **Document locking** — `lockDocuments` (300s) is per-document; control
  and variant are always two separate Payload documents, so they lock
  independently with zero cross-document interaction to design for.

### 5.5 Admin surface: one stats component, two mount points

Resolves Q7. Test management belongs on the control page's own edit
screen, as a tab — not a sidebar panel competing for space with the
builder, and not a separate collection an editor has to remember to go
find. Payload 3's document editor already supports this natively:
`DocumentTabConfig` (`node_modules/payload/dist/admin/views/document.d.ts`)
lets any entry under a collection's `admin.components.views` carry a
`tab: { label, Pill, order, ... }` — the exact mechanism `Pages.ts`
already uses for the `wizard` view (§ this doc doesn't repeat that
file's own header comments), just with `tab` added. No new admin
infrastructure to build, only a new view entry.

- **"Tests A/B" tab on the control page** — lists every variant under this
  page's experiment (queried by `experimentOf`, per §5.3), each with its
  status, traffic weight, a link into its own GrapesJS canvas, and the
  "Promote to control" action (§5.2). Built as an N-row list from the
  start (§5.3's multivariate-by-default), not a two-column A/B layout.
- **A dedicated "Experiments" admin section** — simply the `experiments`
  collection itself (§5.3), placed under `admin.group`. A Payload
  collection gets a sidebar nav entry and a list view for free, so this
  "new section" is zero extra view-building: one list of every experiment
  across every page (draft/running/concluded), independent of which page
  an editor happens to have open — matching the "stats visible in several
  places" framing.
- **One shared stats component, not two UIs.** A single component (e.g.
  `ExperimentStats`, parameterised by `growthbookExperimentKey`) queries
  the self-hosted GrowthBook instance and renders per-variant conversion,
  confidence, and sample size. It mounts both inside the page's "Tests
  A/B" tab (scoped to that page's own experiment) and inside the
  `experiments` collection's document view (the global one) — the same
  "compose one component at every call site" precedent
  `007-gtm-tagging`'s research.md §5 already established for `<Tagging>`,
  rather than building the stats UI twice. `PageStatsPanel` (currently
  unregistered per `Pages.ts`'s admin comment) is worth checking during
  implementation as a possible starting point — its data-fetching shape
  may already be close to what this needs.

## 6. Deferred

- GrowthBook self-hosting ops (MongoDB's place in the VPS's backup story,
  alongside the offsite backup cron that isn't installed yet — see the
  Trefle prod VPS memory note) — explicitly out of scope for this
  exploration, to be decided in a dedicated backup session covering the
  whole VPS, not just this feature's addition to it.

## 7. Rollback and incremental-rollout safety

This feature is hard to exercise fully pre-production — real bucketing
behaviour and GrowthBook's own statistical output only mean something under
real traffic. That constraint is already answered by this project's own
rules, not a new mechanism to invent: `.specify/memory/constitution.md`
Principle III ("Small, Reversible Changes") mandates expand → migrate →
contract schema changes with a tested `down`, risky work hidden behind a
flag or an unpublished document, and `docker compose up` staying healthy on
every commit — matching the real rollback runbook in
`infra/deploy/README.md` §2.2 (`git checkout <previous-tag>` →
`payload:migrate` applies the `down`s → `up -d`).

**How this design already satisfies it:**

- **Migrations are additive-only** — `experimentOf` (nullable) and the new
  `experiments` collection (§5.3) are pure expand: new nullable column, new
  table. No migration may combine that with transforming existing `pages`
  rows in the same step; a `down` dropping a column/table the old code
  never wrote to is trivially safe and testable.
- **The kill switch already exists — no new flag needed.** `experiments.status`
  (`draft | running | concluded`) *is* the flag Principle III asks for:
  `apps/web` only branches into variant-serving when a `running` row exists
  for the resolved control. Every commit up to the first real experiment
  can ship to production and stay provably inert — exactly "hidden behind
  ...an unpublished Payload document." Flipping a `running` experiment back
  to `draft`/`concluded` reverts to control-only instantly, no deploy, no
  migration rollback.
- **Ship in independently-revertible commits**, each leaving
  `docker compose up` healthy on its own: (1) schema migration alone, (2)
  GrowthBook + MongoDB added to compose, unused, (3) `apps/web` branching
  code added but dead (no `running` experiment exists yet), (4) the admin
  tab + `experiments` section, (5) the first real dark-launched experiment.
  Each step reverts on its own via the existing `git checkout <tag>` +
  migrate-down runbook, with no compound interaction between steps to
  reason about.

**Two things this feature adds that aren't covered by existing code yet:**

- **`apps/web` must fail open on GrowthBook** — same defensive pattern
  `payload-client/index.ts` already uses for `PayloadUnavailableError`
  (catch, fall back, never surface a 500). If the self-hosted GrowthBook
  API is unreachable, slow, or left in an inconsistent state by a partial
  rollback, the renderer serves the control page. This decouples the app's
  own rollback from GrowthBook/MongoDB's — one can revert without the
  other breaking rendering.
- **GrowthBook's image must be pinned** in `infra/.env` like every other
  service. Unlike application code, a Compose service isn't rolled back by
  `git checkout` — it keeps running whatever image tag the compose file
  currently points at until that's changed explicitly.

**What "hard to test locally" actually excludes:** Principle IV already
scopes the mandatory-test surface to deterministic logic — the new
`publishGuard` branch, the promotion endpoint, the GrowthBook-unavailable
fallback, cache invalidation on promotion — all fully testable without real
traffic. What's genuinely untestable pre-production is narrower than it
first looks: real-traffic bucket distribution and GrowthBook's own
statistical-significance computation, which is vendor logic this codebase
trusts rather than re-verifies, not this feature's own integration code.

No open design questions remain for this exploration; the next step is a
Spec Kit session (`/specify`) once implementation is ready to start.

## 8. Update 2026-10-09 — edge architecture, block-level tests, GrowthBook's role

Context: the CDN/anti-DDoS programme (`docs/cdn-cache-exploration.fr.md`,
spec `specs/017-edge-protection` = lot 1 of 4) puts Cloudflare in front of
every host and, in lots 3–4, serves page HTML from the edge cache with a
Cloudflare Worker that injects the CSP nonce and takes the A/B decision.

### 8.1 What GrowthBook actually does in the shipped 008

Not the decision engine. In the code as shipped:

| Function | Done by |
|---|---|
| Test definitions | Payload `experiments` collection |
| Experiment key | generated locally (`page-<id>-<timestamp>`, `endpoints/startTest.ts`) |
| Visitor bucketing | our own FNV-1a `assignVariant` (`apps/web/src/lib/ab-testing/bucket.ts`), GrowthBook-compatible shape |
| Running-test lookup | renderer reads Payload |
| Admin stats (views/conversions per arm) | Payload `page-stats` (`components/ExperimentStats.tsx`) |
| Significance / confidence | GrowthBook, planned warehouse-native on Postgres, off the request path — still a "later enhancement" |

Whether a Postgres datasource is configured in the production GrowthBook UI
is not visible from the repository (it lives in GrowthBook's MongoDB).

Consequence: moving bucketing into the Worker (lot 4) does not affect
GrowthBook at all — the decision was never GrowthBook's.

### 8.2 Option B (block-level) under the edge architecture

- **While HTML is rendered per request (lots 1–2):** the renderer reads the
  `tf-ab-*` cookie and keeps the winning fragment during render, a sibling
  of `splitAroundForm` in `render.ts`.
- **Once HTML is cached at the edge (lots 3–4):** the origin caches **one**
  HTML per page containing every variant fragment (`data-experiment` /
  `data-variant` markers); the Worker reads/sets the cookie, runs the same
  `assignVariant`, and removes losing fragments with `HTMLRewriter` (the same
  pass that injects the nonce).
- Benefits: one cache entry per page whatever the number of block tests (no
  2ⁿ variants); no flicker and no client JS; losing fragments (and their
  images) never reach the browser; page-level (A) then block-level (B)
  composes in one Worker pass.

### 8.3 Constraints to carry into the lot 2 and lot 4 specs

1. **One selection code path.** Move `assignVariant` and a pure
   `selectFragments(html, assignments)` into `packages/shared` (no Node APIs —
   FNV and `crypto.randomUUID` already run in Workers); used by the renderer
   (dev, and prod until lot 4) and by the Worker.
2. **Lot 4 Worker is generic**: page rewrite *and* fragment selection, not a
   page-only design.
3. **Lot 2 exposure data.** `page-stats` counts per page, which works for
   Option A (each arm is a page) but cannot separate two fragments of the
   same page. The browser beacon that replaces `pingPageView` must record
   **every** exposure present on the page — `{ experimentKey, variant,
   visitorId (the tf-ab-* random id), at }` — and leads must carry the
   assignments their author saw. This is also the table shape GrowthBook's
   warehouse-native engine needs, which turns its significance reporting
   from "later" into straightforward.
4. **Privacy decision for lot 2.** Exposure rows keyed by a random visitor
   id are pseudonymous data. 008 FR-009 ("aggregate counts only, never a
   per-visitor breakdown") binds the UI and can stay true, but the spec must
   decide retention, legal basis / consent linkage, and the processing
   register entry.
5. **Component rules for Option B**: no lead form inside one variant only
   (both or neither); experiment keys namespaced apart from page-level keys
   (§4).
6. **Already consistent in lot 1**: an image used only in a losing fragment
   is still in `builder.html`, so it counts as used (replace warning, delete
   blocked) — intended, since that variant can still win; edge purge tags are
   per page and cover all fragments.

### 8.4 Decision (2026-10-09): keep GrowthBook, wire it at lot 2

Without GrowthBook, page-level tests would lose nothing today — the admin
shows raw counts only, no significance. Its value is the stats engine
(significance, sequential testing so results can be watched without
peeking bias, sample-ratio-mismatch checks — relevant once bucketing moves
to the Worker — multiple metrics, CUPED). Decision: **keep it, and connect it
for real in lot 2**, when the exposure events (§8.3 point 3) give it the
per-visitor data it needs: Postgres datasource configured, exposure and
conversion queries defined, significance shown next to the counts in
`ExperimentStats`. Removing it was considered (lighter VPS, two fewer public
hosts) and rejected. Lot 2's spec owns this.

### 8.5 Update (2026-10-11): exposures written by the edge, first exposure only

The edge HTML-cache study (`docs/cdn-cache-exploration.fr.md` §11) changes
§8.3 point 3: there is no browser beacon. The edge Worker (feature 020) runs
on every view anyway and records exposures itself, through a Cloudflare
Queue drained in batches into Postgres (no sampling, one insert per batch).
Only the **first** exposure of a visitor to an experiment key is recorded —
the one GrowthBook uses; for block-level tests each block experiment has its
own key, so this still covers fragments. Page-view counters go through
Workers Analytics Engine instead (sampled at very high volume, fine for
totals, never used for exposures). Writing into GrowthBook's MongoDB (config
only) and counting through GTM (ad blockers, per-client containers, third
party breaking the CNIL exemption) were considered and rejected. Spec 018
was amended accordingly; lots 2–4 became feature 020.

### 8.6 Update (2026-10-20): shipped as 018-ab-significance

Exposures are written by the edge Worker, one per view of a page under test
(numbered with the view number of the page's form token, while
`EXPOSURES=on`), attributions by the lead intake (variant = the lead's own
page, view number from the form token). GrowthBook reads `ab_exposures` / `ab_conversions`
through the read-only role `growthbook_reader` (`infra/growthbook/config.yml`);
the CMS declares each test, refreshes the analysis hourly and shows a
verdict, announced only once it has held 72 hours (the gbstats simulation
showed an instant 95 % called identical variants winners in 6.6 % of tests
when the screen is checked hourly — `specs/018-ab-significance/simulation/results.md`).
On 2026-10-20 the tests became cookieless (spec research R15): the CNIL
self-assessment tool (July 2025) excludes A/B cohorts from the consent
exemption, and consent before assignment would leave landing pages
untestable. The version is drawn for every view, the view number travels in
the signed form token, nothing is stored on the device; 008's per-visitor
stickiness is withdrawn (`docs/mesure-ab-cnil.fr.md`). Spec, plan and
go-live: `specs/018-ab-significance/`, runbook step 5.1.
