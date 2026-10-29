# Implementation Plan: Admin access — verified identity at the edge, two-factor login

**Branch**: `019-admin-access` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-admin-access/spec.md`

## Summary

Replace the never-filled address list in front of the admin and GrowthBook by
"who you are", in three layers (details in [research.md](research.md)):

- **Edge**: one Cloudflare Access application over the three internal hosts,
  e-mail one-time code, 24 h session, allow-list = active members; service
  token for automation (R1).
- **Origin**: Caddy verifies Access's signed token on those hosts with the
  `caddy-jwt` module, replacing the address matchers (R2).
- **Admin login**: `payload-totp` with forced enrolment; our own access
  helpers and custom endpoints require the verified second factor (R3, R4).
- **Membership & recovery**: `apply.sh` syncs the Access allow-list from a CMS
  endpoint and reports back; the admin warns while out of step (R7);
  Administrator reset of a member's second factor, SSH emergency reset,
  setup key kept in the password manager (R5, R6).
- **Removal**: `ADMIN_ALLOWED_IPS`, the WAF address rule and the Caddy
  matchers are deleted in the last release (R9). Rollout in 4 undoable steps
  (R10).

## Technical Context

**Language/Version**: TypeScript (strict) — Payload 3.88.0 on Next.js 16.3.4
(`apps/cms`); bash + jq + curl (`infra/cloudflare/`); Caddyfile.

**Primary Dependencies**: existing stack. **Added**: `payload-totp` 3.0.6
(CMS); Caddy module `github.com/ggicci/caddy-jwt` v1.4.0 (custom `xcaddy`
build); Cloudflare Zero Trust Access (Free, ≤ 50 users). Dev only: `otpauth`
for e2e code generation (already a dependency of the plugin).

**Storage**: PostgreSQL — `users.totpSecret` and the `totp_attempts` table
(plugin), a hidden global `edge-access` (synced list + time), new activity-log
types. One Payload migration, expand only, with a down path.

**Testing**: Vitest (`apps/cms/tests`) for access helpers and the new
endpoints; Playwright (`apps/web/tests/e2e`) with one new spec running the
plugin enabled; quickstart curl checks for the edge and origin (V1–V8).

**Target Platform**: Hostinger VPS (Docker Compose) behind Cloudflare.

**Project Type**: web — monorepo (`apps/cms`, `apps/web`, `infra/`).

**Performance Goals**: none new; published pages untouched (SC-006).

**Constraints**: no lockout during rollout (R10); the CMS holds no
Cloudflare credential; Claude cannot run Cloudflare writes, VPS writes or
prod DB reads — those steps are handed to the user as commands.

**Scale/Scope**: 2–3 members; 3 internal hosts; 23 custom endpoints to audit.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / section | Status | Notes |
|---|---|---|
| I. Simplicity First | Pass | Removes the address-list mechanism (env var, WAF rule, 3 Caddy matchers). One access rule in `access/index.ts` instead of per-endpoint checks. Recovery via the setup key (no new code) — R5. No background job for drift. |
| II. Stack-Native, Minimal Additions | **Justified** | Three additions: `payload-totp` (Payload has no second factor; the plugin is Payload-native and version-locked to it), `caddy-jwt` (Caddy cannot verify a JWT; it covers GrowthBook too), Cloudflare Access (already our edge provider). See Complexity Tracking. |
| III. Small, Reversible Changes | Pass | Four releases, each with an undo (R10): env flag, `apply.sh ACCESS_ENABLED=0`, previous tag. Migration expand-only with down path. |
| IV. Working Software Over Ceremony | Pass (planned) | Tests: access helpers (all strategies), `reset-totp`, `edge-access` GET/POST and drift, e2e enrol/login/reset with the plugin on. Endpoint audit recorded in the PR. |
| V. Quality the User Feels | Pass | French copy for the setup hint, reset confirmation, drift banner; error states for wrong code / locked account come from Payload/plugin. |
| Architecture (Edge) | **Amend (PATCH/MINOR)** | Add "internal hosts behind Cloudflare Access; origin verifies the Access token" to the Edge bullet → constitution 2.1.0 → 2.2.0 in this feature. |
| Secrets & configuration | Pass | New secrets `EDGE_SYNC_SECRET`, `ACCESS_SERVICE_TOKEN_*`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` in git-crypt'd files; keys listed in `.env.example` / `secret.env.example`. `TOTP_DISABLED` refused by the release preflight in production. |
| Performance budget | Pass | No published-page change. |

**Post-design re-check (after Phase 1)**: unchanged — contracts add three CMS
endpoints, one CLI script, one hidden global; no published-page code.

## Project Structure

### Documentation (this feature)

```text
specs/019-admin-access/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── edge-access.md      # Access app/policies as code, origin JWT check
│   └── cms-endpoints.md    # edge-access GET/POST, reset-totp, CLI, UI copy
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
apps/cms/
├── src/payload.config.ts          # payloadTotp() last in plugins; jobs.access.run
├── src/proxy.ts                   # NEW — x-pathname for the plugin
├── src/access/index.ts            # human = verified second factor (R4)
├── src/collections/Users.ts       # unlock admin-only; reset button field
├── src/collections/ActivityLog.ts # totp.enrolled / totp.reset / edge.synced
├── src/globals/EdgeAccess.ts      # NEW — hidden synced list
├── src/endpoints/edgeAccess.ts    # NEW — GET list, POST synced
├── src/endpoints/resetTotp.ts     # NEW
├── src/components/EdgeDriftBanner.tsx   # NEW — admin warning
├── src/components/ResetTotpButton.tsx   # NEW
├── src/migrations/2026…_admin_access.ts # NEW
├── scripts/reset-totp.ts          # NEW — SSH emergency reset
└── tests/                         # NEW unit tests
apps/web/tests/e2e/admin-totp.spec.ts    # NEW
infra/caddy/Dockerfile             # + caddy-jwt
infra/deploy/Caddyfile             # access_jwt snippet replaces client_ip matchers
infra/deploy/preflight.sh          # refuse TOTP_DISABLED in prod
infra/docker-compose.prod.yml      # env: remove ADMIN_ALLOWED_IPS, add ACCESS_*, EDGE_SYNC_SECRET
infra/cloudflare/apply.sh          # Access app, policies, service token, member sync
infra/cloudflare/access/*.json     # NEW — app + policy templates
infra/cloudflare/rules/waf-custom.json  # address rule removed
infra/deploy/README(.fr).md, infra/cloudflare/README.md  # runbook: enrol, add/remove member, emergency
.specify/memory/constitution.md    # 2.2.0
```

**Structure Decision**: existing monorepo layout; all CMS changes in
`apps/cms`, edge in `infra/cloudflare`, origin in `infra/deploy` and
`infra/caddy`.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `payload-totp` | FR-005/006: Payload has no second factor | Writing TOTP ourselves = more security code to own |
| `caddy-jwt` module | FR-003: origin must prove the edge check for admin **and** GrowthBook | Check in Payload only misses GrowthBook; Tunnel changes the 017 origin model |
| Cloudflare Access | FR-001/002: identity without addresses | Address list cannot follow changing networks (the reason for this feature) |

## Decisions taken in planning

- **R5** (accepted 2026-10-11): the **setup key in the password manager** is
  the backup of each member's second factor, instead of single-use recovery
  codes (the plugin has none). Spec FR-006/FR-010 amended; the runbook gets
  the two compensating rules.
