# Feature Specification: Deploy-blocking security hardening

**Feature Branch**: `002-security-hardening`

**Created**: 2026-09-10

**Status**: Draft

**Input**: Fix the four blocking findings from the pre-deploy security review so
Trefle can be exposed on a public VPS. Work and verify entirely on the local
stack; no deployment.

## Context

A pre-deploy review of `main` found four issues that must be resolved before
Trefle is reachable from the public internet:

1. **Vulnerable dependencies** — `npm audit` reports 28 advisories (5 critical,
   10 high) in production dependencies, notably `undici` (HTTP response
   desync / cache poisoning) and `sharp` / libvips (2026 image-parsing CVEs).
2. **No security response headers** — neither app nor the Caddy edge sets a
   Content-Security-Policy, HSTS, `X-Frame-Options`/`frame-ancestors`,
   `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`.
3. **Undefined secret delivery** — `infra/.env` is git-ignored and git-crypt is
   not initialised, yet the runbook and CI assume `git-crypt unlock`. There is
   no working, documented way to get secrets onto the VPS, and a stray
   `git add -f infra/.env` would commit plaintext.
4. **Weak default credentials** — `infra/.env.example` ships
   `POSTGRES_PASSWORD=trefle`; the seed creates admin `trefle-dev-123`;
   `payload.config.ts` silently falls back to `"trefle-secret"` for the S3
   secret. Nothing forces any of these to change for production.

Out of scope (tracked separately as non-blocking review items): X-Forwarded-For
rate-limit bypass, reflected-content escaping in the lead route, editor-HTML
sanitisation, admin-panel MFA / IP allow-list, shared-store rate limiting,
preview-token expiry.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ship without known-vulnerable dependencies (Priority: P1)

The operator runs `npm audit --omit=dev` before a release and sees no critical
or high advisory that has a fix available.

**Why this priority**: `undici` desync/cache-poisoning is remotely reachable
through the renderer's server-side fetches; `sharp` CVEs are reachable through
editor image uploads. Both are exploitable on a public deployment.

**Independent Test**: `npm audit --omit=dev` before vs. after; the full test
suite, typecheck and both app builds still pass; the containerised stack still
serves a published page and passes the Playwright e2e run.

**Acceptance Scenarios**:

1. **Given** the branch after Phase 4a, **When** `npm audit --omit=dev` runs,
   **Then** every remaining advisory is either dev-only, has no fix, or is
   documented as non-exploitable in `specs/002-security-hardening/research.md`.
2. **Given** the branch after Phase 4b (Payload 3.88), **When** the e2e stack
   runs migrate + seed + Playwright, **Then** all specs pass and no new
   migration is required beyond those committed.

### User Story 2 - Safe response headers on every public surface (Priority: P1)

A visitor loading a published page, and an editor loading the admin, both
receive a response whose headers block framing, MIME-sniffing, referrer leakage
and (for the renderer) inline script injection.

**Why this priority**: the renderer emits editor-authored HTML via
`dangerouslySetInnerHTML`; a CSP is the only defence-in-depth against a
malicious or compromised editor account running JS on visitors.

**Independent Test**: `curl -sI` the renderer and the admin on the local stack
and assert each required header; load a published page and the admin in a real
browser with no CSP violation in the console; the Playwright e2e run still
passes (catches hydration breakage).

**Acceptance Scenarios**:

1. **Given** the local stack, **When** `curl -sI http://localhost:3001/<published path>`,
   **Then** the response carries `Content-Security-Policy`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
   `X-Frame-Options: DENY` (and `frame-ancestors 'none'` in the CSP),
   `Permissions-Policy`, and no `X-Powered-By`.
2. **Given** a published page in a browser, **When** it loads, **Then** it
   hydrates with zero CSP violations and the lead form still submits.
3. **Given** the admin in a browser, **When** an editor logs in and opens the
   GrapesJS editor, **Then** the panel works with no CSP violation.
4. **Given** the prod Caddy config, **When** `docker compose ... config` renders
   it, **Then** each site block imports the shared header snippet with
   `Strict-Transport-Security`.

