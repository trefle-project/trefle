# Implementation Plan: Edge protection & media caching (lot 1 of 4)

**Branch**: `017-edge-protection` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-edge-protection/spec.md`

## Summary

Put Cloudflare (Free plan) in front of every Trefle host, make the VPS
reachable only through it, and serve images and fonts from the edge — without
caching page HTML, so A/B testing, the nonce CSP, the form token and view
counting are untouched. Technical approach (details in [research.md](research.md)):

- **Edge**: `example.com` zone moved to Cloudflare; client domains
  as Cloudflare for SaaS custom hostnames on `www.`, root forwarded at the
  registrar (R1, R2, R17).
- **Origin**: Full (strict) with Caddy-issued certificates via ACME DNS-01 and
  CNAME delegation (custom Caddy build with `caddy-dns/cloudflare`); zone-level
  Authenticated Origin Pulls with our own certificate; Hostinger firewall
  limited to Cloudflare ranges; new IP last (R3, R4).
- **No regression**: real visitor IP from `CF-Connecting-IP` via Caddy
  `trusted_proxies`; admin/GrowthBook restriction at the edge and in Caddy;
  HTML explicitly bypassed; HTML/JS-rewriting features off (R5–R8, R14).
- **Media**: image host cached with a `Vary: Accept` rule (WebP / not); asset
  host `immutable`; **media and font keys made unique at upload** and replaced
  media resolved through an alias map — this also fixes an existing defect
  where replacing a media file breaks the pages using it (R9–R12).
- **Usage warning** (added after planning): the media edit view lists the
  pages and domains using the image, and saving a new file over a used image
  asks for confirmation with that list (R21); deleting a used image is
  refused (R22).
- **Operations**: Cloudflare config as code (`infra/cloudflare/`), k6 load
  test baseline, guides EN/FR, constitution amended to 2.1.0 (R15, R16, R18,
  R20).

## Technical Context

**Language/Version**: TypeScript (strict) on Node.js — Next.js 16.3.4
renderer, Payload 3.88.0 CMS; bash for infra scripts; Caddyfile.

**Primary Dependencies**: existing stack (Next.js, Payload + storage-s3,
GrapesJS, PostgreSQL, Garage, imgproxy 3.27, Caddy 2). **Added**: Cloudflare
(service, Free plan + Cloudflare for SaaS); Caddy module
`github.com/caddy-dns/cloudflare` via a custom `xcaddy` image. Dev tools only:
`jq`, `curl`, k6 (container).

**Storage**: PostgreSQL — one new hidden field on `media`
(`previousFilenames`), via a Payload migration (expand only). Garage keys
unchanged for existing objects.

**Testing**: Vitest unit tests (renderer `apps/web/tests`, CMS
`apps/cms/tests`); Playwright e2e (`apps/web/tests/e2e`) re-run against the
switched environment (SC-002); quickstart scenarios for the edge/origin
behaviour (curl-level checks); k6 for SC-006.

**Target Platform**: Hostinger KVM VPS (Debian, Docker Compose) behind
Cloudflare.

**Project Type**: web — monorepo `apps/web` (renderer), `apps/cms` (Payload),
`packages/shared`, `infra/`.

**Performance Goals**: programme target 1,000 page views/s sustained, peaks
10,000/s (acceptance at lot 3). Lot 1: no page-view regression vs baseline;
≥ 95% of image/font requests served at the edge after warm-up (SC-004).

**Constraints**: page HTML stays `no-store` (FR-009); Cloudflare Free limits
(100 MB request body, ~100 s proxy timeout, 1 rate-limiting rule, 5 custom WAF
rules); origin certificates verified end to end (FR-004); every step
reversible within 15 min (SC-007).

**Scale/Scope**: 2 existing domains (1 Trefle-owned, 1 client), ≤ 100 client
hostnames before any per-hostname cost; ~22 Cloudflare IP ranges.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / section | Status | Notes |
|---|---|---|
| I. Simplicity First | Pass | Static IP snippet over an auto-refresh module; bash+JSON over Terraform; unique keys + alias map over versioned URLs or HTML rewriting. |
| II. Stack-Native, Minimal Additions | **Justified** | Two additions beyond the stack: Cloudflare (the stack has no way to absorb attacks or serve from the edge) and the `caddy-dns/cloudflare` module (DNS-01 is the only way to keep Full (strict) for client hostnames — R3). Media changes use Payload hooks/fields/endpoints; renderer changes use the existing tag revalidation. See Complexity Tracking. |
| III. Small, Reversible Changes | Pass | Code ships before any DNS change (R18 step 1) and is a no-op without Cloudflare. Each switch step has a documented undo (grey cloud, previous Caddyfile, firewall). Migration is expand-only with a down path. |
| IV. Working Software Over Ceremony | Pass (planned) | Tests required for: filename uniqueness hook, `previousFilenames` hook, alias endpoint (chains, deleted media), renderer alias rewrite (img, CSS url, href), media → `media-aliases` revalidation. Existing e2e suites are the regression gate. |
| V. Quality the User Feels | Pass | Published pages unchanged; Penpot import limit message stays intelligible at 95 MB. The usage panel handles loading, empty (« utilisée nulle part ») and error states; French copy for editors. |
| Architecture | **Amend** | Adds an edge layer; "SSR with ISR" unchanged in lot 1. Constitution 2.0.0 → 2.1.0 in this feature. |
| Secrets & configuration | Pass | `CLOUDFLARE_*` tokens in `infra/.env` (git-crypt), keys listed in `infra/.env.example`; least-privilege tokens (R15). |
| Performance budget | Pass | No client JS added. |

**Post-design re-check (after Phase 1)**: unchanged — the contracts add one
read-only CMS endpoint and no page-side code; the custom Caddy image and
Cloudflare remain the only additions.

## Project Structure

### Documentation (this feature)

```text
specs/017-edge-protection/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R20
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — validation scenarios V1–V12
├── contracts/
│   ├── media-aliases.md # CMS → renderer alias endpoint
│   ├── media-usage.md   # admin usage lookup + replace confirmation
│   ├── edge-config.md   # what Cloudflare does (and must not do) per host
│   └── origin-access.md # what the origin accepts and trusts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
apps/cms/src/
├── collections/Media.ts            # + previousFilenames (hidden), hooks wired
├── collections/Fonts.ts            # + unique-key hook
├── hooks/media-unique-key.ts       # NEW beforeOperation: <base>-<hash8>.<ext> (media, fonts)
├── hooks/media-aliases.ts          # NEW beforeChange (record old filename) + afterChange/afterDelete (revalidate media-aliases)
├── endpoints/mediaAliases.ts       # NEW GET /api/media/aliases
├── endpoints/mediaUsage.ts         # NEW GET /api/media/:id/usage
├── lib/media-usage.ts              # NEW find pages/domains using a media item (shared by endpoint + tests)
├── components/MediaUsage.client.tsx       # NEW « Utilisée dans : » panel (beforeDocumentControls on Media)
├── components/MediaReplaceConfirm.client.tsx  # NEW save-time confirmation when the file changed and usage > 0
├── hooks/media-delete-guard.ts     # NEW beforeDelete: refuse when used (context bypass for import cleanups)
├── jobs/pageImport.ts / jobs/siteImport.ts  # pass context.allowUsedMediaDelete in their cleanups
├── endpoints/siteImportAnalyse.ts  # MAX_PENPOT_FILE_BYTES → 95 MB
├── components/SiteImportWizard.client.tsx  # same cap client-side
└── migrations/<ts>_media_previous_filenames.ts  # NEW (expand)

