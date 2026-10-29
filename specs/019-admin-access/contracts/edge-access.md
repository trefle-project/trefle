# Contract: Edge identity check and origin verification

**Feature**: 019-admin-access | research R1, R2, R7, R9

## Cloudflare Access (configuration as code, `infra/cloudflare/`)

Applied by `apply.sh` → `access.sh` (account-level API, token with *Access: Apps and
Policies — Edit*, *Access: Service Tokens — Edit* and *Access: Organizations,
Identity Providers, and Groups — Read* for the One-time PIN id). Idempotent:
found by name, updated in place. Templates: `infra/cloudflare/access/`.

**Application** `trefle-internal` (type self-hosted):

| Setting | Value |
|---|---|
| Hostnames | `$CMS_HOSTNAME`, `$GROWTHBOOK_HOSTNAME`, `$GROWTHBOOK_API_HOSTNAME` |
| Session duration | `24h` |
| Login methods | One-time PIN only; instant auth (skip the chooser) |
| Eager redirect cookie | on |
| OPTIONS preflight bypass | on |
| Cookie | `HttpOnly`, `SameSite=Lax`, binding cookie on |

**Policies** (reusable account policies, attached in order; names prefixed
because they are account-wide):

1. `trefle-members` — Allow — include: one `email` rule per address from
   `GET /api/edge-access` (CMS). Empty list → `apply.sh` aborts (never
   applies an empty allow-list).
2. `trefle-automation` — Service Auth — include: service token `trefle-apply`.

**Service token** `trefle-apply`: created once; its client id/secret saved to
`secret.env` as `ACCESS_SERVICE_TOKEN_ID` / `ACCESS_SERVICE_TOKEN_SECRET`
(shown only at creation — `apply.sh` stops and prints the save instruction).
Duration one year; renewal in `infra/cloudflare/README.md`.

**Switches**: `ACCESS_ENABLED=0` → the application is deleted (rollback,
R10 step 2). `apply.sh --sync-members` runs only `access.sh` (service token,
member sync, policies, application). Eager redirect cookie: Cloudflare's
default for new applications (on), not set by the template.

**Sync sequence**:

```text
apply.sh ──GET /api/edge-access (X-Edge-Sync-Secret + service token)──► CMS
         ◄── {"emails":[…]}
         ──PUT policy members (include = emails)──► Cloudflare API
         ──POST /api/edge-access/synced {"emails":[…]} ──► CMS
```

## Origin verification (Caddy)

Snippet imported by the three internal sites, replacing
`@notAllowed not client_ip {$ADMIN_ALLOWED_IPS}`:

```caddyfile
(access_jwt) {
	route {
		jwtauth {
			from_header Cf-Access-Jwt-Assertion
			jwk_url {$ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs
			issuer_whitelist {$ACCESS_TEAM_DOMAIN}
			audience_whitelist {$ACCESS_AUD}
			user_claims email common_name
		}
	}
}
```

(Final syntax checked against the module's docs during implementation; the
behaviour below is the contract.)

| Request to an internal host | Origin answer |
|---|---|
| No `Cf-Access-Jwt-Assertion` | `401`/`403`, nothing proxied |
| Token signed by another key / other team | refused |
| Token for another application (wrong `aud`) | refused |
| Expired token | refused |
| Valid token, key set rotated since start | accepted after one key-set refresh |
| Valid member or service-token token | proxied as today |

`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` unset → Caddy refuses to start
(`:?` in compose), so the check cannot silently compile away (the 003
lesson recorded in `docker-compose.prod.yml`).

## Removed (R9)

`ADMIN_ALLOWED_IPS` (all files), `{{ADMIN_IPS}}` substitution, WAF rule
"Internal hosts: allowed addresses only". The load-test skip rule stays.