### User Story 3 - A real, documented secret-delivery mechanism (Priority: P1)

The person who owns the repo initialises git-crypt once; from then on
`infra/.env` is committed encrypted, and a new VPS is provisioned by copying one
key file over SSH and running `git-crypt unlock`.

**Why this priority**: without this, there is no repeatable way to deploy, and
the current setup invites a plaintext-secret commit.

**Independent Test**: `git-crypt status infra/.env` reports it encrypted;
`git show HEAD:infra/.env` is a git-crypt blob, not readable text;
`git-crypt lock` then `git-crypt unlock <key>` round-trips the file; the CI
fallback path still provisions a working `infra/.env`.

**Acceptance Scenarios**:

1. **Given** a fresh clone with the key file, **When** `git-crypt unlock key`
   runs, **Then** `infra/.env` decrypts to the expected keys.
2. **Given** the branch, **When** a reviewer inspects the diff, **Then**
   `infra/.env` appears as an encrypted blob and no plaintext secret is visible.
3. **Given** `infra/deploy/README.md`, **When** the operator follows §0–§1,
   **Then** the steps match reality (git-crypt is initialised; the key travels
   out of band; no fictional step).

### User Story 4 - Production refuses to start with weak or missing secrets (Priority: P1)

Bringing the stack up with `NODE_ENV=production` and a missing S3 secret, a
default Postgres password, or a too-short `PAYLOAD_SECRET` fails fast with a
clear message instead of booting insecurely.

**Why this priority**: defaults that "just work" in dev become the production
configuration if nothing stops them.

**Independent Test**: run `infra/deploy/preflight.sh` against a deliberately
weak `infra/.env` and see it exit non-zero naming each problem; start the cms
in production mode with `S3_SECRET_ACCESS_KEY` unset and see it throw at boot;
the dev stack (`docker compose up`) still starts unchanged.

**Acceptance Scenarios**:

1. **Given** `NODE_ENV=production` and `S3_SECRET_ACCESS_KEY` unset, **When**
   the cms starts, **Then** it exits with `Missing required env var:
   S3_SECRET_ACCESS_KEY` and does not serve.
2. **Given** `NODE_ENV=production` and `SEED_ADMIN_PASSWORD` unset, **When**
   `seed:dev` runs, **Then** it refuses to create the admin (or creates it
   `invited`, password unusable) rather than seeding `trefle-dev-123`.
3. **Given** a weak `infra/.env` (`POSTGRES_PASSWORD=trefle`, `PAYLOAD_SECRET`
   < 32 chars), **When** `infra/deploy/preflight.sh` runs, **Then** it lists
   both and exits 1.
4. **Given** the unchanged dev flow (`docker compose -f base -f override up`),
   **When** the stack starts, **Then** nothing regresses.

### Edge Cases

- Nonce-based CSP must not break Next's own inline bootstrap/hydration scripts
  in either app (Next 16 renderer, Next 15 admin).
- Tightening `img-src` must not blank out editor-referenced external images or
  ImgProxy-served images.
- The Payload 3.88 bump must not require a data migration that isn't committed,
  and must not break the GrapesJS field, `storage-s3`, or the Postgres adapter.
- `preflight.sh` must treat CI's placeholder secrets as acceptable (it runs
  only for real deploys, invoked from the runbook — not in CI).