apps/cms/tests/
├── media-unique-key.test.ts        # NEW
├── media-aliases.test.ts           # NEW (hook + endpoint)
├── media-usage.test.ts             # NEW (current + previous keys, CSS url, ogImage, domain default, no false positives)
└── media-delete-guard.test.ts      # NEW (used → 409, unused → deleted, bulk mixed, cleanup bypass)

apps/web/src/lib/
├── imgproxy.ts                     # apply alias map; + rewriteAssetLinks (href)
├── media-aliases.ts                # NEW cached fetch (tag media-aliases)
└── payload-client/index.ts         # export the alias fetch
apps/web/src/components/page-shell.tsx  # pass aliases into the rewrites
apps/web/tests/
├── imgproxy.test.ts / imgproxy-background.test.ts  # + alias cases
└── asset-links.test.ts             # NEW

infra/
├── caddy/Dockerfile                # NEW xcaddy + caddy-dns/cloudflare
├── deploy/Caddyfile                # trusted_proxies, client_ip, DNS-01, AOP client_auth, assets Cache-Control
├── deploy/cloudflare-ips.caddy     # NEW generated snippet
├── docker-compose.prod.yml         # caddy image → infra/caddy build; CLOUDFLARE_DNS_TOKEN; AOP CA mount
├── .env.example                    # CLOUDFLARE_* keys documented
├── cloudflare/                     # NEW config as code
│   ├── README.md
│   ├── apply.sh                    # idempotent: settings, rulesets, IP list
│   ├── settings.json               # zone settings (features on/off, SSL strict, TLS min)
│   ├── rules/*.json                # cache, waf-custom, ratelimit rulesets
│   ├── refresh-ips.sh              # CF ranges → cloudflare-ips.caddy + firewall list
│   ├── aop-cert.sh                 # generate + upload zone AOP certificate
│   ├── add-client-domain.sh        # custom hostname + records to give the client
│   └── purge-media.sh              # take-down purge
├── loadtest/                       # NEW k6 scenarios + README
└── deploy/README.md / README.fr.md # switch, rollback, onboarding, take-down, Pro trigger

.specify/memory/constitution.md     # 2.1.0: Architecture "Edge" bullet
```

**Structure Decision**: existing monorepo layout; CMS changes follow the
`hooks/` + `endpoints/` pattern, renderer changes stay inside `lib/imgproxy.ts`
and the payload client, infra additions live under `infra/` next to the
existing deploy assets.

## Implementation phases (input for /speckit-tasks)

1. **Code, no Cloudflare needed** (deployable now; P2 stories US3/US4):
   unique keys, `previousFilenames` + migration, alias endpoint, renderer
   alias rewrite + `href` rewrite, usage panel + replace confirmation +
   delete guard (R21, R22), asset `Cache-Control`, Penpot 95 MB cap, custom
   Caddy image (issuance unchanged until step 4).
2. **Cloudflare preparation**: zone import (DNS-only), `infra/cloudflare/`
   config + apply, AOP certificate, DNS-01 delegation records, k6 baseline.
3. **Switch Trefle hosts** (US1/US2): proxied, Caddyfile with DNS-01 +
   `trusted_proxies` + AOP, Hostinger firewall; full e2e + quickstart.
4. **Client domain** (US5): custom hostname, `www.` move, registrar forwarding.
5. **New IP**, k6 after-run, guides, constitution amendment, legal notices.

## Risks

| Risk | Mitigation |
|---|---|
| Registrar forwarding drops path/query → old opt-in/unsubscribe links break | V9 before switching the client; fallback: that client's zone into our account. |
| DNS-01 delegation not honoured for a host | V3 on `cf-check` first; emergency fallback Full (non-strict) via Configuration Rule for that host only, logged as a temporary exception. |
| Hostinger firewall rule limit or behaviour | V2; fallback `DOCKER-USER` iptables chain on the VM. |
| Vary rule serves the wrong format | V5; fallback WebP for everyone. |
| Mail breaks during zone move | Records copied and checked before nameserver change (V1). |
| New IP not obtainable without migration | Last step, does not block lots 2–4; risk recorded. |
| Payload 3.88 has no clean slot to intercept the save of an upload | Confirm the slot (custom `SaveButton`) early in US4; fallback: the panel turns into a blocking notice with an « J'ai compris » checkbox required before save (same information, same moment). |
| A take-down of a used image is blocked by FR-022 | Take-down replaces the file instead (R12), then purges the old keys. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Cloudflare as an external runtime layer (Principle II, Architecture) | Spec requires attack resistance and edge delivery; nothing in the stack can absorb a flood before it reaches the single VPS | Bunny/CDN-only: no L7 protection; origin hardening alone: VPS bandwidth/CPU is the limit |
| Custom Caddy build with `caddy-dns/cloudflare` (Principle II) | Full (strict) for client `www.` hosts needs origin certificates for names outside our zone; DNS-01 with delegation is the only robust issuance path behind the proxy | Origin CA: our zone only; HTTP-01 via proxy: fragile with SaaS DCV and keeps port 80 open; Full non-strict: origin not verified (FR-004) |
