# Quickstart: verifying admin access (019)

**Feature**: 019-admin-access | Replaces 017 V7.

`ADMIN` = `https://$CMS_HOSTNAME`, `GB` / `GBAPI` = the GrowthBook hosts,
`CF_IP` = a Cloudflare address (e.g. `188.114.96.2`), `VPS_IP` = the origin.
Always force the path with `curl --resolve` (the Mac's DNS cache may lie —
017 lesson).

## V0 — Local, plugin on

1. `TOTP_DISABLED` unset, stack up with both compose files
   (`-f docker-compose.yml -f docker-compose.override.yml`).
2. Log in as a seeded member → redirected to the setup page, hint visible;
   enrol with an authenticator app; log out; log in → code asked; wrong code
   refused; right code → dashboard.
3. `curl` a custom endpoint (e.g. leads export) with a password-only JWT →
   `403`; with the API key → unchanged.
4. Unit tests and `admin-totp.spec.ts` green; the rest of the e2e suite green
   with `TOTP_DISABLED=1`.

## V1 — Edge: authorised member (SC-001)

From a network never used (phone connection), open `ADMIN` → Cloudflare page
asks for an e-mail → code received < 1 min → admin login page. Time it
(< 2 min). Open `GB` → no new code (same Access session); GrowthBook loads
its data (API host reached — eager cookie + preflight bypass work).

## V2 — Edge: unauthorised (SC-002)

1. Unknown address on the Cloudflare page → no code delivered; `ADMIN`,
   `GB`, `GBAPI` stay on the Cloudflare page.
2. `curl -s -o /dev/null -w '%{http_code}' --resolve $CMS_HOSTNAME:443:$CF_IP https://$CMS_HOSTNAME/admin`
   → `302` to `*.cloudflareaccess.com`, never Payload HTML. Same for the two
   GrowthBook hosts and `/api/users/login`. ≥ 20 attempts in total, 0 served.

## V3 — Origin refuses without the Access token (FR-003)

- `--resolve …:$VPS_IP` → timeout (017 firewall, unchanged).
- From the VPS itself (user runs, Claude cannot):
  `curl -sk --cert … --key … --resolve $CMS_HOSTNAME:443:127.0.0.1 https://$CMS_HOSTNAME/admin`
  with the AOP client certificate but **no** `Cf-Access-Jwt-Assertion` →
  refused; with a forged token → refused.

## V4 — Two-factor in production (SC-003)

Each member: next login → forced enrolment, setup key saved in the password
manager. After one week: activity log shows `totp-enrolled` for every human
member. A login with password only reaches no admin screen.

## V5 — Add / remove a member (SC-005)

1. Admin adds a test member → drift banner names the address.
2. User runs `infra/cloudflare/apply.sh --sync-members` → banner gone within
   one page load; the test address receives a code within 5 min.
3. Deactivate the member → login refused at once; banner names the address
   to remove; after `--sync-members`, no code delivered.

## V6 — Reset and lockout

Administrator resets the test member's second factor → confirmation, log
`totp-reset`; member must re-enrol. Five wrong codes → locked; Force Unlock
only offered to Administrators.

## V7 — Emergency drill (SC-004)

Timed, on the test member made Administrator: (1) restore from the setup key
in the password manager, then redo the second factor and replace the vault
copy (the old key must then be refused); (2) `reset-totp.ts` over SSH; (3) another e-mail
address of the Administrator added by hand to the `trefle-members` policy in the
dashboard, used to sign in, then removed by `apply.sh --sync-members`
(amended 2026-10-16: with the origin check live, `ACCESS_ENABLED=0` locks
everyone out). Each < 30 min; afterwards V2
passes again (nothing left open).

## V8 — Regression (SC-006)

017 V8 suite against production: published pages, lead form, A/B unchanged.
Admin-driving specs need the service token headers and an e2e member with a
known setup key.

## Rollback per step (R10)

| Step | Undo |
|---|---|
| 1 Two-factor | `TOTP_DISABLED=1` in VPS `infra/.env`, recreate `cms` (preflight must allow it explicitly with `ALLOW_TOTP_DISABLED=1`) |
| 2 Access | `ACCESS_ENABLED=0 infra/cloudflare/apply.sh` |
| 3 Origin check | `release.sh` previous tag + Caddy recreate |
