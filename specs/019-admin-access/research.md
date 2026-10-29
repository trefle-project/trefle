# Research: Admin access — verified identity at the edge, two-factor login

**Feature**: 019-admin-access | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

Facts checked on 2026-10-11 against the repository (`main` at `b1c083c`), the
Cloudflare documentation, npm and the plugins' own source.

## R1 — Edge identity check: Cloudflare Access, one application, e-mail code

**Decision**: Cloudflare Zero Trust **Access** (free for ≤ 50 users), with:

- the **One-time PIN** login method (a code sent to the e-mail address typed);
- **one self-hosted application** covering the three internal hosts —
  `CMS_HOSTNAME`, `GROWTHBOOK_HOSTNAME`, `GROWTHBOOK_API_HOSTNAME`;
- an **Allow** policy whose `include` is the list of active members' e-mail
  addresses (R7), plus a **Service Auth** policy for one service token used by
  `apply.sh` (R7) and, later, monitoring (spec Edge Cases);
- application **session duration 24 h** (FR-004);
- **Eager redirect cookie** on, so the `CF_Authorization` cookie is set on all
  three hosts at sign-in — GrowthBook's interface calls its API host from the
  browser before the user ever visits it;
- **OPTIONS preflight bypass** on, because those cross-origin calls are
  preflighted and a preflight carries no cookie.

The application, its policies and the service token are configuration as code
in `infra/cloudflare/` (constitution, Architecture → Edge), applied by
`apply.sh`. Creating the Zero Trust organisation (team name, plan selection)
is a one-time dashboard step done by the user, recorded in the runbook.

**Rationale**: Already the provider in front of every host (017); the code
step happens before any byte reaches the VPS; no address list; members' only
requirement is a mailbox.

**Alternatives**: address list (rejected by the spec: members change
networks); Google/Microsoft login (out of scope, spec); identity check only in
Payload (does not cover GrowthBook, and the admin login page stays public).

## R2 — Origin proof of the edge check: JWT verified by Caddy

