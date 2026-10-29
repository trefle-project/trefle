# Quickstart: validating Edge protection & media caching (017, lot 1)

Validation scenarios, in switch order (research R18). Each one names the
spec item it proves. Commands are run from a machine **outside** the VPS
unless stated. Hostnames below use the production values; `$CF_CHECK` is the
temporary proxied host `cf-check.example.com`.

## Prerequisites

- `infra/.env` decrypted (git-crypt) with `CLOUDFLARE_ZONE_ID`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_DNS_TOKEN`.
- `curl`, `jq`, `dig`, Docker (for k6).
- Admin access to the Hostinger panel and to the client's registrar.

## Before any DNS change

**V0 — Code (US4, FR-013/014), local stack**
1. `docker compose -f docker-compose.yml -f docker-compose.override.yml up`
   (both files — see infra notes), log in to the admin.
2. Upload `photo.jpg` → its filename is `photo-<8 hex>.jpg`.
3. Publish a page using it; replace the media's file with another image →
   new key; `GET /api/media/aliases` (as admin) maps the old key to the new.
4. Reload the page: the new image shows; the page's HTML references the new
   key (inside the imgproxy URL). Same check for a CSS background and a PDF
   link.
5. Usage warning (FR-020/021, SC-009): open the media item → « Utilisée dans
   1 page : » with the page title, domain, « publiée ». Choose a new file and
   save → confirmation « Attention, l'image que vous voulez remplacer est
   utilisée dans ces pages : … »; « Annuler » keeps the old file (reload:
   same filename); « Remplacer partout » proceeds (step 3). An unused image
   is replaced without confirmation; changing only `alt` never asks.
   Delete the used image → refused with « Impossible de supprimer cette
   image : elle est utilisée dans 1 page(s) : … »; select it with an unused
   one in the media list and delete both → only the unused one goes.
6. Unit tests: `npm test` in `apps/cms` and `apps/web` (alias/rename/usage cases).

**V-baseline — Load (SC-006)**: `infra/loadtest/README.md` → run the
`pages`, `images` and `leads` scenarios against production off-peak; keep the
k6 summary JSON in `infra/loadtest/results/<date>-baseline.json`.

## Zone and edge configuration

**V1 — Zone import, mail intact (edge case "email keeps working")**
- `dig +short MX example.com @<cloudflare-ns>` and every TXT
  (SPF, DKIM, DMARC, Brevo) match the GoDaddy values **before** switching
  nameservers. After the switch, send a test opt-in email: delivered, DKIM
  pass.

**V2 — Origin lock-down (US1, FR-002, SC-001)**
- `curl -sk --resolve example.com:443:<VPS IP> https://example.com/`
  → connection refused/timeout (firewall).
- From the VPS itself, without the AOP client cert:
  `curl -sk https://localhost/ -H 'Host: example.com'` → TLS
  handshake failure (client certificate required).
- Through Cloudflare: every Trefle host answers `200`/`302` as before.
- Hostinger firewall shows all Cloudflare ranges (count vs `refresh-ips.sh`).
- Repeat the Cloudflare check for a client `www.` host (zone AOP applies to
  custom hostnames).

**V3 — Origin certificates (FR-004)**
- On `$CF_CHECK` first: Caddy log shows DNS-01 issuance via
  `acme-delegate`; Cloudflare dashboard SSL mode Full (strict) and the host
  serves without 526.
- `dig +short TXT _acme-challenge.<host>` follows the CNAME to
  `acme-delegate.example.com`.
- Renewal while proxied: delete `$CF_CHECK`'s certificate from the
  `caddy-data` volume, reload Caddy, check a new DNS-01 issuance succeeds
  and the host still serves under Full (strict).

**V4 — HTML never cached, nothing rewritten (FR-009, FR-010, FR-006)**
- `curl -sI https://example.com/` twice → `cf-cache-status`
  absent, `DYNAMIC` or `BYPASS`, never `HIT`; `cache-control: private, no-store`.
- `curl -s` the page through Cloudflare and directly from the origin (on the
  VPS, with the AOP cert): the `<script>` tags and the CSP header are
  identical apart from the nonce value; no `/cdn-cgi/` script injected.
