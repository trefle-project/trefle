<!--
Sync Impact Report
Version change: 2.2.0 → 2.3.0
Rationale: 019-admin-access puts the internal hosts (Payload admin, GrowthBook) behind
Cloudflare Access — an e-mail code for the active members only — and has the reverse proxy
verify Access's signed token at the origin, replacing the never-filled address list of
003/017. The admin login gains a second factor. Guidance added; no principle redefined.
MINOR bump.

Modified:
  - Architecture — "Edge": internal hosts behind Cloudflare Access, its token verified by the
    reverse proxy; the Access application and its member sync are code in infra/cloudflare/.
  - Principle II — `payload-totp` (Payload has no second factor) and the Caddy module
    `caddy-jwt` (Caddy cannot verify a JWT; covers GrowthBook as well as the admin) recorded
    as justified additions (specs/019-admin-access/plan.md, Complexity Tracking).

Removed: nothing (the address-list mechanism was configuration, never a constitutional rule).

Previous amendment (2.1.0 → 2.2.0, 020-edge-html-cache): page HTML cached at the edge,
personalised per request by the edge Worker; Cloudflare Workers (Paid), Analytics Engine,
Queues and `wrangler` recorded under Principle II.
-->

# Trefle Constitution

## Core Principles

### I. Simplicity First

The simplest thing that fully solves today's problem wins. Complexity is a cost paid on
every future read, change, and upgrade.

- Build for the requirement in front of you, not an imagined future one (YAGNI).
- Introduce an abstraction only on the third concrete use, never the first. Two call sites
  copy; the third may extract.
- No wrapper layers around the stack's APIs "to make them ours". Use Payload, GrapesJS, and
  Next.js directly.
- Prefer removing code and configuration over adding it. Fewer files, fewer concepts, fewer
  moving parts is the tie-breaker in any design choice.
- A module SHOULD be readable top to bottom without chasing indirection across many files.
- The stack is deliberately larger than a bare app; that is the reason to keep everything
  built *on top of* it as small and conventional as possible.

Rationale: This is a solo project. Every layer, pattern, and clever indirection is
maintenance that one person carries alone. Staying simple is what keeps it possible to move
fast later.

### II. Stack-Native, Minimal Additions

Reach for what the stack already gives you before reaching for a package or a bespoke layer.

- "The platform" is the chosen stack: Next.js (public renderer), Payload CMS (content model,
  admin, access control, hooks, jobs), GrapesJS (block editing), PostgreSQL, and the
  S3-compatible object store. Solve problems with these tools' own primitives first.
  - Content shapes, validation, relationships, access rules, and lifecycle side effects →
    Payload collections, fields, access functions, and hooks.
  - Page composition and preview → GrapesJS blocks/components and its plugin API.
  - Rendering, routing, caching, and revalidation → Next.js App Router, Server Components,
    route handlers, and the built-in cache/`revalidate` APIs.
- Before using an unfamiliar Next.js API, read the relevant guide in
  `node_modules/next/dist/docs/` (per AGENTS.md) and heed deprecation notices. Consult the
  Payload and GrapesJS documentation the same way before using an unfamiliar API of theirs.
- Adding a runtime dependency *beyond the stack above* MUST be justified in the commit or PR
  description: what it does, why the stack cannot, and its size and maintenance cost. Prefer
  small, actively maintained packages.
  - Justified so far: Cloudflare (nothing in the stack can absorb a flood before it reaches
    the single VPS) and a Caddy build with the `caddy-dns/cloudflare` module (DNS-01 is the
    only robust way to get origin certificates for client hosts behind the proxy) —
    017-edge-protection; Cloudflare Workers (Paid plan) with Analytics Engine and Queues
    (nothing in the stack can personalise a cached page at the edge or count its views
    without per-view work on the VPS), `wrangler` as a dev tool — 020-edge-html-cache;
    `payload-totp` (Payload has no second factor) and the Caddy module `caddy-jwt` (Caddy
    cannot verify a JWT, and the check must cover GrowthBook too) — 019-admin-access.
- Keep `next` and `eslint-config-next` on matching versions. Keep Payload's packages on one
  matching version. Pin GrapesJS and its plugins to exact versions.

Rationale: The stack is powerful but broad. Dependencies and hand-rolled layers on top of it
are what will make upgrades painful, so the surface added on top must stay minimal.

### III. Small, Reversible Changes

Every change MUST stand on its own and be safe to undo.

- Each commit or PR is one coherent change that leaves the system working.
- `main` MUST always come up: every app in the repo builds, and `docker compose up` brings
  the full stack to a healthy state, on every commit to `main`.
- Risky or half-finished work MUST be hidden behind a flag, an unpublished Payload document,
  or an unrouted domain — not parked on a long-lived branch.