- git-crypt: a clone without the key must still `npm ci` / lint / typecheck /
  build (only the e2e job needs `infra/.env`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `npm audit --omit=dev` MUST report no fixable critical/high
  advisory after Phase 4. Any residual advisory MUST be recorded in
  `research.md` with a reason (dev-only, no fix, or not exploitable).
- **FR-002**: Dependency changes MUST keep lint, typecheck, unit tests and both
  app builds green, and the Playwright e2e run passing.
- **FR-003**: The Payload upgrade (3.68 → 3.88) MUST be a standalone commit,
  independently revertible, with any generated migration/types/importmap
  committed alongside it.
- **FR-004**: The renderer (`apps/web`) MUST send a `Content-Security-Policy`
  with at least `default-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, and a
  `script-src` that does not contain `'unsafe-inline'` (nonce-based).
  *Amended by 014-custom-code-editing: `script-src` is unchanged, admin page
  scripts carry the request nonce; `connect-src`, `frame-src`, `media-src`
  and `style-src` are opened to `https:` so third-party pixels and widgets
  work.*
- **FR-005**: Both apps MUST send `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
  denying camera/microphone/geolocation, and MUST NOT send `X-Powered-By`.
- **FR-006**: The admin (`apps/cms`) MUST send `X-Frame-Options` and a CSP with
  `frame-ancestors` restricting embedding; it MAY keep a permissive
  `script-src` to avoid breaking Payload's bundle (documented as follow-up).
- **FR-007**: The prod Caddy config MUST add `Strict-Transport-Security`
  (`max-age >= 31536000; includeSubDomains`) to every served host.
- **FR-008**: `infra/.env` MUST be tracked and git-crypt-encrypted; the repo
  MUST NOT contain a plaintext secret in history after this change.
- **FR-009**: `infra/deploy/README.md` MUST describe the actual one-time
  git-crypt initialisation and the out-of-band key transfer, with no step that
  does not work.
- **FR-010**: In `NODE_ENV=production`, the cms MUST fail to boot if any of
  `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` is
  unset. In dev the existing fallbacks MAY remain.
- **FR-011**: `seed:dev` MUST NOT create an admin with a hard-coded password
  when `NODE_ENV=production`; it MUST require `SEED_ADMIN_PASSWORD` (>= 16
  chars) or create the admin in an unusable `invited` state.
- **FR-012**: `infra/.env.example` MUST ship no usable secret value
  (`POSTGRES_PASSWORD` empty, with a generation hint).
- **FR-013**: `infra/deploy/preflight.sh` MUST check, for a prod `infra/.env`:
  `PAYLOAD_SECRET` length >= 32, `POSTGRES_PASSWORD` set and != `trefle`, all
  `S3_*` set, `IMGPROXY_KEY`/`SALT` set, `REVALIDATE_SECRET` /
  `UNSUBSCRIBE_SECRET` / `FORM_TOKEN_SECRET` set, `RELEASE` set — and exit
  non-zero listing every failure.
- **FR-014**: No change in this feature may regress the local dev flows
  (`docker compose up` full stack, and host `npm run dev`).

### Key Entities

N/A — no data-model change. (If Payload 3.88 emits a migration, it is an
infrastructure artifact, not a domain entity.)

## Success Criteria *(mandatory)*

- **SC-001**: `npm audit --omit=dev` critical + high count drops from 15 to 0
  fixable; the delta and any residual are listed in `research.md`.
- **SC-002**: `curl -sI` on the local renderer shows all six header
  requirements (FR-004/005) in one response; `X-Powered-By` absent.
- **SC-003**: A published page and the admin both load in a browser with zero
  CSP violations; the Playwright e2e run is green on the final branch.
- **SC-004**: `git show HEAD:infra/.env | strings` reveals no secret; a
  colleague with only the key file can `git-crypt unlock` and deploy.
- **SC-005**: `infra/deploy/preflight.sh` exits 1 on a weak env and 0 on a
  complete one; the cms refuses to boot in prod mode with S3 unset.
- **SC-006**: `docker compose -f base -f override up -d --wait` still reaches
  all-healthy and serves a seeded page — dev is unregressed.

## Assumptions

- One VPS, one small trusted team; git-crypt (symmetric key, shared out of
  band) is an acceptable secret store — this matches the constitution.
- A pragmatic renderer CSP (`img-src` allows `https:` and `data:`,
  `style-src` allows `'unsafe-inline'` for editor CSS) is acceptable; the
  strict part is `script-src` (nonce, no `'unsafe-inline'`).
- Tightening the admin CSP `script-src` is follow-up, not a blocker — the admin
  is used only by trusted staff.
- `preflight.sh` is run by the operator from the runbook, not wired into CI.
- The Payload 3.68 → 3.88 bump is in range (same major, `@payloadcms/next`
  still targets Next 15); if it needs an un-committed schema migration or
  breaks e2e, Phase 4b stops and is reported rather than forced.
