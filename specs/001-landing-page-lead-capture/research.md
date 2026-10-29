# Phase 0 Research: Landing Page Builder with GDPR-Compliant Lead Capture

All unknowns from the plan's Technical Context are resolved below. Items marked **CONFIRM**
were decided here on the constitution-aligned default and are cheap to change before
implementation; raise them in `/speckit-clarify` or review if the default is wrong.

---

## 1. Renderer ↔ content access

**Decision**: `web` reads content exclusively through Payload's REST/GraphQL API over the
Docker network (`http://cms:3000/api/...`), authenticated with a Payload **API key** on a
dedicated `service` user that has read-only access to published content.

**Rationale**: Payload owns and migrates the SQL schema; its internal tables change between
versions. Going through the API keeps `web` decoupled, gets access control and hooks for
free, and matches constitution Principle II. ISR absorbs the extra network hop — a warm page
is served from cache, and a cold render is one or two API calls.

**Alternatives considered**:
- *Read-only direct Postgres connection from `web`* — fastest, but couples `web` to Payload's
  internal schema (a fragile bespoke layer, explicitly discouraged by Principle I/II).
- *Payload Local API in-process* — impossible across containers (same-process only).
- *Publish-time HTML snapshot service* — offered to the user, not chosen; the snapshot still
  exists but as a field on the page document (see §3), not a separate mechanism.

---

## 2. Repository & container layout

**Decision**: One repo, npm workspaces: `apps/cms`, `apps/web`, `packages/shared`, `infra/`.
The current root Next.js app moves to `apps/web`. Compose services: `cms`, `web`, `db`
(`postgres:16`), `imgproxy`. The two application containers are `cms` and `web`; they share
the single `db`.

**Rationale**: The user wants one Git repo ("trefle"), two application containers, and one
database. Workspaces let both apps share generated types via `packages/shared` without `web`
depending on `payload`. `infra/` keeps Compose and ImgProxy config out of app code.

**Alternatives considered**:
- *Two separate repos* — more isolation, but duplicated tooling, and shared types need a
  published package or submodule. Rejected for a solo project.
- *Single Next.js app hosting both Payload and public rendering* — fewer containers, but
  couples editing and rendering and contradicts the requested container split.

**Migration note**: Moving root → `apps/web` is a one-commit structural change; do it first,
keep `main` green (`web` builds, `docker compose up` healthy) before any feature work.

---

## 3. GrapesJS integration & page content shape

**Decision**: GrapesJS is embedded in the Payload admin via a custom field component on the
`pages` collection. On every save Payload stores, on the page document:
- `builder.projectData` — the GrapesJS project JSON (components + styles) for re-editing;
- `builder.html` and `builder.css` — GrapesJS's exported markup/styles, the *only* thing
  `web` consumes.

`web` injects `builder.html` + scoped `builder.css` into a minimal page shell. It never loads
GrapesJS or interprets `projectData`. Block library is a fixed set of GrapesJS blocks (hero,
rich text, image, call-to-action, lead form, testimonial); block set finalised in
`data-model.md`.

**Rationale**: Keeps the renderer tiny and dependency-free of GrapesJS, guarantees the page
works without client JS, and gives clean cache semantics (the HTML is a stored artifact
invalidated on publish). Storing `projectData` separately preserves full editability.

**Alternatives considered**:
- *Renderer interprets the GrapesJS component tree via a shared block registry* — duplicates
  rendering logic in two places and risks visual drift.
- *Store only HTML, re-parse to edit* — lossy; GrapesJS round-trips its own JSON reliably,
  not arbitrary HTML.

**"Exactly one lead-form block" (FR-002a)**: enforced by a Payload `beforeValidate` hook that
counts lead-form components in `projectData`; publish is blocked (validation error) unless
the count is exactly 1. The live version keeps serving until a valid version is published.

**CONFIRM**: rich-text editing inside the text block uses GrapesJS's built-in RTE (no Tiptap).

---

## 4. Members, roles, onboarding

**Decision**: Payload built-in auth on the `users` collection. Field `role: 'admin' |
'editor'`. Access functions:
- `admin` — full CRUD on all collections/globals, plus user management and `settings`.
- `editor` — CRUD on `pages`, `domains` assignment, read/export on `leads`, create/fulfil
  `data-subject-requests`; **no** access to `users` or `settings`.