**Decision**: on the three internal hosts, Caddy verifies the
`Cf-Access-Jwt-Assertion` header that Access adds to every authorised request:
signature against the team's published keys
(`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), issuer = the
team domain, audience = the application's AUD tag. A request without a valid
token gets `403` before reaching Payload or GrowthBook. This **replaces** the
`@notAllowed not client_ip {$ADMIN_ALLOWED_IPS}` matchers (R9). Authenticated
Origin Pulls and the firewall (017) stay unchanged.

Module: `github.com/ggicci/caddy-jwt` **v1.4.0** (MIT, 2026-08-21, needs
Caddy ≥ 2.10.1 — we pin 2.11.7), added to the existing `xcaddy` build in
`infra/caddy/Dockerfile`. Options used: `from_header Cf-Access-Jwt-Assertion`,
`jwk_url`, `issuer_whitelist`, `audience_whitelist`, `user_claims email`.

**To verify during implementation**: how the module refreshes the key set
when Access rotates its signing key (every 6 weeks) — it must re-fetch on an
unknown `kid`, or on a timer shorter than the overlap. A test with a token
signed by a key absent from the cached set is part of the contract
(contracts/edge-access.md).

**Rationale**: Covers GrowthBook as well as the admin with one mechanism, at
the place the old check lived; Cloudflare's own documentation says the token
must be validated at the origin unless a Tunnel is used.

**Alternatives**: verify in Payload's `proxy.ts` (does not cover GrowthBook);
Cloudflare Tunnel with `access.required` (would change how the origin is
reached — the 017 firewall/AOP model — far beyond this feature; a possible
future simplification); a static secret header added by a Transform Rule
(proves only "came through our zone", which AOP already proves, not "passed
Access").

## R3 — Two-factor login: `payload-totp` plugin

**Decision**: `payload-totp` **3.0.6** (MIT, peer `payload ^3.88.0`, released
2026-10-04; depends on `otpauth`, `qrcode`, `jsonwebtoken`). Configuration:

- `collection: "users"`, `forceSetup: true` (FR-006: enrolment forced at the
  next login), `totp.issuer: "Trefle"`, defaults otherwise (6 digits, 30 s,
  SHA-1 — what every authenticator app supports);
- placed **last** in `plugins` (it wraps the access of every collection and
  global present when it runs);
- `disabled: process.env.TOTP_DISABLED === "1"` for local development and the
  local e2e suite (FR-013); production never sets it, and the release
  preflight refuses it (contract);
- `apps/cms/src/proxy.ts` added (Next.js 16 convention) to pass `x-pathname`,
  as the plugin requires;
- `Users.access.unlock` restricted to Administrators (the plugin's lockout on
  wrong codes reuses the collection's `maxLoginAttempts` / `lockTime`).

The plugin adds a `totpSecret` field on `users` and a hidden `totp-attempts`
collection — a Payload migration (expand only).

**Rationale**: Maintained, tracks Payload's version, enforces the second
factor on REST, GraphQL and the Local API (not only in the admin UI), counts
wrong codes, leaves API keys alone (FR-011: the renderer's service account).

**Alternatives**: our own TOTP (more code to own for no gain);
`payload-passkey` (passkeys — out of scope).

## R4 — Our own endpoints and access helpers must require the second factor

**Finding**: the plugin's TOTP strategy marks a verified session with
`req.user._strategy === "totp"`, but a session that has only passed the
password still has `req.user` set. The plugin wraps collection and global
access functions, **not custom endpoints** (its README says so). Trefle has 23
custom endpoints (`apps/cms/src/endpoints/`), and several authorise by reading
`req.user` directly (e.g. `leadIntake.ts` `isServiceCaller`, admin-only
actions such as `dsrErase`, `leadsExport`, `promoteVariant`). Without a change
they would accept a password-only session.

**Decision**: one change at the source — `apps/cms/src/access/index.ts`:
a human counts as authenticated only when `_strategy === "totp"` (or the
plugin is disabled). Every endpoint is audited to authorise through these
helpers (or `totpAccess`), and `jobs.access.run` is combined with
`totpAccess` as the plugin documents. API-key callers (`_strategy ===
"api-key"`) are unchanged.

**Rationale**: one rule in one file instead of 23 local checks; testable.

## R5 — Recovery: setup key in the password manager instead of recovery codes

**Finding**: the plugin has **no recovery codes**.

**Decision (accepted 2026-10-11 — spec FR-006/FR-010 amended)**: at enrolment, the setup page
shows the secret as text next to the QR code; each member saves that **setup
key in the team's password manager** (most password managers can also produce
the codes themselves). This is the "recovery codes kept in a password
manager" of the clarification, without new code. The enrolment screen says
so in French (copy in contracts/cms-endpoints.md).

**Trade-off**: a recovery code is burnt when used (a stolen one that is used
shows up); the setup key is not — a copy keeps producing codes until the
second factor is reset (`reset-totp`, R6) or redone by the member, which
makes every earlier copy useless. Both would live in the same vault.
Compensating rules, in the runbook: (1) after any use of the vault copy, the
member's second factor is redone and the vault copy replaced; (2) a departing
member is deactivated (login refused at once, edge after `--sync-members`).
True single-use codes stay a contained follow-up if ever needed.

## R6 — Reset of another member's second factor; emergency reset

**Decision**:

- `POST /api/users/:id/reset-totp` — Administrators only (with a verified
  second factor themselves), cannot target oneself; clears `totpSecret` with
  `overrideAccess`, clears the code lockout, writes `totp-reset` to the
  activity log. With `forceSetup`, the member re-enrols at next login. A
  « Réinitialiser la double authentification » button on the member's edit
  view calls it, with a confirmation.
- Emergency (FR-010 step 2): `apps/cms/scripts/reset-totp.ts`, run on the VPS
  with `$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>` —
  Local API, same effect, no actor, `meta.via: "ssh"`. Documented in the
  runbook; to be run by the user (Claude cannot run VPS writes).

## R7 — Edge authorisation follows the active members (`apply.sh`)

**Decision**:

1. CMS endpoint `GET /api/edge-access` returns the active human members'
   e-mails (sorted, lower-cased). Caller authentication: header
   `X-Edge-Sync-Secret` equal to `EDGE_SYNC_SECRET` (new secret, compared in
   constant time). No new user type.
2. `apply.sh` calls it through Access with the **service token**
   (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), writes the list into
   the Allow policy's `include`, then calls `POST /api/edge-access/synced`
   with the list it applied.
3. The CMS stores that list and the time in a hidden global `edge-access`.
   A banner for Administrators compares it with the active members and names
   the addresses to add or remove (FR-008, SC-005) — computed on each admin
   page load, no background job.

The CMS holds no Cloudflare credential (clarification). The Cloudflare token
used by `apply.sh` gains *Access: Apps and Policies — Edit* and *Access:
Service Tokens — Edit* (account level).

**Alternatives**: SSH + `psql` from `apply.sh` (Claude and automation cannot
read the prod DB; no write-back for the warning); a CMS hook calling
Cloudflare (rejected in clarification).

## R8 — GrowthBook

Covered by R1/R2 on both of its hosts; its own e-mail/password login is
unchanged (FR-007). Server-side callers of GrowthBook (planned in 018) MUST
use the internal address `http://growthbook:3100`, never the public API host
— noted in 018's plan inputs.

## R9 — Removal of the address list (FR-012)

Removed, in the last release of the rollout (R10): the `client_ip` matchers in
`infra/deploy/Caddyfile`, `ADMIN_ALLOWED_IPS` in `infra/docker-compose.prod.yml`,
`infra/.env.example`, `infra/.env`, `infra/cloudflare/secret.env(.example)`,
the `{{ADMIN_IPS}}` substitution and the "Internal hosts: allowed addresses
only" rule in `infra/cloudflare/apply.sh` / `rules/waf-custom.json` (the
load-test rule stays), and the mentions in both deploy READMEs, the
Cloudflare README and `docs/cdn-cache-exploration.fr.md`. 003 FR-004 and 017
FR-008/R6 get a "superseded by 019" note.

