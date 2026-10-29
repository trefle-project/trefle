# Implementation Plan: Post-launch debugging & improvements (phase 1)

**Branch**: `003-post-launch-improvements` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-post-launch-improvements/spec.md`

## Summary

Ten independently revertible fixes across the six deferred 002 security
findings, a deliberate body-size limit, and four functional gaps found since
launch (republish reliability, an editable confirmation page, a
domain/`www` default landing experience, a GrapesJS starter template) plus
one cosmetic fix (admin login branding). Verified on the local Docker stack;
no deployment in this feature.

Two findings turned out to be smaller than the spec assumed once the code was
read: **User Story 4**'s "default page" already has a dormant `Domain.notFoundPagePath`
field (declared, never consumed) — the fix is to wire it up, not add new schema.
**User Story 2**'s republish bug traces to `revalidateTags()` being a genuine
fire-and-forget single attempt with no retry and only a `warn`-level log on
failure — a transient blip silently leaves a published edit stale for up to
the 1h ISR fallback, with nothing telling the editor it happened.

## Technical Context

**Language/Version**: TypeScript, Node 24. Next 16 (`apps/web`), Next 16 +
Payload 3.88 (`apps/cms` — corrected during implementation: the app is on
Next 16, not 15 as originally stated here; see the T004-adjacent fix in
`next.config.mjs`, README.md's stack table was equally stale).

**Primary Dependencies**: Payload CMS, GrapesJS, Next.js, Caddy 2 (edge). New:
one HTML-sanitisation library for editor-authored output (choice in
`research.md` §3).

**Storage**: PostgreSQL 16 (unchanged). One new relationship field
(`pages.confirmationPage`); `domains.notFoundPagePath` already exists.

**Testing**: Vitest (unit), Playwright (dockerised e2e), `docker compose`
stack, `curl -sI` / manual repro per finding, existing e2e suite as a
regression gate.

**Target Platform**: Debian VPS (Hostinger, already live), Docker Compose +
Caddy — verified on the local stack, matching 002's convention.

**Project Type**: Multi-app monorepo (`cms` + `web` + `shared`) with `infra/`.

**Constraints**: No breaking change to `POST /api/leads`'s existing response
shape for pages without a confirmation page (FR-013 fallback). No regression
to 001/002's passing e2e suite. Dev flows (`docker compose up`, host
`npm run dev`) must not regress.

**Scale/Scope**: Single shared workspace, small trusted editor team — matches
001/002's assumptions; no scale change.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Every fix reuses an existing mechanism: `notFoundPagePath` (already modelled, just unused), the form-token's issued-at pattern reused for preview-token expiry, the existing retry-with-deadline pattern in `postLeadIntake` reused for `revalidateTags`, Payload's own `admin.components.graphics.Logo` slot, Caddy's own `remote_ip` matcher. No new services, no new abstraction layers. |
| II. Stack-Native | IP allow-list at the Caddy edge (not app middleware); HTML sanitisation is the one justified new runtime dependency — see research.md §3 for the Principle II justification; everything else uses Payload fields/hooks, Next route handlers, and GrapesJS's own field/plugin API. |
| III. Small, Reversible | Ten phases below, one commit each, each independently revertible; `main` stays green after every commit. |
| IV. Working Software Over Ceremony | Each phase gets a regression test per constitution (access-control rule, hook, endpoint, or "had a bug ⇒ gets a regression test" for the republish fix). |
| V. Quality the User Feels | Confirmation page and default domain page are both ordinary published pages, so they inherit existing accessibility/responsive/no-JS requirements for free — no new UI surface to re-certify. |

Gate: **PASS**. No complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-post-launch-improvements/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — deltas over 001's contracts
│   ├── lead-intake-confirmation.md
│   ├── revalidation-retry.md
│   └── domain-fallback.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/web/src/app/api/leads/route.ts          # XFF trust boundary, escaping, confirmation-page render
apps/web/src/lib/rate-limit.ts               # bound the in-memory store (finding 5)
apps/web/src/lib/tokens.ts                   # preview-token issuedAt + expiry
apps/web/src/lib/domains.ts                  # (unchanged — resolveDomain already returns notFoundPagePath)
apps/web/src/app/[[...slug]]/page.tsx        # fall back to domain.notFoundPagePath
apps/web/src/lib/payload-client/index.ts     # getPageForSubmission depth for confirmationPage; response shape
apps/web/src/components/page-shell.tsx       # sanitise builder.html/css before dangerouslySetInnerHTML
apps/web/next.config.ts                       # (no change — bodySizeLimit is cms-only)

apps/cms/src/hooks/pages-revalidate.ts       # (unchanged trigger points)
apps/cms/src/hooks/revalidate.ts             # retry-with-backoff, error-level log on final failure
apps/cms/src/collections/Pages.ts            # + confirmationPage relationship field
apps/cms/src/endpoints/leadIntake.ts         # resolve + return confirmationPage
apps/cms/src/fields/grapesjs/field.ts        # starter-template defaultValue for projectData/html/css
apps/cms/src/payload.config.ts               # bodyParser.limits.fieldSize -> 500kb; admin.components.graphics.Logo
apps/cms/next.config.mjs                     # serverActions.bodySizeLimit -> "500kb"
apps/cms/src/components/Logo.tsx             # new — replaces Payload's default login logo

infra/deploy/Caddyfile                        # admin host gets an @notAllowed remote_ip matcher, 403 otherwise
infra/.env.example                            # ADMIN_ALLOWED_IPS (or similar) documented
packages/shared                               # countBlocks / cache-tag helpers — read, not changed
```

