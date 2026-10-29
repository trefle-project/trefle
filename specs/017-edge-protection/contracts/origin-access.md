# Contract: origin access (VPS / Caddy)

What the origin accepts and which request data it trusts once behind
Cloudflare. Decisions: research R3–R5, R10.

## Network

| Port | Allowed from | Enforced by |
|---|---|---|
| 443/tcp | Cloudflare IPv4/IPv6 ranges only | Hostinger VPS firewall (outside the VM) |
| 80/tcp | nobody | Hostinger VPS firewall |
| 22/tcp | unchanged | unchanged |

Docker-published ports bypass `ufw`, so `ufw` alone does not satisfy this
contract. Ranges come from `infra/cloudflare/refresh-ips.sh`.

## TLS

- Every site requires and verifies a **client certificate** issued by our AOP
  CA (`client_auth require_and_verify`). A TLS handshake without it fails —
  this is what makes a request from another Cloudflare account, or a direct
  request, fail even if the firewall were open.
- Server certificates: Let's Encrypt via ACME **DNS-01**, TXT written at
  `acme-delegate.example.com` (`dns_challenge_override_domain`);
  each served host has `_acme-challenge.<host> CNAME acme-delegate.…`.
  Valid for the exact hostname Cloudflare sends as SNI (custom hostname for
  client sites).

## Trusted request data

| Data | Trusted from | Used by |
|---|---|---|
| Visitor IP | `CF-Connecting-IP`, **only** when the TCP peer is in the Cloudflare ranges (`trusted_proxies` + `trusted_proxies_strict`) → Caddy `{client_ip}` | `X-Real-IP` sent upstream (`header_up X-Real-IP {client_ip}`) → `apps/web/src/app/api/leads/route.ts` rate limits; `client_ip` matcher for admin/GrowthBook |
| `X-Forwarded-For` | not trusted for identity | — |
| Host | as received (custom hostname for client sites) | renderer domain routing (unchanged) |

## Response headers set at the origin

| Host kind | Header | Value |
|---|---|---|
| all | `Strict-Transport-Security`, `X-Content-Type-Options`, `-Server` | unchanged (`sechdr`) |
| asset | `Cache-Control` | `public, max-age=31536000, immutable` |
| image | `Cache-Control` | from imgproxy (`public, max-age=31536000`), `Vary: Accept` |
| page | `Cache-Control` | from Next (`private, no-store` for HTML; `immutable` for `/_next/static`) |

## Unchanged

- Internal traffic on the Docker network (`cms ↔ web`, `/api/revalidate`,
  imgproxy → Garage, GrowthBook) never leaves the VPS.
- `release.sh` / `preflight.sh` keep using SSH; their public-host checks go
  through Cloudflare like any visitor.