- `/_next/static/...js` → `cf-cache-status: HIT` on the second request.
- Publish a change to a page in the admin, reload it through Cloudflare:
  `cf-cache-status: DYNAMIC`, and the change is visible by the second reload
  at the latest (US2 scenario 5: "exactly as fast as today"). The first reload
  after a publish may still show the previous version: the renderer
  invalidates with Next's `revalidateTag(tag, "max")` (stale-while-revalidate,
  since 001), not an edge cache. Kept as is by decision on 2026-10-11.

**V5 — Images at the edge, right format (US3, FR-011, SC-004)**
- Same image URL, twice with `-H 'Accept: image/webp,*/*'` → second
  `cf-cache-status: HIT`, `content-type: image/webp`.
- Same URL with `-H 'Accept: image/png,*/*'` → `content-type: image/png`
  (never WebP), second request `HIT`.
- Fonts on the asset host: `cache-control: public, max-age=31536000, immutable`,
  second request `HIT`.

## Switching Trefle hosts

**V6 — Real visitor IP (US2, FR-007, SC-003)**
- `infra/loadtest/` `leads-distinct` scenario: 50 submissions from 50
  distinct source IPs (k6 cloud runners or 50 small hosts) within 60 s → 50
  accepted.
  *Lighter equivalent (used on 2026-10-11)*: from one machine, 10
  submissions ~2 s apart (under the edge limit) then an 11th → `429` from the
  app; within the same minute a second device on another network (phone on
  4G) submits → accepted. Re-check the first machine is still `429` after the
  phone's submission: the app's minute window starts at the first
  submission.
- 6 submissions in 10 s from one IP → the 6th gets Cloudflare's block page
  (rate-limit rule); origin logs show at most 5.
- A request with a forged `CF-Connecting-IP` or `X-Real-IP` sent directly to
  the origin cannot be made (V2); through Cloudflare the forged header is
  overwritten.

**V7 — Admin and GrowthBook restriction (FR-008)**
- From an address in `ADMIN_ALLOWED_IPS`: admin and GrowthBook load.
- From any other address: Cloudflare block page (edge), and the origin log
  shows no request.

**V8 — Full regression (US2, SC-002)**
- Run the Playwright e2e suite (`apps/web/tests/e2e`) against the switched
  environment: A/B bucketing (two fresh contexts can get different variants;
  each keeps its own on reload), lead capture, consent/GTM, custom code,
  admin roles. Same expectations as before, no edits.
- *Production (2026-10-11)*: the full suite is not run against production (it
  changes the test domain, sends real e-mails and hits the per-address lead
  limit). Instead, on a page with a running test: several fresh requests get
  `tf-ab-<key>` cookies for both arms and the matching content; replaying a
  cookie keeps the same arm with no new cookie; `cf-cache-status: DYNAMIC`.

## Client domain

**V9 — `www.` move and root redirect (US5, FR-016, FR-016a, SC-008)**
- Before switching the client: on the registrar, root forwarding to `www.`
  with **301**, then:
  `curl -sI 'https://client-site.example/confirm?token=x&y=1'` →
  one `301` to `https://www.client-site.example/confirm?token=x&y=1`
  (path **and** query kept). If not → fallback in research R2.
- `www.` serves the same pages; admin Domains record shows the `www.` host;
  a lead submitted on `www.` is attributed to the right domain.
- `infra/cloudflare/add-client-domain.sh www.example-test.tld` on a test
  domain prints exactly two records; after adding them, V2–V5 pass for it.

## Images: replacement and take-down in production

**V10 — Replacement (US4, SC-005)**: as V0 steps 3–4 on production, timed:
a fresh browser and one that loaded the old image both show the new one
within 1 minute.

**V11 — Take-down (FR-015)**: (a) unused test media: delete it, run
`infra/cloudflare/purge-media.sh <key>`; (b) used test media: replace its file
with a neutral image (confirm), run the script with the old key. In both
cases the old asset URL and imgproxy URLs no longer return the image (`404`,
`cf-cache-status` not `HIT`), and in (b) the pages show the neutral image.

## After the switch

**V12 — Load and rollback (SC-006, SC-007)**
- Re-run the k6 scenarios → `results/<date>-after.json`: page-view
  throughput ≥ baseline; origin access log shows one request per image/font
  file for the whole image run.
- Rollback drill on `$CF_CHECK` (grey cloud, previous Caddyfile, firewall
  open) completes in < 15 minutes following the guide.