**Structure Decision**: No new app or package. Every change lands inside the
existing `apps/cms`, `apps/web`, or `infra` trees, following each app's
established file layout (collections/hooks/endpoints on the CMS side,
route handlers/lib on the renderer side, edge config in `infra/`).

## Phasing

Each phase = one commit on `003-post-launch-improvements`, local stack only,
independently revertible.

### Phase 1 — Trust boundary for client IP (finding: X-Forwarded-For bypass)

- `infra/deploy/Caddyfile`: the `web`/`cms` `reverse_proxy` blocks add
  `header_up X-Real-IP {http.request.remote.host}` — a header Caddy sets from
  the actual TCP peer, overwriting anything the client sent, so it cannot be
  spoofed end-to-end.
- `apps/web/src/app/api/leads/route.ts`: read the client IP from `X-Real-IP`
  first; fall back to `X-Forwarded-For`'s **last** hop only when `X-Real-IP`
  is absent (host-mode dev without Caddy in front), never the first
  (client-controlled) hop.
- Unit test: a request carrying a forged `X-Forwarded-For` plus a trusted
  `X-Real-IP` is rate-limited on the trusted value.

Verify: `docker compose -f base -f prod config` renders the new `header_up`;
local repro sends two requests with different spoofed `X-Forwarded-For` but
the same real connection and confirms the second is still rate-limited.

### Phase 2 — Escape reflected content & sanitise editor HTML (findings: reflected XSS, stored XSS)

- `apps/web/src/app/api/leads/route.ts`: the `page()` helper's `title`/`body`
  interpolation sites that carry request-influenced values (validation error
  text built from field labels, `backLink`'s `ref`) get HTML-escaped before
  interpolation. Add a tiny `escapeHtml()` helper (no new dependency —
  reflected values here are short, plain-text-shaped).
- `apps/web/src/components/page-shell.tsx`: run `builder.html`/`builder.css`
  through a sanitiser before `dangerouslySetInnerHTML` (research.md §3 for
  the library choice and the allow-list needed to keep GrapesJS's own output
  — including `data-block="lead-form"` — intact).
- Regression tests: a crafted `<script>`/`onerror=` fragment in a reflected
  field renders inert; a page whose `builder.html` includes a script tag
  renders without it executing (jsdom/Playwright).

Verify: manual repro with a crafted `referer`/field value; existing e2e suite
green (catches any block markup the sanitiser strips that it shouldn't).

### Phase 3 — Preview links expire (finding: preview tokens never expire)

- `apps/web/src/lib/tokens.ts`: `signPreviewToken`/`verifyPreviewToken` adopt
  the same `issuedAt`-in-body pattern as `signFormToken`/`verifyFormToken`;
  `verifyPreviewToken` rejects a token older than a fixed window (decision in
  research.md §4).
- CMS admin's generated preview link (wherever `signPreviewToken` is called
  from — the admin UI component that links to `/preview/:id`) is unaffected;
  the token is minted fresh each time the admin renders the link.
- Unit test: a token verified immediately passes; the same token replayed
  past the window fails.

Verify: open a preview link, confirm it works; fast-forward the clock in the
unit test (no live-waiting repro needed) to confirm expiry.

### Phase 4 — Admin login IP allow-list (finding: no admin network control)

- `infra/deploy/Caddyfile`: the `{$CMS_HOSTNAME}` block gains a
  `@notAllowed not remote_ip {$ADMIN_ALLOWED_IPS}` matcher that responds
  `403` before `reverse_proxy` runs — the login page and every admin route
  are unreachable from outside the list. `ADMIN_ALLOWED_IPS` is a
  space-separated CIDR list.
- `infra/.env.example` / `infra/deploy/README.md`: document
  `ADMIN_ALLOWED_IPS`, with the office/VPN range as the expected value and a
  note that an empty/unset value must **fail closed** (block everyone), not
  open.
- No app-level change — this is edge-only, matching 002's `Caddyfile`
  pattern for finding 2.

Verify: `docker compose -f base -f prod config` renders the matcher; `curl`
the admin host from an address outside the list locally (`curl --interface`
or a second container) gets `403`; from an allowed address it still reaches
login.

### Phase 5 — Bound the shared rate-limit store (finding: unprotected shared store)

- `apps/web/src/lib/rate-limit.ts`: the module-level `Map` gets (a) a hard
  cap on distinct keys (evict the oldest expired entries first, then the
  oldest overall, once the cap is hit) and (b) a periodic sweep removing
  expired buckets, so an attacker cycling through many fake IPs/emails cannot
  grow it unboundedly. Cap size decided in research.md §5.
- Unit test: hammering the limiter with thousands of distinct keys keeps the
  store's size bounded and the limiter still functions for the keys tested
  around the cap boundary.

Verify: unit test; a local burst of distinct-IP requests no longer grows
process memory unbounded (spot-checked, not a formal load test).

### Phase 6 — Deliberate body-size limit (500 KB)

- `apps/cms/src/payload.config.ts`: `bodyParser.limits.fieldSize` →
  `500 * 1024`, comment updated to cite this spec's rationale (JSON-only
  field, images excluded, 200 KB html/css export caps already in
  `builderField`).
