# Cloudflare configuration (017-edge-protection)

Cloudflare sits in front of every Trefle host: DDoS mitigation, WAF, a
rate limit on the lead form, and edge caching of images and fonts. Page HTML
is **never** cached in lot 1 (it carries a per-request CSP nonce, a form
token and A/B cookies). The origin (VPS) answers only Cloudflare, acting for
our zone.

Contracts: `specs/017-edge-protection/contracts/edge-config.md` (what
Cloudflare does) and `origin-access.md` (what the origin accepts). Decisions:
`specs/017-edge-protection/research.md` R1–R20.

## Layout

| File | What |
|---|---|
| `settings.json` | Zone settings: SSL Full (strict), TLS ≥ 1.2, Always HTTPS, and everything that rewrites HTML/JS **off** (Rocket Loader, Email Obfuscation, Automatic HTTPS Rewrites, Polish, Bot Fight Mode). |
| `rules/cache.json` | Cache Rules: pages bypass (except `/_next/static/`), images cached with Vary `Accept` (WebP / original), assets cached on origin TTL. |
| `rules/waf-custom.json` | Optional load-test skip rule (the internal hosts' address rule was removed by 019: Cloudflare Access instead). |
| `rules/ratelimit.json` | `POST /api/leads`: 5 per 10 s per address, then blocked 10 s. |
| `apply.sh` | Applies the three above. Idempotent; `--dry-run` prints what it would send. Each `rules/*.json` replaces its whole phase. |
| `aop-cert.sh` | Our own Authenticated Origin Pulls CA + client certificate; uploads it and enables zone-level AOP. `--renew` before expiry (2 years). |
| `refresh-ips.sh` | Cloudflare's address ranges → `infra/deploy/cloudflare-ips.caddy` (Caddy trusts `CF-Connecting-IP` only from them) + the list for the Hostinger firewall. |
| `origin-firewall.sh` | The Hostinger VPS firewall (Hostinger API): 22/tcp open, 443/tcp only from Cloudflare's ranges, everything else dropped. Idempotent; `--dry-run`. Re-run whenever `refresh-ips.sh` changes the list. |
| `add-client-domain.sh` | A client `www.` host through Cloudflare for SaaS; prints the two records the client adds and the registrar forwarding. |
| `purge-media.sh` | Image take-down: purge an asset key by URL and the image host by hostname. |
| `access/application.json`, `access/policies.json` | 019: the Cloudflare Access application over the internal hosts and its two policies (members, automation). |
| `access.sh` | 019: applies them and syncs the member list from the CMS. Run by `apply.sh`, or alone with `apply.sh --sync-members`. |
| `lib.sh` | Shared helpers (value lookup, API calls). |
| `secret.env` | **git-crypt**. Production values for these scripts (copy `secret.env.example`). |
| `secret-aop-*` | **git-crypt**. AOP CA key and client certificate/key, written by `aop-cert.sh`. |

## Tokens and values

| Name | Where | Scope |
|---|---|---|
| `CLOUDFLARE_ZONE_ID` | `secret.env` | the `example.com` zone |
| `CLOUDFLARE_API_TOKEN` (`trefle-config`) | `secret.env` — **never on the VPS** | this zone: Zone Settings, Zone WAF, Cache Rules, Config Rules, Bot Management, SSL and Certificates, Cache Purge — Edit. The account (019): Access: Apps and Policies, Access: Service Tokens — Edit; Access: Organizations, Identity Providers, and Groups — Read |
| `CLOUDFLARE_DNS_TOKEN` | VPS `infra/.env` (Caddy) | this zone only: Zone → Read, DNS → Edit — nothing else |
| `CLOUDFLARE_ACCOUNT_ID` | `secret.env` | the account (020 edge Worker) |
| `CLOUDFLARE_WORKERS_TOKEN` | `secret.env` — **never on the VPS** | Account → Workers Scripts Edit, Queues Edit, Account Analytics Read; this zone → Workers Routes Edit |
| `CLOUDFLARE_PURGE_TOKEN` | VPS `infra/.env` (renderer) | this zone only: Cache Purge — nothing else |
| `EDGE_SECRET` | VPS `infra/.env` (renderer) **and** Worker secret | `openssl rand -hex 32`; same value in both |
| `ACME_DELEGATE_HOSTNAME` | both | `acme-delegate.example.com` |
| hostnames | both | keep identical |
| `ACCESS_TEAM_DOMAIN` | `secret.env` (019 step 3: also VPS `infra/.env`) | `https://your-team.cloudflareaccess.com` |
| `ACCESS_SERVICE_TOKEN_ID`, `ACCESS_SERVICE_TOKEN_SECRET` | `secret.env` — **never on the VPS** | the `trefle-apply` service token, printed once by `access.sh` |
| `EDGE_SYNC_SECRET` | `secret.env` **and** VPS `infra/.env` (cms) | `openssl rand -hex 32`; same value in both |
| `ACCESS_ENABLED` | `secret.env` or the command line | `0` deletes the Access application (rollback); unset = applied |

Scripts read each value from the environment, then `secret.env`, then
`infra/.env`. They need `bash`, `curl`, `jq`, `openssl`.

### Edge Worker first set-up (020, once, account owner)

1. Dashboard → Workers & Pages → Plans → **Workers Paid** ($5/month).
2. From `apps/edge`, with the variables below exported:
   `npx wrangler queues create trefle-exposures` and
   `npx wrangler queues create trefle-exposures-dlq`.
3. Set the four secrets below.

Nothing reaches the Worker until its routes are applied: `wrangler.jsonc`
has none on purpose (research R13).

### Edge test host (020)

`EDGE_TEST_HOSTNAME` (`edge-check.example.com`) is where page
caching is tried first (`EDGE_ROUTES=test`), so real hosts keep the origin's
legacy mode until go-live. It needs:

- DNS: `edge-check` A/AAAA **proxied**, same target as the apex; and
  `_acme-challenge.edge-check` CNAME `acme-delegate.example.com`,
  **DNS only**, so Caddy's DNS-01 issues its certificate (017 R3);
- the VPS `infra/.env`: the host appended to `WEB_HOSTNAMES`, then a deploy
  (Caddy is recreated with the new host list);
- the CMS: an active domain record for the host, with a copy of `/loadtest`
  published on it;
- a check: `curl -I https://edge-check.example.com/loadtest` → 200.

### Edge Worker secrets (020)

Rotating a shared secret means changing it on the Worker **and** the VPS:
- `EDGE_SECRET`: until both match again, the origin ignores the Worker's
  requests and renders them in legacy mode (pages work, nothing is cached),
  and the view batches are refused (re-sent for 10 minutes, so change both
  within that window).
- `FORM_TOKEN_SECRET`: forms opened before the change fail once with « page
  expirée » and work after a reload.


The Worker (`apps/edge`, name `trefle-edge`) holds four secrets, set once from
`apps/edge` with the Workers token, and again whenever a value rotates:

```sh
export CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=<CLOUDFLARE_WORKERS_TOKEN>
npx wrangler secret put EDGE_SECRET
npx wrangler secret put FORM_TOKEN_SECRET
npx wrangler secret put CF_ANALYTICS_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
```

- `EDGE_SECRET` — the VPS `infra/.env` value (rotate both together).
- `FORM_TOKEN_SECRET` — the VPS `infra/.env` value: the Worker signs lead-form
  tokens the renderer verifies.
- `CF_ANALYTICS_TOKEN` — a token with Account Analytics Read only (the
  per-minute view count query).
- `CF_ACCOUNT_ID` — the account id.

## Cloudflare Access on the internal hosts (019-admin-access)

The admin (`CMS_HOSTNAME`) and GrowthBook (`GROWTHBOOK_HOSTNAME`,
`GROWTHBOOK_API_HOSTNAME`) sit behind one Access application,
`trefle-internal`. Before any page, Cloudflare asks for an e-mail address and
sends a one-time code to it, and only to the CMS's active members. The session
lasts 24 h per browser. The admin's own password and authenticator-app code
come after that (deploy runbook, step 8).

**Once, account owner**: Zero Trust organisation `your-team` (Free plan),
the **One-time PIN** login method (Zero Trust → Integrations → Identity
providers), and the account permissions of `trefle-config` above.

**First run**, after the release that adds `/api/edge-access` and with
`EDGE_SYNC_SECRET` identical in `secret.env` and the VPS `infra/.env`:

```bash
infra/cloudflare/apply.sh --sync-members
```

1. It creates the `trefle-apply` service token, prints its two values and
   stops: Cloudflare never shows the secret again. Paste them into
   `secret.env` as printed.
2. Run the same command again. It reads the active members from the CMS
   (refusing an empty list), applies the two policies and the application,
   prints the application's **AUD tag**, and reports the list back to the CMS.
3. Keep the AUD tag: Caddy's origin check needs it (`ACCESS_AUD` in the
   VPS `infra/.env`, 019 step 3).