## R10 — Rollout order (no lockout, each step undoable)

1. **Two-factor** (code release): plugin enabled, members enrol at next
   login. Undo: `TOTP_DISABLED=1` on the VPS + recreate `cms`.
2. **Access** (`apply.sh`): Zero Trust organisation created by the user;
   application, policies, service token applied; member list synced. The old
   address check is still in place (wide open), so nothing can lock out yet.
   Undo: `apply.sh` with `ACCESS_ENABLED=0` deletes the application.
3. **Origin check + removal** (release with a Caddy **recreate** — a
   Caddyfile-only release is not picked up otherwise, PR #19): JWT verification replaces
   the address matchers; WAF rule and variables removed. Undo: previous tag.
4. **Drill**: emergency procedure timed (SC-004), rollback of step 3 timed.

## R11 — Tests

- Unit (Vitest, `apps/cms/tests`): access helpers with `_strategy` totp /
  local-jwt / api-key / plugin disabled; `reset-totp` endpoint (roles, self,
  log); `edge-access` endpoints (secret, list content, drift computation).
- e2e (Playwright, local): suite keeps `TOTP_DISABLED=1`; one new spec runs
  the CMS with the plugin enabled and a seeded secret, computes codes with
  `otpauth`, and covers enrol → login → refused wrong code → admin reset.
- Production regression (017 V8): needs the service token and an e2e member
  with a known setup key — recorded in quickstart, run by the user.

## R12 — Legal (FR-014)

Cloudflare processes members' e-mail addresses (and the IP and time of each
sign-in) for Access. Added to the legal notice and processing register
together with 017 T059.
