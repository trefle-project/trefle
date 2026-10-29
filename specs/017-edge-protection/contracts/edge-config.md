# Contract: edge configuration (Cloudflare)

What Cloudflare does — and must not do — for each kind of Trefle host. The
source of truth is `infra/cloudflare/` (applied by `apply.sh`); this document
is what that configuration must satisfy. Decisions: research R1–R9, R12, R14.

## Zone-wide

| Setting | Value | Why |
|---|---|---|
| Plan | Free (Pro on the documented trigger) | Spec Q3 |
| SSL/TLS mode | Full (strict) | FR-004 |
| Minimum TLS | 1.2 | |
| Always Use HTTPS | on | origin port 80 closed |
| Authenticated Origin Pulls | zone-level, **our own certificate** | FR-002 (account-exclusive) |
| Rocket Loader | **off** | FR-006 / FR-010 |
| Email Address Obfuscation | **off** | FR-006 |
| Automatic HTTPS Rewrites | **off** | rewrites HTML |
| Polish / image optimisation | **off** | imgproxy does it; avoids double processing |
| Bot Fight Mode | **off** (lot 1) | injects scripts; would challenge e2e; revisit lot 3 |
| Free managed WAF ruleset | on | |
| DDoS mitigation (L3/4/7) | on (always, not configurable off) | US1 |
| Cloudflare for SaaS | on; fallback origin `saas-origin.<zone>`; CNAME target `sites.<zone>` | FR-016 |

## Per host kind

| Kind | Hosts | Cache | Access | Notes |
|---|---|---|---|---|
| `page` | `WEB_HOSTNAMES` (incl. `example.com`), client `www.` custom hostnames | **bypass**, except `/_next/static/*` (default caching, origin `immutable`) | public | HTML never cached in lot 1 (FR-009). Cookies (`tf-ab-*`, consent) and `Set-Cookie` pass through untouched. |
| `image` | `IMG_HOSTNAME` | eligible; respect origin TTL; **Vary `Accept`**, action *normalize*, `media_types: ["image/webp"]` | public | exactly two variants per URL (WebP / original) — FR-011 |
| `asset` | `ASSET_HOSTNAME` | eligible; respect origin TTL (`public, max-age=31536000, immutable` from Caddy) | public | keys never reused (contracts/media-aliases.md, R11) |
| `internal` | `CMS_HOSTNAME`, GrowthBook UI + API | default (dynamic, not cached) | WAF custom rule: block unless `ip.src in $trefle_admin` | list generated from `ADMIN_ALLOWED_IPS` — FR-008 |

## Rules

| Phase | Rule | Expression (summary) | Action |
|---|---|---|---|
| cache | page bypass | host is a `page` host and path not starting `/_next/static/` | bypass cache |
| cache | image | host eq `IMG_HOSTNAME` | eligible, origin TTL, Vary Accept (normalize, webp) |
| cache | asset | host eq `ASSET_HOSTNAME` | eligible, origin TTL |
| WAF custom | internal hosts | host in internal hosts and not `ip.src in $trefle_admin` | block |
| rate limiting | lead form | `POST` and path eq `/api/leads`; per IP; 10 s window; > 5 | block 10 s |
| WAF custom (temporary) | load test | `ip.src eq <load-test IP>` | skip rate limiting — only during a k6 run, removed after |

## Must never happen (checked by quickstart)

- A `page`-host HTML response served from cache (`cf-cache-status: HIT`).
- Any change to HTML or `<script>` content between origin and visitor.
- A request reaching the origin without our AOP client certificate.
- An image served in WebP to a client whose `Accept` lacks `image/webp`.

## Purge

- Normal path: none needed (unique keys).
- Take-down (R12): `purge-media.sh <key>` → purge by URL
  `https://ASSET_HOSTNAME/<key>` + purge by hostname `IMG_HOSTNAME`.