**After adding, deactivating or removing a member**: run
`apply.sh --sync-members` again. Until then, a new member is stopped at the
code step, and a removed member still gets past it (though their admin login is
refused anyway).

**Origin check (019 step 3)**: Caddy refuses any request to the internal hosts
without a valid Access token for this application (`401`). So, from then on:

- **Rollback** is first the release: `release.sh --rollback 019.2-edge-access`
  on the VPS (Caddy back without the check). Only then, if Access itself must
  go, `ACCESS_ENABLED=0 infra/cloudflare/apply.sh --sync-members` (deletes the
  application). Deleting it first leaves the admin unreachable.
- **Re-creating the application** (after a deletion) gives it a **new AUD
  tag**: put the new value in the VPS `infra/.env` (`ACCESS_AUD`) and recreate
  Caddy, or every request is refused.

**The service token expires after a year** (`access.sh` prints the date at
every run). To renew it: delete `trefle-apply` in Zero Trust → Access controls
→ Service credentials, then run `--sync-members` twice as on the first run.

## Switch order (research R18)

Every step has an undo; do them in order, checking each with
`specs/017-edge-protection/quickstart.md`.

1. **Code first** — unique media keys and the alias map are live (US4).
2. **Zone import** (tasks T010–T011) — add the zone in Cloudflare (Free, full
   setup), copy every record below with the proxy **off** (grey cloud),
   compare with `dig` (quickstart V1), then switch the nameservers at
   GoDaddy. Mail is the thing to protect.