- Database and content-shape changes go expand → migrate → contract, using Payload
  migrations. No step that drops the old shape ships in the same change that stops writing
  it. Every migration has a tested down path or a documented manual reversal.
- Every change MUST have an obvious undo: revert the commit, unpublish the document, or roll
  back the migration.

Rationale: Small steps are cheap to review against these principles and cheap to reverse
when they turn out wrong.

### IV. Working Software Over Ceremony

Automated checks guard the code that matters; the author decides the rest.

- Test-first is NOT required. Tests MAY be written before, during, or after implementation.
- The following MUST have an automated test before the change is considered done:
  business and domain logic, data transformations, Payload access-control rules, custom
  Payload hooks and endpoints, the lead-capture API, cache invalidation logic, and any code
  path that has had a bug (a regression test ships with the fix).
- Purely presentational components and GrapesJS block markup are EXEMPT from a coverage
  requirement, but each published-page template MUST be exercised by at least one smoke or
  integration check that asserts it renders without error.
- Lint and a type-check MUST pass for every affected app before a change is done. A skipped
  or flaky test MUST be fixed or deleted the same day, not left disabled.
- Manual verification steps taken MUST be written in the commit or PR body.

Rationale: A one-person project cannot afford ceremony on every line and cannot afford
silent regressions in the logic that matters. This targets the risk, not the line count.

### V. Quality the User Feels

A feature is done when it is good for the person using it, not when it runs locally.

- Every interactive view — published pages and Payload admin customisations alike — MUST
  handle its loading, empty, and error states explicitly.
- Published pages MUST be keyboard navigable, interactive elements MUST have accessible
  names, and each page MUST have no serious or critical automated accessibility (axe)
  violations.
- Published-page layouts MUST be usable from 360px width up to desktop, and the lead form
  MUST submit and give a clear result even with JavaScript unavailable.
- Avoid gratuitous layout shift and long main-thread work on published pages. Keep their
  client JavaScript lean (aim under ~150KB gzipped per page; note the reason when a page
  exceeds it). Images MUST be served through the image proxy at an appropriate size.
- User-visible copy and error messages MUST be intelligible to a non-engineer.

Rationale: The published pages are the product's public face and exist to convert visitors;
they must stay fast and usable. These are the minimums that keep "fast and simple" from
becoming "rough".

## Technology & Delivery Standards

### Architecture

- **One repository, one Docker Compose project.** Containers are split by concern and map to
  the delivery phases:
  - **Content & admin** — a Payload CMS application (itself a Next.js app) owning the content
    model, the admin UI, access control, and lifecycle hooks. GrapesJS is embedded here as
    the page-editing and preview surface; the GrapesJS project data and its rendered output
    are stored in Payload collections.
  - **Public renderer** — a separate Next.js application that generates and serves the
    published pages, reads content from Payload, and handles multi-domain routing (working
    locally as well as in production).
  - **Database** — PostgreSQL, the single store for Payload content, domains, leads, consent
    records, and settings.
  - **Image proxy** — ImgProxy in front of the object store for on-the-fly image
    optimisation.
- **Assets** live in external S3-compatible object storage (Garage), referenced by Payload;
  binaries are never committed to the repo.
- **Edge**: Cloudflare is in front of every host (Trefle's and clients' `www.` hosts). The
  origin answers only Cloudflare acting for our zone — firewall limited to Cloudflare's
  ranges, and our own Authenticated Origin Pulls certificate required by the reverse proxy.
  Images and asset files (keys never reused) are cached at the edge. Page HTML is cached at
  the edge too, with placeholders for its per-request values (CSP nonce, form token, A/B
  assignment) that an edge Worker fills in for every response; cached pages are purged by
  tag on every content change and on every deploy. The origin keeps its request-time
  rendering path for everything the Worker does not handle, and serves every request alone
  when the Worker is switched off. The internal hosts (admin, GrowthBook) are behind
  Cloudflare Access — an e-mail code for the active members only — and the reverse proxy
  refuses any request to them without a valid Access token; the admin login adds a second
  factor. Edge configuration is code in `infra/cloudflare/` and `apps/edge/`, applied by
  script, never only in the dashboard.
- **Multi-domain model**: one shared workspace and one content set. A domain is a routing and
  presentation concern — pages are assigned to a domain and path, and the renderer serves the
  right page per host. Per-domain tenant isolation (separate members, leads, or content per
  domain) is explicitly out of scope; revisit via amendment if that changes.
- **Rendering & caching**: published pages use SSR with ISR. Cache invalidation is driven by
  Payload change hooks that trigger on-demand revalidation in the renderer when an editor
  publishes a change; unpublished edits never affect the live cache. The edge cache sits in
  front of SSR/ISR and is invalidated by the same change hooks.