- `apps/cms/next.config.mjs`: `serverActions.bodySizeLimit: "500kb"`, same
  comment.
- Regression check: save a page with a realistically large but valid block
  tree (reuse/extend an existing fixture if the e2e suite has one) and
  confirm it still saves under 500 KB; confirm a save that is deliberately
  padded past 500 KB now fails with a clear error instead of a silent 500.

Verify: `docker compose` stack, save the heaviest existing seeded page, no
regression; oversized save gets a clean 413/validation error, not a crash.

### Phase 7 — Republish reliability (finding: editing a published page doesn't visibly go live)

- `apps/cms/src/hooks/revalidate.ts`: `revalidateTags()` retries the POST to
  `WEB_REVALIDATE_URL` up to 3 times with short backoff (mirrors the
  deadline-loop already used in `apps/web`'s `postLeadIntake`) before giving
  up; final failure logs at `error` (not `warn`) with the reason, tags, and
  page id, so it is operationally visible instead of silently swallowed.
- `apps/cms/src/hooks/pages-revalidate.ts`: `pageRevalidate` is still
  fire-and-forget from Payload's perspective (must never block a save, per
  the hook's own comment) but now awaits far fewer silent single-shot
  failures thanks to the retry.
- Admin UX: after saving a published page, the admin shows a brief confirmation
  that includes what actually happened (e.g. surfaces a toast/warning if the
  best-effort revalidation call could not be confirmed) — giving the editor
  positive feedback instead of ambiguity about whether "save" also means
  "live" for a page that's already published. This directly answers the
  original bug report ("no republish function").
- Regression test: simulate a transient failure on the first N attempts of
  the revalidate POST (mock) and confirm the retry recovers; simulate the
  retries all failing and confirm the failure is logged at `error` level with
  identifying details.

Verify: publish a page, edit and save it, confirm the live URL updates
without any other action, across at least the 20 repeated cycles from SC-002;
kill the `web` container briefly during a save to force the fire-and-forget
call to fail, and confirm the retry (or the visible warning) catches it.

### Phase 8 — Editable confirmation page with unsubscribe link

- `apps/cms/src/collections/Pages.ts`: new field `confirmationPage` —
  `relationship`, `relationTo: "pages"`, sidebar position, admin description
  noting it is optional and, when unset, the generic message is used
  (FR-013).
- `apps/cms/src/endpoints/leadIntake.ts`: resolve `page.confirmationPage`
  (already fetched at `depth: 1`) and include a minimal shape
  (`id`, `path`, `domain.hostname`) in the success response alongside the
  existing `successMessage`/`unsubscribeUrl`.
- `apps/web/src/app/api/leads/route.ts`: when the intake response includes a
  `confirmationPage`, fetch and render it through the same `PageShell`
  rendering path as a normal page (reusing `getPublishedPage`/`PageShell`),
  substituting a `{{unsubscribeUrl}}` placeholder token in its rendered
  output with the submitter's real unsubscribe link before responding; when
  absent, keep today's inline "Merci..." fragment unchanged.
- `apps/cms/src/hooks/pages-publish-guard.ts`: no new required field (per the
  Question 2 decision) — confirmation-page absence never blocks publishing.
- Regression tests: a landing page with a confirmation page selected renders
  that page's content with a working unsubscribe link on submission; one
  without falls back unchanged; deleting/unpublishing a page currently used
  as someone's confirmation page is surfaced to the editor (edge case from
  spec.md), not silently broken.