3. **Configuration** — `apply.sh`, then `aop-cert.sh` (commit its outputs);
   `_acme-challenge.<host> CNAME acme-delegate.example.com`
   (DNS-only) for every Trefle host — `acme-delegate` itself needs no record:
   Caddy creates its TXT for each challenge and removes it after; a proxied
   `cf-check` host to rehearse on.
4. **Origin issuance by DNS-01** (T017) — on the VPS set `CLOUDFLARE_DNS_TOKEN`
   and `ACME_DELEGATE_HOSTNAME`, make every site `import origin_tls`, deploy.
   Traffic is still direct: only how certificates are obtained changes.
   Caddy refuses to start if the token is missing or malformed.
5. **Proxy** (T019) — turn every Trefle record orange; check each host.
6. **Require AOP** (T020) — only once **every** host is proxied, switch the
   sites to `import origin_tls_aop` and deploy. Enabled while any host is
   still direct, it refuses every visitor of that host.
7. **Firewall** (T021) — Hostinger panel: 443/tcp from the ranges printed by
   `refresh-ips.sh` only, 80/tcp closed, 22/tcp unchanged — for IPv4 **and
   IPv6** (the hosts have AAAA records). Not `ufw`: Docker-published ports
   bypass it.
8. Later: client domains (`add-client-domain.sh`), new VPS address.