- **Lead capture**: the public form writes to the database through a dedicated, secured API
  owned by the renderer or a small service — validated server-side, origin/host checked,
  rate-limited, and abuse-protected. No lead or consent data is written by the browser
  directly.

### Language & code quality

- **TypeScript**: `strict` stays on in every app. `any` and non-null assertions (`!`) require
  an inline comment justifying them. `@ts-expect-error` with a reason is allowed; `@ts-ignore`
  is not.
- **Linting / formatting**: lint MUST pass with no errors for every affected app before a
  change is done. Formatting is automated and not debated.
- **Data changes**: schema and content-model changes go through Payload migrations, checked
  in with the change that needs them.

### Secrets & configuration

- **No plaintext secrets in the repository.** Secret-bearing files are committed only when
  encrypted with **git-crypt**; the git-crypt key is shared out of band and never committed.
- Nothing sensitive goes in `NEXT_PUBLIC_*` or any client-exposed variable.
- A `.env.example` (unencrypted, no values) documents every required key for every container.
- Runtime configuration comes from environment variables injected per container; the VPS
  holds the decrypted values.

### Delivery roadmap

Delivery is phased; each phase is shippable and demonstrable on its own.

1. **Phase 1 — Content foundation**: Postgres + Payload + GrapesJS editing/preview, GrapesJS
   content persisted in Payload, assets in Garage S3 via ImgProxy.
2. **Phase 2 — Public renderer**: Next.js multi-domain rendering of Payload/GrapesJS pages
   (local multi-domain included), SSR/ISR, and cache invalidation wired to Payload publish
   events.
3. **Phase 3 — Lead capture**: domains managed in the database; the lead-gen form writing to
   the database through the secured API, with consent capture and the GDPR obligations from
   the feature spec.
4. **Phase 4 — Deployment & hardening**: a repeatable deploy process to the Debian VPS,
   git-crypt-based secret handling end to end, and host/service hardening. CI that runs
   lint + type-check + build + tests, and production error tracking and Core Web Vitals
   monitoring, land here or immediately after; when each lands, promote its local step into
   an enforced gate and amend this section.

Until CI exists, the author MUST run lint, the build for each affected app, the relevant
tests, and a local `docker compose up` smoke check before every merge to `main`.

### Performance budget

- Published pages: client JS SHOULD stay under ~150KB gzipped per page; a page that exceeds
  it MUST note why in the commit or PR. Images MUST go through ImgProxy at a sensible size.
- The Payload admin has no client-JS budget, but MUST stay responsive enough for daily
  editing.

## Development Workflow

- **Branching**: Short-lived branches off `main`, rebased or squash-merged; no long-running
  divergent branches. Direct commits to `main` are acceptable for trivial, docs-only, or
  revert changes.
- **Self-review**: Before merging, re-read the entire diff as if reviewing someone else's
  work, and run lint, the affected builds, the relevant tests, and a `docker compose up`
  smoke check.
- **Commit / PR body**: State what changed, why, how it was verified, and — when a runtime
  dependency beyond the stack was added — the Principle II justification.
- **Definition of done**: merged to `main`, every affected app builds, the compose stack
  comes up healthy, and the verification steps are recorded. Once the VPS deploy process
  exists (Phase 4), "done" also means deployed and briefly confirmed healthy in production.
- **Constitution check**: Before merging, confirm the change violates no principle. A
  deliberate, temporary exception MUST be recorded in the commit or PR body and tracked to
  removal.

## Governance

This constitution supersedes other process documents. Where a README, style note, or habit
conflicts with it, this document wins.

- **Amendments**: Made via a commit or PR that edits this file, with a rationale and a
  migration note for any in-flight work. The Sync Impact Report comment at the top MUST be
  updated in the same change. As a solo project the author approves their own amendments,
  but the rationale MUST be written down.
- **Versioning**: Semantic versioning of this document.
  - MAJOR: a principle is removed or redefined incompatibly, or the architecture or
    governance changes materially.
  - MINOR: a new principle or section is added, or guidance is materially expanded.
  - PATCH: clarifications, wording, and typo fixes with no change in meaning.
- **Compliance review**: Self-checked at merge time. About monthly, and whenever a delivery
  phase completes, re-read this constitution and reconcile drift — fix the code or amend the
  document. Pay particular attention to promoting local checks into CI gates as Phase 4
  lands.
- **Runtime guidance**: Day-to-day contributor and agent guidance lives in `AGENTS.md` /
  `CLAUDE.md` and MUST NOT contradict this constitution.

**Version**: 2.3.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-10-16
