---

description: "Task list for 019 — Admin access: verified identity at the edge, two-factor login"
---

# Tasks: Admin access — verified identity at the edge, two-factor login

**Input**: Design documents from `/specs/019-admin-access/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the constitution (Principle IV) requires them:
Payload access-control rules, custom endpoints and hooks. Edge and origin
behaviour is validated by the quickstart scenarios (V0–V8).

**Organization**: Tasks are grouped by user story. **Delivery order differs
from story order** (research R10): US2 (two-factor) ships first, then US1
(edge, then origin + removal), then US3 — so no step can lock the team out.

**Who runs what**: tasks marked **(user)** are Cloudflare writes, VPS writes
or dashboard steps that auto mode blocks for Claude; Claude prepares the exact
command and verifies the result with reads.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3 from spec.md
- Paths are relative to the repository root (`apps/cms`, `apps/web`, `infra/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, secrets, one-time Cloudflare account steps

- [x] T001 Add `payload-totp` pinned to exactly `3.0.6` to `apps/cms/package.json` (lockfile updated); the PR body carries the Principle II justification (plan.md Complexity Tracking)
- [x] T002 [P] Add `--with github.com/ggicci/caddy-jwt@v1.4.0` to the `xcaddy build` line in `infra/caddy/Dockerfile` (Caddy stays 2.11.7 ≥ 2.10.1); Principle II justification in the PR body
- [x] T003 [P] Document the new keys, names only: `TOTP_DISABLED`, `ALLOW_TOTP_DISABLED`, `EDGE_SYNC_SECRET`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` in `infra/.env.example`; `ACCESS_ENABLED`, `ACCESS_SERVICE_TOKEN_ID`, `ACCESS_SERVICE_TOKEN_SECRET`, `EDGE_SYNC_SECRET`, `CLOUDFLARE_ACCOUNT_ID` in `infra/cloudflare/secret.env.example`
- [x] T004 (user) Create the Cloudflare Zero Trust organisation (team name, Free plan) and add the One-time PIN login method; extend the `apply.sh` API token with account-level *Access: Apps and Policies — Edit* and *Access: Service Tokens — Edit*; record the team domain in `infra/.env` and `infra/cloudflare/secret.env` (git-crypt)
  - *2026-10-16*: team `your-team` (https://your-team.cloudflareaccess.com), One-time PIN added, `trefle-config` extended with Access: Apps and Policies, Access: Service Tokens — Edit and Access: Organizations, Identity Providers, and Groups — Read (needed to find the One-time PIN id); checked by listing apps, service tokens and identity providers with it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared pieces used by more than one story

- [x] T005 Add activity-log types `totp-enrolled`, `totp-reset`, `totp-locked`, `edge-synced` to the `type` select in `apps/cms/src/collections/ActivityLog.ts` (data-model.md: "No e-mail address in `targetId`")
- [x] T006 [P] Generate a strong `EDGE_SYNC_SECRET` and store it in `infra/.env` and `infra/cloudflare/secret.env` (git-crypt, same value); never print it
  - *2026-10-16*: done in step 2. The real value is in `secret.env`; the committed `infra/.env` has a dev value, so `release.sh` stops once for the operator to add the real one on the VPS.

**Checkpoint**: dependencies installable, secrets in place, nothing changed in behaviour.

---

## Phase 3: User Story 2 - Two-factor login to the admin (Priority: P1) 🚀 ships first

**Goal**: Every human login needs password + authenticator-app code; enrolment forced; our own endpoints honour it.

**Independent Test**: quickstart V0 (local) and V4 (production).

### Tests for User Story 2

- [x] T007 [P] [US2] Unit tests in `apps/cms/tests/access-totp.test.ts`: each helper of `apps/cms/src/access/index.ts` with `_strategy` `totp` (allowed as before), `local-jwt` (refused), `api-key` service user (unchanged), plugin disabled (as before)
- [x] T008 [P] [US2] Endpoint tests in `apps/cms/tests/endpoints-totp.test.ts`: for one endpoint of each auth pattern found by T012 (human-only, admin-only, service-or-admin), a password-only session gets `403`, a verified session and the API key keep their current result
- [x] T009 [P] [US2] Test for `apps/cms/scripts/reset-totp.ts` in `apps/cms/tests/reset-totp-script.test.ts`: clears `totpSecret` and the code lockout, logs `totp-reset` with no actor and `meta.via: "ssh"` (tests `src/lib/totp-reset.ts`, which the script calls; its exit `1` for an unknown e-mail was checked by hand)

### Implementation for User Story 2

- [x] T010 [US2] Register `payloadTotp({ collection: "users", forceSetup: true, totp: { issuer: "Trefle" }, disabled: process.env.TOTP_DISABLED === "1" })` as the **last** plugin in `apps/cms/src/payload.config.ts`; combine `jobs.access.run` with `totpAccess` as the plugin documents
- [x] T011 [P] [US2] Create `apps/cms/src/proxy.ts` (Next.js 16 convention) appending the `x-pathname` header, per the plugin README; check `node_modules/next/dist/docs/` for the proxy API first (AGENTS.md)
- [x] T012 [US2] In `apps/cms/src/access/index.ts`, make a human count as authenticated only when `req.user._strategy === "totp"` or the plugin is disabled (contracts/cms-endpoints.md "Authentication rule"); API-key callers unchanged
- [x] T013 [US2] Audit the 23 endpoints in `apps/cms/src/endpoints/` (list each with its auth pattern in the PR body); route every direct `req.user` check (e.g. `isServiceCaller` in `leadIntake.ts`) through the helpers of T012 or `totpAccess`
- [x] T014 [P] [US2] Restrict `access.unlock` to Administrators in `apps/cms/src/collections/Users.ts`
- [x] T015 [US2] Log `totp-enrolled` (users `afterChange` when `totpSecret` goes from empty to set) in `apps/cms/src/hooks/users-activity.ts`, and `totp-locked` (lock reached on `totp-attempts`, hook added by a small config step after the plugin — it must stay last for collections, hooks are fine) — never the secret, never the e-mail
- [x] T016 [US2] Add the French setup hint (contracts/cms-endpoints.md "Setup page hint") to the plugin's setup view (custom component or the plugin's i18n override, whichever the plugin supports)
- [x] T017 [US2] Create `apps/cms/scripts/reset-totp.ts <email>` (Local API, `overrideAccess`, clears secret and lockout, logs `totp-reset` with no actor and `meta.via: "ssh"`; messages per contract)
- [x] T018 [US2] Create the Payload migration `apps/cms/src/migrations/<timestamp>_totp.ts` (`users.totp_secret`, table `totp_attempts`) with a working `down`
- [x] T019 [P] [US2] Pass `TOTP_DISABLED` to the `cms` service in `infra/docker-compose.prod.yml`; make `infra/deploy/preflight.sh` refuse a release when `TOTP_DISABLED=1` unless `ALLOW_TOTP_DISABLED=1` (rollback only)
- [x] T020 [P] [US2] Local dev and e2e: set `TOTP_DISABLED=1` for the dev stack (`infra/docker-compose.override.yml`) and for `npm run dev` (documented in `infra/.env.example`, set in the ignored `apps/cms/.env.local`) — the stacks the e2e suite runs against, including `infra/docker-compose.e2e.yml` — so the existing suite is unchanged (FR-013)
- [x] T021 [US2] e2e `apps/web/tests/e2e/admin-totp.spec.ts`, gated by `E2E_TOTP=1` (stack started without `TOTP_DISABLED`): seeded member enrols (code computed with `otpauth` from the secret read on the setup page), logs out, wrong code refused, right code reaches the dashboard, password-only `Authorization: JWT` call to a custom endpoint gets `403`
- [x] T022 [US2] Runbook in `infra/deploy/README.md` and `README.fr.md`: what members will see, enrolment with the setup key saved in the password manager, the two compensating rules (research R5), `reset-totp.ts` command, rollback (`TOTP_DISABLED=1` + `ALLOW_TOTP_DISABLED=1`, recreate `cms`)
- [x] T023 [US2] Run quickstart V0; lint, type-check, build `apps/cms` and `apps/web`, unit tests, full local e2e, `E2E_TOTP=1` spec, compose stack healthy; record in the PR body
- [x] T024 [US2] (user snapshot, then `release.sh`) Release step 1; every member enrols at next login (quickstart V4); confirm `totp-enrolled` for each in the activity log
  - *2026-10-16*: released as tag `019.1-admin-totp`. The owner enrolled (Apple Passwords), signed in again with a code, and `totp-enrolled` is in the log. T024 was closed on « the owner is the only member », but two more members are active in production (seen in the step 2 member list); the owner keeps them. They enrol at their next login (`forceSetup`).

**Checkpoint**: production admin requires two factors; edge unchanged.

---

## Phase 4: User Story 1 - Only authorised people reach the admin and GrowthBook (Priority: P1)

**Goal**: Cloudflare Access code step on the three internal hosts; the origin refuses anything without a valid Access token; the address list is gone.

**Independent Test**: quickstart V1, V2, V3.

### Tests for User Story 1

- [x] T025 [P] [US1] Endpoint tests in `apps/cms/tests/edge-access.test.ts`: `GET /api/edge-access` and `POST /api/edge-access/synced` — missing/wrong secret `401`, secret unset `503`, list = active human members "lower-cased, sorted, de-duplicated" (service and inactive users excluded), invalid body `400`, POST writes the global and logs `edge-synced` with the count
- [x] T026 [P] [US1] Origin check test (local Caddy with the T002 image, a local JWKS and test keys) in `infra/caddy/test-access-jwt.sh`: the six cases of contracts/edge-access.md "Origin verification", including a token signed by a key added to the JWKS after Caddy started (rotation, research R2)
  - *2026-10-16*: 11 cases pass against the image built with caddy-jwt v1.4.0, the snippet taken verbatim from the Caddyfile (also: a member token alongside Payload's own `Authorization` header, POST without a token). Rotation: the first request with an unknown `kid` triggers a refresh and is refused; the next ones pass.

### Implementation for User Story 1 — edge (release step 2)

- [x] T027 [P] [US1] Create the hidden global `apps/cms/src/globals/EdgeAccess.ts` (`emails` array of text, `syncedAt` date; `read: isAdmin`, no update from the admin) and register it
- [x] T028 [US1] Create `apps/cms/src/endpoints/edgeAccess.ts` (GET list, POST synced; constant-time secret compare) per contracts/cms-endpoints.md; pass `EDGE_SYNC_SECRET` to `cms` in `infra/docker-compose.prod.yml`
- [x] T029 [US1] Migration `apps/cms/src/migrations/<timestamp>_edge_access.ts` for the global, with `down`
- [x] T030 [P] [US1] Create `infra/cloudflare/access/application.json` and `infra/cloudflare/access/policies.json` templates per contracts/edge-access.md (hostnames, 24 h, One-time PIN only, eager redirect cookie, OPTIONS preflight bypass, `members` + `automation` policies)
- [x] T031 [US1] Extend `infra/cloudflare/apply.sh` (and `lib.sh`): upsert the application by name, create the `trefle-apply` service token once (stop and print the save instruction), `--sync-members` (GET list through Access with the service token, **abort on an empty list**, PUT `members` include, POST synced), `ACCESS_ENABLED=0` deletes the application; print the AUD tag to store as `ACCESS_AUD`
  - *2026-10-16*: in `infra/cloudflare/access.sh`, run by `apply.sh` and by `apply.sh --sync-members`; policies are reusable account policies `trefle-members` / `trefle-automation`. Checked with `--dry-run` only: Cloudflare writes are the user's (T033).
- [x] T032 [P] [US1] Document Access in `infra/cloudflare/README.md` (token scopes, first run, `--sync-members`, `ACCESS_ENABLED=0`)
- [x] T033 [US1] (user, after the T028 release) Run `apply.sh`, save the service token and `ACCESS_AUD` in the git-crypt'd files, run `--sync-members`; Claude verifies with Cloudflare reads and quickstart V1, V2
  - *2026-10-16*: released as tag `019.2-edge-access`; `apply.sh --sync-members` run twice by the owner (service token `trefle-apply`, expires 2027-10-16; then policies, application, sync: 3 members). Checked from outside: the three internal hosts redirect to the `your-team` login, public hosts unchanged, application settings as in the contract. The owner checked V1 (code received, admin reached) and V2 (no code for an address not in the list).

### Implementation for User Story 1 — origin and removal (release step 3)

- [x] T034 [US1] Add the `(access_jwt)` snippet to `infra/deploy/Caddyfile` and import it in the `CMS_HOSTNAME`, `GROWTHBOOK_HOSTNAME`, `GROWTHBOOK_API_HOSTNAME` sites, replacing the `@notAllowed not client_ip {$ADMIN_ALLOWED_IPS}` matchers; pass `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` to `caddy` with `:?` in `infra/docker-compose.prod.yml` (fail closed)
  - *2026-10-16*: plus — CORS preflights (OPTIONS) pass without a token (Access bypasses them, `options_preflight_bypass`); caddy-jwt's per-request INFO lines kept out of the default log (WARN and above only); `release.sh` now expects `401` from the admin host without a token; preflight requires `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`.
- [x] T035 [US1] Remove `ADMIN_ALLOWED_IPS` everywhere (research R9): `infra/docker-compose.prod.yml`, `infra/.env.example`, `infra/.env`, `infra/cloudflare/secret.env(.example)`, the `{{ADMIN_IPS}}` substitution in `infra/cloudflare/apply.sh`, the "Internal hosts: allowed addresses only" rule in `infra/cloudflare/rules/waf-custom.json` (load-test rule kept), `infra/deploy/README.md`, `README.fr.md`, `infra/cloudflare/README.md`, `docs/cdn-cache-exploration.fr.md`
  - *2026-10-16*: the VPS `infra/.env` keeps its `ADMIN_ALLOWED_IPS` line (release.sh restores the operator file): the previous tag's compose still requires it for a rollback. Delete it once 019.3 is settled.
- [x] T036 [P] [US1] Add "superseded by 019" notes to 003 FR-004 (`specs/003-post-launch-improvements/spec.md`) and 017 FR-008 / R6 / T025 (`specs/017-edge-protection/`)
- [x] T037 [US1] (user snapshot, then `release.sh` with a **Caddy recreate**) Release step 3; (user) `apply.sh` to drop the WAF rule; Claude runs quickstart V2 and V3 (V3's on-VPS curl handed to the user)
  - *2026-10-16*: released as tag `019.3-origin-check` (Caddy recreated; release.sh verify: admin without a token → `401`). From outside, with the `trefle-apply` service token, Access's real token is accepted by Caddy on the admin, the sync endpoint and the GrowthBook API (`200`); anonymous requests still go to the Access login. `apply.sh` emptied the WAF phase and re-synced 3 members through the new check (same AUD). The owner checked the admin and GrowthBook in a browser. `ADMIN_ALLOWED_IPS` and the 019.3 env backup deleted on the VPS (no rollback to 019.2 from now on without restoring that line).

**Checkpoint**: admin and GrowthBook reachable only after the code step; origin refuses anything else; no address list left.

---

## Phase 5: User Story 3 - Adding, removing and recovering a member (Priority: P2)

**Goal**: Administrator reset of a member's second factor; drift warning; written, drilled emergency procedure.

**Independent Test**: quickstart V5, V6, V7.

### Tests for User Story 3

- [x] T038 [P] [US3] Endpoint tests in `apps/cms/tests/reset-totp.test.ts`: Editor `403`, self `400`, unknown `404`, Administrator with verified session `204` — secret and lockout cleared, `totp-reset` logged with the caller as actor
- [x] T039 [P] [US3] Unit tests in `apps/cms/tests/edge-drift.test.ts` for the drift computation (data-model.md: `toAdd = activeMemberEmails − emails`, `toRemove = emails − activeMemberEmails`, case-insensitive; never-synced case)

### Implementation for User Story 3

- [x] T040 [US3] Create `apps/cms/src/endpoints/resetTotp.ts` (`POST /api/users/:id/reset-totp`) per contracts/cms-endpoints.md
- [x] T041 [P] [US3] Create `apps/cms/src/components/ResetTotpButton.tsx` on the member edit view (Administrators, not on own account) with the French confirmation, success and error states
  - *2026-10-16*: `ResetTotpButton.client.tsx`, a sidebar `ui` field on Users; e2e `admin-members.spec.ts` covers it (confirmation text, toast, `totp-reset` logged, absent on one's own account).
- [x] T042 [P] [US3] Create the drift computation and `apps/cms/src/components/EdgeDriftBanner.tsx` (Administrators, every admin page; the two French messages of the contract)
  - *2026-10-16*: drift in `src/lib/edge-access.ts`, banner in the admin `header` slot (every page, Administrators with the second factor passed); same e2e spec: names a new member, gone once synced.
- [x] T043 [US3] Runbook (`infra/deploy/README.md`, `README.fr.md`): add a member, remove a member, lost phone, emergency procedure in three means (setup key → redo; `reset-totp.ts` over SSH; `ACCESS_ENABLED=0` then restore), with the rule "after any use of the vault copy, redo the second factor and replace the vault copy"
  - *2026-10-16*: deploy runbook 8.6 (fr/en). Means 3 changed: with the origin check live, deleting the Access app locks everyone out, so the emergency is to add another e-mail address to `trefle-members` by hand, then `--sync-members` (spec FR-010 and quickstart V7 amended).
- [x] T044 [US3] (user snapshot, then `release.sh`) Release; run quickstart V5 and V6 with a test member
  - *2026-10-16*: released as tag `019.4-members`. The owner ran V5 and V6 with a test member, all as expected: banner on add / on deactivation, gone after `--sync-members`; e-mail code received after sync and no longer after removal; reset logged and re-enrolment forced; 5 wrong codes → locked, Force Unlock by the Administrator. Access policy checked back to the 3 members afterwards.
- [ ] T045 [US3] (user, Claude times and records) Emergency drill, quickstart V7: three means, each < 30 min (SC-004), V2 passes afterwards; record times in this file
  - *2026-10-16*: postponed by the owner; steps (on a test Administrator, means 3 as amended) handed over.

**Checkpoint**: the team can grow, shrink and recover without anyone editing configuration by hand.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T046 [P] Amend `.specify/memory/constitution.md` to 2.2.0: Edge bullet ("internal hosts behind Cloudflare Access; the origin verifies the Access token") and the Principle II "Justified so far" list (`payload-totp`, `caddy-jwt`); Sync Impact Report updated
  - *2026-10-16*: 2.3.0 (2.2.0 was taken by 020).
- [x] T047 [P] Legal notice and processing register: Cloudflare as processor of members' e-mail addresses (and sign-in IP and time) for Access (FR-014), together with 017 T059
  - *2026-10-16*: texts ready in `docs/sous-traitant-cloudflare.fr.md` §3 (register line + one sentence for members); publication goes with the legal feature that already holds 017 T059.
- [x] T048 Quickstart V8: 017 regression suite against production with the service token headers and an e2e member with a known setup key; record results
  - *2026-10-16*: targeted, as 017 T028 (the full suite is not safe against production): public hosts 200 (pages served from the edge cache), apex redirect 301, imgproxy image 200, lead form present; real Access token accepted end to end (service token); no A/B test running to sample. Admin specs run locally before merge.
- [x] T049 Tick 017 T025 / V7 as "done by 019" in `specs/017-edge-protection/tasks.md`; update the memory note on the 017/019 state

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → stories.
- **US2 (Phase 3)** first: release step 1 must be live and every member
  enrolled before the edge can depend on the admin being safe.
- **US1 edge (T025–T033)** after US2 is live; **US1 origin (T034–T037)**
  only after V1/V2 pass with Access in place.
- **US3 (Phase 5)** after US1 (the drift banner needs the global and the sync).
- **Polish** last; T046/T047 can be done any time.

### User Story Dependencies

- US2: none beyond Setup/Foundational.
- US1: needs US2 in production (rollout order R10); its code (T025–T032) can
  be written in parallel with US2.
- US3: needs US1's global and endpoints (T027, T028); `reset-totp.ts` (T017)
  already exists from US2.

### Within Each User Story

Tests → configuration/models → endpoints → UI → docs → release → quickstart.

### Parallel Opportunities

- T002, T003 alongside T001.
- US2: T007, T008, T009 together; T011, T014, T019, T020 together.
- US1: T025, T026, T027, T030, T032 together.
- US3: T038, T039, T041, T042 together.

---

## Parallel Example: User Story 1

```text
T025 edge-access endpoint tests      (apps/cms/tests/edge-access.test.ts)
T026 origin JWT check test           (infra/caddy/test-access-jwt.sh)
T027 EdgeAccess global               (apps/cms/src/globals/EdgeAccess.ts)
T030 Access templates                (infra/cloudflare/access/*.json)
T032 Cloudflare README               (infra/cloudflare/README.md)
```

---

## Implementation Strategy

### MVP First

US2 alone (Phases 1–3) is a shippable increment: the admin gets a second
factor, the gap 003 left open on the login side is closed, and nothing can
lock the team out (rollback = one env flag).

### Incremental Delivery

1. Release 1 — US2: two-factor, members enrol.
2. Release 2 — US1 edge: CMS sync endpoints; Access applied by the user.
3. Release 3 — US1 origin: JWT check, address list removed (Caddy recreate).
4. Release 4 — US3: reset button, drift banner, runbook; drill.

---

## Notes

- Claude cannot run Cloudflare writes, VPS shell writes or prod DB reads:
  the (user) tasks get a copy-paste command (explanations as prose, no `#`
  comments inside the block) and Claude verifies with reads.
- Every Caddyfile change ships with a Caddy **recreate** (PR #19).
- Always pass both compose files locally
  (`-f docker-compose.yml -f docker-compose.override.yml`).