**Rollback** (< 15 min): records back to DNS-only, sites back to
`origin_tls` (or no snippet), firewall open. See `infra/deploy/README.md`.

## Zone import checklist (`example.com`)

Read from public DNS on 2026-10-10 — re-check with `dig` on the day, and
export the zone from GoDaddy (DNS → Export) to catch anything not listed.

| Name | Type | Value | Proxy at import |
|---|---|---|---|
| `@` | A | `203.0.113.10` | off |
| `@` | AAAA | `2001:db8::10` | off |
| `www`, `admin`, `img`, `assets` | A + AAAA | same as `@` | off |
| `experiments`, `experiments-api` | A | `203.0.113.10` | off |
| `@` | TXT | `brevo-code:<value>` | — |
| `email` | TXT | `brevo-code:<value>` | — |
| `brevo1._domainkey` | CNAME | `b1.example-com.dkim.brevo.com` | **off, always** |
| `brevo2._domainkey` | CNAME | `b2.example-com.dkim.brevo.com` | **off, always** |
| `mail` | CNAME | `mail-example-com.brand.brevosend.com` | **off, always** |
| `img.mail` | CNAME | `mail-example-com.img.brand.brevosend.com` | **off, always** |
| `r.mail` | CNAME | `mail-example-com.r.brand.brevosend.com` | **off, always** |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc@example.com;` | — |

No MX record and no SPF record exist today (Brevo authenticates with DKIM
and its own return path). Mail-related records are never proxied.

After the nameserver switch: send a test opt-in email (V1) — delivered, DKIM
`pass` for `example.com`.

## Cloudflare for SaaS (client domains)

Enabled on this zone 2026-10-10 (SSL/TLS → Custom Hostnames). Records added
for it, all **proxied**:

| Name | Type | Value | Role |
|---|---|---|---|
| `saas-origin` | A + AAAA | `203.0.113.10` / `2001:db8::10` | Fallback origin: custom hostnames are sent here (the VPS) |
| `sites` | CNAME | `saas-origin.example.com` | `SAAS_CNAME_TARGET`: what a client's `www` CNAMEs to |

Each client `www.` host is then a custom hostname (`add-client-domain.sh`).
When the VPS address changes, update `saas-origin` with the other proxied records.

## Routine operations

- **Cloudflare ranges changed** (a few times a year): `refresh-ips.sh`, commit
  `infra/deploy/cloudflare-ips.caddy`, deploy (Caddy reloads), update the
  Hostinger firewall from the printed list.
- **Member added, deactivated or removed**: `apply.sh --sync-members`
  (« Cloudflare Access » above).
- **AOP certificate**: `aop-cert.sh --renew` before it expires (date printed
  at issue), commit, delete the old certificate it lists.
- **Load test**: `LOADTEST_IP=<k6 machine> apply.sh`, run, then `apply.sh`
  again without it (`infra/loadtest/README.md`).
- **Take an image down**: `purge-media.sh` (its `--help` explains both cases).
- **Cached pages look stale** (020): `purge-pages.sh` (every page) or
  `purge-pages.sh domain:<id>`. Publishing and releases purge on their own;
  this is for a purge that failed (the renderer logs `edge purge failed`).
- **Switch page caching off / on** (020): `edge-off.sh` removes every route to
  the Worker (exclusions kept) — the origin serves everything as before, at
  once; `edge-on.sh [live|test]` puts them back. See `infra/deploy/README.md`
  §7.6.
- **Edge Worker routes** (020): `worker-routes.sh test|live|off|cut` sets only
  the routes of `worker-routes.json` (`test` = the test host only, `live` =
  every page host, `off` = none, `cut` = what `edge-off.sh` does);
  `--dry-run` prints them. `EDGE_ROUTES=… apply.sh` does the same after the
  zone settings and rules; without `EDGE_ROUTES` the routes are left alone.
- **Move to Pro** (~20 $/month): when an attack gets through the Free managed
  rules, or one rate-limiting rule is not enough (see `infra/deploy/README.md`).