Onboarding: an `admin` creates a user with a role; Payload sends a "set your password" email
via `@payloadcms/email-nodemailer` (SMTP). Access revocation = disable/delete the user.
Last-admin protection: a `beforeChange`/`beforeDelete` hook on `users` rejects removing or
demoting the only remaining `admin`.

**Rationale**: Stack-native, no external IdP, satisfies User Story 5 and FR-034a/b directly.

**Alternatives considered**:
- *External IdP (Clerk/Auth0)* — adds a dependency and integration surface for a
  single-team tool. Rejected.
- *No email, manual invite links* — viable fallback; rejected because SMTP is already needed
  for consent-withdrawal notifications and is low cost.

**CONFIRM**: SMTP provider and `FROM` address (any SMTP works; supply via git-crypt'd env). A
local mail catcher (Mailpit) stands in for development.

---

## 5. Anti-spam on the public form

**Decision**: No third-party captcha. Layers:
1. **Honeypot** — a visually hidden field; any value ⇒ silently reject (HTTP 204, nothing
   stored).
2. **Fill-time heuristic** — a signed timestamp issued when the page renders; submissions
   faster than ~2 s or older than ~2 h are rejected.
3. **Rate limiting** — fixed-window counters in the `web` app: per client IP (e.g. 10/min,
   100/day) and per `(email, page)` (e.g. 3/day). (The duplicate flag is a separate concern:
   an existence lookup on `(email, page)` at persist time, not the rate-limit counter.)
4. **Server-side validation** against the page's form config fetched from Payload.

**Rationale**: Meets FR-035 and SC-011 with zero personal data sent to a third party — best
possible fit for the feature's data-minimisation stance. IP is used only as a short-lived
rate-limit key, not stored on the lead (it *is* stored on the consent record as consent
evidence, per FR-011/FR-017).

**Alternatives considered**:
- *Cloudflare Turnstile / hCaptcha* — stronger against targeted bots, but adds a third-party
  script + a privacy-notice disclosure. Kept as a documented future option if spam becomes a
  real problem.

**CONFIRM**: rate-limit store. Default: in-memory per `web` instance (fine for a single
container). If `web` is ever scaled out, move counters to a shared store (a Postgres table via
a Payload endpoint, or Redis) — noted, not built now.

---

## 6. Cache & revalidation

**Decision**: `web` renders published pages with `export const revalidate` (time-based ISR
fallback, e.g. 1 h) plus **on-demand revalidation by tag**. Tags: `page:<id>`,
`domain:<id>`, `page-list`. Payload `afterChange`/`afterDelete` hooks on `pages` and
`domains` POST to `web` `POST /api/revalidate` with an HMAC signature over the payload
(shared secret in env). `web` calls `revalidateTag(...)` for the affected tags.
Unpublished/draft saves do **not** trigger revalidation.

**Rationale**: Native Next.js caching; publish-driven invalidation gives "live within 10 s"
(SC/plan goal) without polling. HMAC keeps the endpoint safe on an open network.

**Alternatives considered**:
- *Short `revalidate` only (no webhook)* — simpler but stale window = the interval.
- *`web` subscribes to Postgres LISTEN/NOTIFY* — reintroduces a DB coupling we rejected in §1.

---

## 7. Multi-domain resolution

**Decision**: A `domains` collection (`hostname`, `isActive`, branding metadata). Each `page`
has `domain` (relationship, required to publish) and `path` (unique per domain, e.g. `/`,
`/promo-x`). `web` reads the `Host` header, looks up the active domain (cached, tag
`domain:<id>`), then the published page at that `(domain, path)`; unknown host or path ⇒
`notFound()`. Locally, domains use `*.localhost` (or `/etc/hosts`) and Compose network
aliases so the same lookup path runs in dev.

**Rationale**: Satisfies FR-006a with one shared workspace; a domain is pure routing, no
tenant isolation (matches the amended constitution and updated spec).

**Alternatives considered**:
- *Path-prefix routing on one domain* — doesn't meet the multi-domain requirement.
- *Per-domain Next.js deployments* — operational overhead, no benefit here.

---

## 8. Lead capture pipeline

**Decision**: Public browser form (plain HTML, method POST) → `web` `POST /api/leads`:
1. Validate `Host` against active domains (reject otherwise).
2. Honeypot + fill-time + rate-limit checks (§5).
3. Fetch the target page's form config from Payload; validate submitted fields server-side.
4. Require the consent field to be actively set; reject with a field message otherwise.
5. Call a Payload **service endpoint** `POST /api/lead-intake` (API key) that, inside one
   operation, creates the `lead`, its immutable `consent-record` (exact consent + purpose
   text, privacy-notice version, timestamp, IP, user-agent), the captured metadata, applies
   the duplicate flag, and increments `page-stats`.
6. Return success → `web` shows the page's configured confirmation; on failure, a field-level
   or generic error. Works without JS (standard form POST, server-rendered result page).
7. If the Payload call is unreachable, `web` retries inline for ~5s, then returns a `503`
   "try again shortly" response and stores nothing — no local spool in v1 (clarified
   2026-09-09). Transient failures are counted so their frequency is visible (FR-014a).

**Rationale**: Keeps edge concerns (host check, rate limit, honeypot) in `web` and all
persistence + GDPR side effects in Payload hooks/endpoints, so consent records can never be
skipped (FR-015/FR-017). One Payload operation keeps lead + consent atomic.

**Alternatives considered**:
- *Browser posts straight to Payload* — exposes Payload publicly and bypasses `web`'s edge
  checks. Rejected (FR-036).
- *`web` writes via generic Payload REST create calls* — spreads the invariant across the
  client; a dedicated endpoint centralises it.

---

## 9. Consent withdrawal

**Decision**: Each captured lead gets an unsubscribe URL on the confirmation page (and in any
notification email): `https://<domain>/unsubscribe?token=<t>` where `t` is
`base64url(leadId).hmac`. `web` `GET` renders a confirm page; `POST` calls Payload
`POST /api/consent-withdraw` which sets `lead.consentStatus = 'withdrawn'` with a timestamp
and appends the withdrawal to the consent record. Idempotent.

**Rationale**: FR-019 — takes effect without owner action, no login required, tamper-evident
via HMAC.

**Alternatives considered**: emailed one-time codes (heavier, needs reliable inbound email).

---

## 10. Retention & data-subject requests

**Decision**:
- **Retention**: `settings` global holds `retentionMonths` (default **24**, admin-editable).
  A Payload **scheduled job** `retention-sweep` runs daily, finds leads whose
  `submittedAt` age exceeds the window, erases the lead's personal fields in place **and
  nulls the linked consent record's `email` / `ipAddress` / `userAgent`** (FR-031a), and
  writes a non-personal `activity-log` entry (`type: 'retention-deletion'`). Resumable,
  batched, and
  filters strictly on the expiry predicate (FR-030–032).
- **DSR**: a `data-subject-requests` collection (`email`, `type`, `status`, `receivedAt`,
  `completedAt`). Payload admin endpoints:
  - `dsr-export` — gathers all leads + consent records for an email across all pages →
    machine-readable JSON (FR-025).
  - `dsr-erase` — after admin confirmation, purges personal data for that email everywhere
    (including on deleted pages' orphaned leads), sets `status/completedAt`, and keeps only
    the non-personal request record (FR-026/027).
  - rectification is a normal authenticated edit of `lead` field values; the consent record
    is never touched (FR-028).

**Rationale**: Payload's built-in Jobs Queue is the stack-native scheduler; no extra cron
container. Erasure-in-place (null the personal columns, keep the row for audit counts)
preserves per-page statistics without retaining identity.

**Alternatives considered**:
- *Separate cron container hitting an endpoint* — works, but a second moving part the Jobs
  Queue already covers.
- *Hard row deletion on erasure* — loses historical submission counts; erasure-in-place is
  enough for GDPR (no personal data remains).

---

## 11. Assets & images

**Decision**: `@payloadcms/storage-s3` targets Garage (S3 API: custom `endpoint`,
`forcePathStyle: true`, bucket + credentials via env). Payload stores only object keys +
metadata. Published pages reference images through **ImgProxy** signed URLs
(`https://<imgproxy-host>/<signature>/<processing>/<source>`), generated by a small helper in
`cms` when producing `builder.html`, sized per block. ImgProxy reads source objects from
Garage directly.

**Rationale**: FR + Principle V (images via the proxy at a sensible size). Signed URLs stop
open-proxy abuse.

**CONFIRM**: Garage endpoint/bucket names and the ImgProxy `KEY`/`SALT` (git-crypt'd env).

---

## 12. Page-view / submission analytics

**Decision**: `page-stats` collection, one document per `(page, date)` with `views` and
`submissions` counters. `web` increments `views` via a fire-and-forget call to a lightweight
Payload endpoint on full server renders (not on ISR cache hits — accept slight undercount);
`lead-intake` increments `submissions`. Conversion rate = `submissions / views` shown in the
Payload admin (FR-037, SC-009).

**Alternatives considered**:
- *Third-party analytics (Plausible etc.)* — extra script + dependency; rejected for v1
  data-minimisation. Can be added later without schema change.
- *Per-event rows* — higher write volume and a rollup job for no v1 benefit.

---

## 13. Testing strategy

**Decision**:
- **Vitest** (`apps/cms/tests`, `apps/web/tests`): access-function truth tables (admin vs
  editor vs anonymous vs service), collection hooks (one-form-block guard, last-admin guard,
  consent-record writer), `retention-sweep` predicate & resumability, token HMAC sign/verify,
  rate-limit windows, host→domain resolution, revalidation tag mapping, lead-intake
  validation/rejection paths.
- **Playwright** (`apps/web/tests/e2e`): author a page in `cms` → publish → GET on its host
  renders it → submit the form (JS on and JS disabled) → lead + consent record present in
  `cms`; editor cannot open Users/Settings; unsubscribe flips consent status.
- CI target (Phase 4): run both suites + lint + type-check + `docker compose up` health.

**Rationale**: Directly covers constitution Principle IV's "must be tested" list.

---

## Resolved unknowns summary

| Technical Context item | Resolution |
|---|---|
| Language/Version | TypeScript 5.x, **Node 24**, React 19.2 (Node 24 chosen at scaffold — installed baseline) |
| Renderer↔content | Payload REST/GraphQL API + service API key (§1) |
| Repo/containers | npm workspaces monorepo; `cms` + `web` app containers, shared `db`, `imgproxy` (§2) |
| Editor storage | GrapesJS `projectData` + exported `html`/`css` on the page doc (§3) |
| Auth | Payload auth, `role` field, SMTP onboarding, last-admin guard (§4) |
| Anti-spam | honeypot + fill-time + rate-limit, no third party (§5) |
| Caching | ISR + HMAC-signed on-demand `revalidateTag` from Payload hooks (§6) |
| Multi-domain | `domains` collection, host-header resolution, `*.localhost` locally (§7) |
| Lead pipeline | `web` edge checks → Payload `lead-intake` atomic write (§8) |
| Consent withdrawal | HMAC-token `/unsubscribe` → Payload `consent-withdraw` (§9) |
| Retention / DSR | Payload Jobs `retention-sweep` + DSR collection/endpoints, erase-in-place (§10) |
| Assets/images | `storage-s3` → Garage, ImgProxy signed URLs (§11) |
| Analytics | `page-stats` per page/day counters (§12) |
| Testing | Vitest + Playwright, lists in §13 |
| Secrets | git-crypt encrypted env files; `.env.example` unencrypted |

**Pinned at Phase 1 scaffold**: Payload `3.68.0` (+ `@payloadcms/*` matching), GrapesJS
`0.22.12`, `apps/web` on Next `16.3.4` (the modified Next per AGENTS.md), `apps/cms` on Next
`^15.5` (Payload 3's supported line — the two apps run different Next majors, which is fine
as separate containers), Postgres 16, Node 24. Both apps build; the initial Payload migration
applies cleanly.

**Open CONFIRM items** (non-blocking): GrapesJS RTE vs a richer editor; real SMTP
provider/FROM for prod; rate-limit store if `web` scales out; real Garage + ImgProxy
endpoint/key values for prod (local dev uses MinIO + generated keys); whether to bump
`apps/cms` to Next 16 once Payload supports it.