Verify: quickstart.md's confirmation-page scenario end to end on the local
stack.

### Phase 9 — Domain/`www` default landing experience

- `apps/web/src/app/[[...slug]]/page.tsx`: `load()` — when
  `getPublishedPage(domain.id, path)` returns null **and**
  `domain.notFoundPagePath` is set and different from `path`, retry once
  against `domain.notFoundPagePath` before calling `notFound()`. A real page
  at the requested path always wins (FR-015); an unregistered host still 404s
  unchanged (FR-017, `resolveDomain()` already returns `null` for those).
- `infra/deploy/README.md`: a short note that pointing a new domain (or its
  `www` pair) at the VPS means registering it as a `Domain` and setting
  `notFoundPagePath` to an existing default/placeholder page's `path` — no
  code change needed per domain, just data.
- Regression tests: root path with no page + `notFoundPagePath` set → default
  page renders; root path with a real page → real page wins; unregistered
  host → still 404; a domain with `notFoundPagePath` unset behaves exactly
  as today (404), so this is purely additive.

Verify: register `site-a.localhost` and `www.site-a.localhost`-equivalent
(or two local test domains) with no page at `/`, set both to the same
`notFoundPagePath`, confirm both resolve to that content.

### Phase 10 — GrapesJS starter template + admin login branding

- `apps/cms/src/fields/grapesjs/field.ts`: `projectData` (and matching
  `html`/`css`) get a `defaultValue` returning a small starter GrapesJS
  project — a hero/text block plus the existing `lead-form` block definition
  from `blocks.ts` — so `recomputeBlockCount` immediately reports one
  lead-form block on a brand-new, unedited page (satisfies FR-020/US5-3).
- `apps/cms/src/components/Logo.tsx` (new): minimal Trefle wordmark/logo
  component.
- `apps/cms/src/payload.config.ts`: `admin.components.graphics.Logo` points
  at the new component (Payload's own documented admin-branding slot — no
  wrapper, no CSS override hacking).
- Regression tests: creating a page and publishing it unedited passes the
  existing publish-guard suite; the admin login page snapshot/DOM check shows
  no stock Payload logo.

Verify: create a page in the local admin, confirm the block editor opens
pre-populated and the page can be published unedited; load `/admin/login`
and confirm Trefle's own mark, not Payload's.

### Phase 11 — Verification pass

- Cold `docker compose ... down -v` → `up -d --wait` → migrate → seed →
  full Playwright e2e run → manual pass through quickstart.md's scenarios.
- `specs/003-post-launch-improvements/tasks.md`: tick everything; note any
  residual/deferred item (e.g. MFA, explicitly out of scope per the
  Clarifications).

## Risks

| Risk | Mitigation |
|---|---|
| HTML sanitiser strips GrapesJS-generated markup the renderer relies on (`data-block="lead-form"`, scoped classes) | Configure an explicit allow-list covering GrapesJS's own output shape; verify with the existing e2e suite (a broken lead-form block fails US1/US3 of 001 immediately). |
| Caddy `X-Real-IP`/`remote_ip` changes break rate limiting in host-mode dev (no Caddy) | Explicit fallback to `X-Forwarded-For`'s last hop keeps dev working; dev traffic isn't attacker-modelled anyway. |
| IP allow-list locks out the operator if `ADMIN_ALLOWED_IPS` is misconfigured on deploy | Runbook step to verify admin reachability immediately after the Caddy config change, from a known-good address, before disconnecting; documented fail-closed behaviour is intentional, not a bug. |
| Retry-with-backoff on `revalidateTags` adds latency to the Payload save request if the renderer is fully down | Bounded attempts/backoff (mirrors the existing `postLeadIntake` pattern, ~5s ceiling); Payload's own hook comment already establishes "must never block a save" as the invariant — retries stay inside that budget, not open-ended. |
| Confirmation-page relationship allows selecting a page that itself has no content or is unpublished | Out of scope to hard-block in this phase beyond the edge case already in spec.md (deletion/unpublish of a page in use is surfaced to the editor); documented as a known follow-up if it proves confusing in practice. |
| Starter-template default makes `countBlocks`/publish-guard assumptions (JSON shape) subtly wrong | Build the default from the same `blocks.ts` definitions the editor itself uses, not a hand-rolled JSON literal, so it is a real, editor-producible project state. |
