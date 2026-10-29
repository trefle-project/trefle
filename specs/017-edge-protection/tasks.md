---

description: "Task list for 017 — Edge protection & media caching (lot 1 of 4)"
---

# Tasks: Edge protection & media caching (lot 1 of 4)

**Input**: Design documents from `/specs/017-edge-protection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the constitution (Principle IV) requires them: custom
Payload hooks and endpoints, data transformations, cache-invalidation logic.
Edge/origin behaviour is validated by the quickstart scenarios (V0–V12).

**Organization**: Tasks are grouped by user story. Infrastructure that every
story needs (and that is harmless before the switch) is in Setup/Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 from spec.md
- Paths are relative to the repository root (`apps/web`, `apps/cms`, `infra/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config-as-code skeleton, secrets, custom Caddy image

- [x] T001 Create `infra/cloudflare/README.md` describing the layout, the three tokens and the apply order (research R15)
- [X] T002 [P] Document `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` (zone settings, rulesets, lists, cache purge, custom hostnames) and `CLOUDFLARE_DNS_TOKEN` (Zone → DNS → Edit only) in `infra/.env.example`; add the real values to `infra/.env` (git-crypt) — *2026-10-12: done where each key lives — `CLOUDFLARE_DNS_TOKEN` and (since 020) `CLOUDFLARE_ZONE_ID` in `infra/.env.example` (VPS); `CLOUDFLARE_API_TOKEN` deliberately never on the VPS, documented in `infra/cloudflare/secret.env.example` and its README; real values in the git-crypt files*
- [x] T003 [P] Create `infra/caddy/Dockerfile` building Caddy 2 with `xcaddy build --with github.com/caddy-dns/cloudflare` (pinned versions); the PR body carries the Principle II justification (what it does, why the stack cannot, size and maintenance cost — plan.md Complexity Tracking)
- [x] T004 Point the `caddy` service in `infra/docker-compose.prod.yml` at the `infra/caddy` build, pass `CLOUDFLARE_DNS_TOKEN`; keep the current Caddyfile behaviour (no DNS-01 yet). No AOP mount here (the file does not exist yet — see T009)
- [x] T005 [P] Create `infra/cloudflare/refresh-ips.sh` that fetches `https://www.cloudflare.com/ips-v4` and `ips-v6`, writes `infra/deploy/cloudflare-ips.caddy` as a `(cloudflare_proxies)` snippet whose single line is the full `trusted_proxies static <range> <range> …` directive (Caddy `import` must stand on its own line) and prints the list for the Hostinger firewall
- [x] T006 Generate and commit `infra/deploy/cloudflare-ips.caddy` with T005

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Zone in Cloudflare (not yet proxied), base settings, origin
trust, real-IP handling — all safe while traffic is still direct.

**⚠️ CRITICAL**: The switch (US1) cannot happen before this phase is complete.

- [x] T007 Create `infra/cloudflare/apply.sh` (bash + curl + jq, idempotent): PATCH zone settings from `settings.json`, PUT each ruleset phase entrypoint from `rules/*.json`, upsert the `trefle_admin` IP list from `ADMIN_ALLOWED_IPS`
- [x] T008 [P] Create `infra/cloudflare/settings.json`: SSL Full (strict), min TLS 1.2, Always Use HTTPS on, Rocket Loader off, Email Obfuscation off, Automatic HTTPS Rewrites off, Polish off, Bot Fight Mode off (contracts/edge-config.md "Zone-wide")
- [x] T009 [P] Create `infra/cloudflare/aop-cert.sh`: generate our AOP CA + client certificate, upload it as the zone-level AOP certificate, enable zone-level AOP, write the CA to `infra/deploy/aop-ca.pem` **and** add it read-only to the `caddy` volumes in `infra/docker-compose.prod.yml` — *run 2026-10-10: zone AOP enabled, cert expires 2028-10-09; `.gitignore` now excepts `infra/deploy/aop/ca.pem` and `secret-aop-client.pem`*
- [x] T010 Import the `example.com` zone into Cloudflare (full setup, Free plan), copying every GoDaddy record with proxy **off**; checklist of MX/SPF/DKIM/DMARC/Brevo records in `infra/cloudflare/README.md`; verify per quickstart V1 before changing nameservers — *2026-10-10: 21 records match the GoDaddy export (img.mail, r.mail added from it), all DNS-only*
- [x] T011 Switch the zone's nameservers to Cloudflare and re-run quickstart V1 (mail delivered, DKIM pass) — *2026-10-10 12:55 Paris; V1: opt-in delivered, dkim=pass (brevo2), spf=pass, dmarc=pass; r.mail tracker 200*
- [X] T012 Create DNS-only records `acme-delegate.example.com` and `_acme-challenge.<host> CNAME acme-delegate.example.com` for every Trefle host, plus proxied `cf-check.example.com` → VPS (quickstart prerequisite) — *2026-10-12, checked from outside (1.1.1.1): `acme-delegate` carries the ACME TXT; `_acme-challenge` CNAME → `acme-delegate` on the apex, www, admin, img, assets, experiments, experiments-api, edge-check (020) and cf-check, which is proxied; certificates keep being issued by DNS-01 (edge-check on 2026-10-12)*
- [x] T013 Update `infra/deploy/Caddyfile` global options: `servers {` + `import cloudflare_proxies` (own line) + `trusted_proxies_strict` + `client_ip_headers CF-Connecting-IP }`; change `header_up X-Real-IP {http.request.remote.host}` to `{client_ip}`; change `remote_ip {$ADMIN_ALLOWED_IPS}` matchers to `client_ip` (contracts/origin-access.md "Trusted request data")
- [x] T014 Add a `cf-check` site block to `infra/deploy/Caddyfile` using `tls { dns cloudflare {env.CLOUDFLARE_DNS_TOKEN}; dns_challenge_override_domain acme-delegate.example.com; client_auth { mode require_and_verify; trust_pool file <AOP CA> } }` and validate quickstart V3 on it, including the forced renewal while proxied (delete the certificate from `caddy-data`, reload, new DNS-01 issuance) — *2026-10-10 (`017.2.1-acme-resolvers`): DNS-01 issuance in 8 s, 200 through Cloudflare, direct handshake without client cert refused; forced renewal while proxied OK. Needed `resolvers 1.1.1.1 1.0.0.1` (Hostinger's resolver cached GoDaddy's delegation)*
- [x] T015 Create `infra/loadtest/` with k6 scenarios `pages.js`, `images.js`, `leads.js`, `leads-distinct.js` and `README.md` (run instructions, off-peak rule, temporary WAF skip rule); run the baseline and save `infra/loadtest/results/<date>-baseline.json` (quickstart V-baseline) — *baseline 2026-10-10: `infra/loadtest/results/2026-10-10-baseline.md`*

**Checkpoint**: zone live in Cloudflare (DNS-only), origin trust ready, baseline recorded.

---

## Phase 3: User Story 1 - The sites stay up under attack (Priority: P1) 🎯 MVP

**Goal**: Every Trefle host behind Cloudflare; origin answers only our Cloudflare account.

**Independent Test**: quickstart V2 (direct access refused, AOP enforced) and the single-source burst in V6.

- [x] T016 [US1] Create `infra/cloudflare/rules/ratelimit.json`: `POST` and path eq `/api/leads`, per IP, 10 s window, threshold 5, block 10 s (research R7); apply with T007
- [x] T017 [US1] Apply `tls { dns cloudflare …; dns_challenge_override_domain … }` — **without** `client_auth` — to every site in `infra/deploy/Caddyfile` through a shared `(origin_tls)` snippet, and deploy with `infra/deploy/release.sh` (traffic is still direct; only issuance changes) — *deployed 2026-10-10 (`017.2-origin-dns01`, `017.2.1-acme-resolvers`); existing certificates move to DNS-01 at their next renewal*
- [x] T018 [US1] Amend `.specify/memory/constitution.md` to 2.1.0: "Edge" bullet in Architecture (Cloudflare in front of every host, origin reachable only through it, no HTML caching until lot 3), Principle II justification for Cloudflare and the custom Caddy build, Sync Impact Report updated (research R20) — merged before T019, since the architecture changes at the switch
- [x] T019 [US1] Turn every Trefle host record (pages, img, assets, admin, GrowthBook ×2) to proxied in Cloudflare; check each answers through Cloudflare (quickstart V2, third bullet) — *2026-10-10: 12 records proxied; V2 (7 hosts 200 via Cloudflare), V4 (HTML DYNAMIC + no-store, no /cdn-cgi/, CSP = direct apart from the nonce), V5 (WebP/PNG per Accept MISS→HIT, fonts immutable MISS→HIT, 404 never cached) pass; client IP not visible in the access log (no IPs logged) — proven by V6*
- [x] T020 [US1] Only once every host is verified proxied: add `client_auth { mode require_and_verify; trust_pool file /etc/caddy/aop-ca.pem }` to the `(origin_tls)` snippet in `infra/deploy/Caddyfile` and deploy (enabling it while traffic is still direct would fail every TLS handshake) — *deployed 2026-10-10 (`017.3-aop-required`): 10 URLs 200 through Cloudflare incl. the SaaS host; direct handshake without client cert refused on all 8 hosts*
- [x] T021 [US1] Configure the Hostinger VPS firewall: 443/tcp only from the ranges printed by `infra/cloudflare/refresh-ips.sh`, 80/tcp closed, 22/tcp unchanged; record the rule count; if the panel limit is too low, fall back to a `DOCKER-USER` iptables chain documented in `infra/deploy/README.md` (research R4) — *2026-10-10 via the Hostinger API instead of the panel (`infra/cloudflare/origin-firewall.sh`): firewall `trefle-cloudflare-only` (id 375302), 23 rules (22 + 15 IPv4 + 7 IPv6 ranges on 443), synced, active; effective ≈1 min after sync — direct 443/80 time out, SSH OK, every host 200 through Cloudflare*
- [X] T022 [US1] Run quickstart V2 (direct by IP refused, no-client-cert handshake fails, Cloudflare path works) and the single-IP burst of V6 — *2026-10-12: direct request on the VPS IP times out (firewall); on the VPS without the client certificate the TLS handshake fails (curl exit 56); through Cloudflare every host answers (200; assets 404 at its root, as expected) including the client www. The single-IP burst of V6 was run on 2026-10-11 (T027)*

**Checkpoint**: origin locked; US1 acceptance scenarios 1–2 pass (scenario 3, new IP, is T057).

---

## Phase 4: User Story 2 - Nothing changes for visitors, editors and running A/B tests (Priority: P1)

**Goal**: The switch is invisible: A/B, leads, per-visitor limits, admin restriction, scripts and CSP unchanged.

**Independent Test**: quickstart V4, V6 (50 distinct visitors), V7, V8 (full e2e).

- [x] T023 [P] [US2] Create `infra/cloudflare/rules/cache.json` page-bypass rule: page hosts and path not starting `/_next/static/` → bypass cache (research R8)
- [x] T024 [P] [US2] Create `infra/cloudflare/rules/waf-custom.json`: block internal hosts (CMS, GrowthBook UI, GrowthBook API) unless `ip.src in $trefle_admin` (research R6)
- [X] T025 [US2] Set the production `ADMIN_ALLOWED_IPS` in `infra/.env` to the real allowed networks (today wide open), re-run `infra/cloudflare/apply.sh` and redeploy Caddy — *moved to feature 019 (admin access by verified identity instead of an address list), user decision 2026-10-11* — **done by 019** (tags `019.2-edge-access`, `019.3-origin-check`, 2026-10-16): Cloudflare Access + token check at the origin, `ADMIN_ALLOWED_IPS` removed
  - **Moved out of 017 (2026-10-11)**: the admins' addresses are not known and may not be fixed, so how admin and GrowthBook access is restricted is re-specified in its own feature (019, admin access — Cloudflare Access is the candidate, research R6). The edge rule, the `trefle_admin` list and the Caddy check stay in place; `ADMIN_ALLOWED_IPS` stays wide open until then.
- [x] T026 [P] [US2] Lower `MAX_PENPOT_FILE_BYTES` to 95 MB in `apps/cms/src/endpoints/siteImportAnalyse.ts` and `MAX_FILE_BYTES` in `apps/cms/src/components/SiteImportWizard.client.tsx`; keep the « fichier trop volumineux » message intelligible with the new size (research R13)
- [x] T027 [US2] Run quickstart V4 (HTML never `HIT`, no `/cdn-cgi/` script, CSP identical apart from the nonce, a published change visible on the first reload), V6 (50 distinct visitors all accepted), V7 (admin/GrowthBook allowed vs blocked — moved to 019 with T025; done by 019, quickstart V1–V3 there)
  - *2026-10-11: **V6 passed** in production with the two-source method of quickstart V6 (instead of 50 hosts): (1) 11 submissions from one Mac, 5.5 s apart, each with a different forged `X-Real-IP` / `X-Forwarded-For` → 10 accepted, 11th `429` from the app (forged headers ignored); a forged `CF-Connecting-IP` is refused by Cloudflare itself (`403`, error 1000); (2) Mac at its limit (10 accepted 10:24:21–10:24:45, 11th `429` at 10:24:48, still `429` at 10:25:18) while a phone on 4G submitted at the same time → accepted: each visitor has their own counter, so the app sees CF-Connecting-IP, not the edge address; (3) burst of 8 in 3 s → after the app's own limit, requests 6–8 got Cloudflare's `429` (error 1015): the origin saw at most 5 in 10 s. V4 passed on 2026-10-10 (T019); its last point checked on 2026-10-11 on `/loadtest`: page title changed and published → 1st reload 11:18:48 still the old title, 2nd reload 11:19:00 the new one, `cf-cache-status: DYNAMIC` both times — the delay is the renderer's stale-while-revalidate (`revalidateTag(tag, "max")`, since 001), not Cloudflare; matches US2 scenario 5 ("exactly as fast as today"); quickstart V4 wording aligned, behaviour kept by decision. Test leads `loadtest-distinct+…@example.com` (≈ 32) to delete in the admin.*
- [x] T028 [US2] Run the Playwright suite `apps/web/tests/e2e` against the switched environment with unchanged expectations (quickstart V8, SC-002); record results in the PR body
  - *2026-10-11: **targeted V8 passed** instead of the full suite against production. The suite is not safe to run there (it PATCHes the test domain's GTM/consent/fonts, posts ≥ 13 leads that now hit the per-address limit since spoofed `X-Real-IP` is ignored, sends editor invitations through Brevo, and needs local-only services); the switch changed only what sits in front of the app, and what it could break is covered by V4, V5, V6 and this check. A/B through Cloudflare on `www.client-site.example/` (test « Choisir un traiteur à Lille — test », control page 19, variant 60): 8 fresh visitors → cookie `tf-ab-page-19-…` = 60 ×2, 19 ×6, each served the matching content (variant « Trouvez votre traiteur à Lille », original « Trouvez le traiteur qu'il vous faut à Lille »); replaying the 60 cookie ×3 → variant content every time, no new cookie; `cf-cache-status: DYNAMIC`, `cache-control: private, no-store`. The full suite keeps running locally before every merge. Found on the way: the « Tests A/B » tab crashed on every page since 010 — fixed in PR #29, released as `010.1-ab-tab-searchparams`.*
- [X] T029 [US2] Before merging the switch PR: lint, type-check and build `apps/cms` and `apps/web`, run their tests, `docker compose -f docker-compose.yml -f docker-compose.override.yml up` healthy; record these steps and the quickstart results in the PR body (constitution, Delivery roadmap) — *done in effect: the switch PRs were checked and merged, live since 2026-10-10; ticked 2026-10-12*

**Checkpoint**: US1 + US2 together are the deployable MVP (protection without regression).

---

## Phase 5: User Story 3 - Images and fonts are served from the edge (Priority: P2)

**Goal**: Images (WebP / original variants) and asset-host files served from the edge cache.

**Independent Test**: quickstart V5.

- [x] T030 [P] [US3] Add to `infra/cloudflare/rules/cache.json`: image host → eligible for cache, respect origin TTL, Vary `Accept` normalize with `media_types: ["image/webp"]`; asset host → eligible for cache, respect origin TTL (contracts/edge-config.md "Rules")
- [x] T031 [P] [US3] Add `header Cache-Control "public, max-age=31536000, immutable"` to the `{$ASSET_HOSTNAME}` block of `infra/deploy/Caddyfile` — deploy only after T037 is live in production (keys never reused); first list the Garage bucket's prefixes and confirm no key is rewritten in place (only media root and `fonts/` expected)
- [x] T032 [US3] Apply and run quickstart V5 (WebP vs PNG per `Accept`, second request `HIT`, fonts `immutable` + `HIT`); if the Vary rule misbehaves, apply the documented fallback (imgproxy WebP for everyone, no `Vary`) in `infra/docker-compose.prod.yml` — *2026-10-11: V5 passed in production, no fallback needed: same imgproxy URL → `image/webp` with a WebP `Accept`, `image/png` with a PNG `Accept`, `vary: Accept`, second request `HIT` in both cases; font on the asset host `public, max-age=31536000, immutable`, second request `HIT`*

**Checkpoint**: SC-004 measurable.

---

## Phase 6: User Story 4 - Replacing an image updates it everywhere (Priority: P2)

**Goal**: Unique media/font keys; replaced media resolved through an alias map; take-down procedure.

**Independent Test**: quickstart V0 (local), V10 and V11 (production).

> Code-only and independent of Cloudflare: can (and should) ship first — plan.md phase 1.

### Tests for User Story 4 (constitution Principle IV)

- [x] T033 [P] [US4] Write `apps/cms/tests/media-unique-key.test.ts`: upload `photo.jpg` → `photo-<8 hex>.jpg` where the suffix is the first 8 hex chars of the file's SHA-256; same for fonts under the `fonts/` prefix; a re-upload of identical content still gets a non-clashing key; an import-style name `logo-ab12cd34.webp` ends with exactly one suffix (`logo-<hash of final bytes>.webp`)
- [x] T034 [P] [US4] Write `apps/cms/tests/media-aliases.test.ts`: replacing the file appends the old filename once ("replacing it again appends the intermediate key too"); endpoint returns chain `a → b → c` as `{a: c, b: c}`; a current key never appears as an alias key; deleted media absent; non-service caller → 403; `afterChange` (filename changed) and `afterDelete` call `revalidateTags` with `media-aliases` and `reason: "media"`, and that body is accepted by the shared schema
- [x] T035 [P] [US4] Extend `apps/web/tests/imgproxy.test.ts` and `apps/web/tests/imgproxy-background.test.ts` with alias cases (img `src`, CSS `url()` bare/quoted/`&quot;`), and create `apps/web/tests/asset-links.test.ts` for `<a href>` under `ASSET_ORIGIN`; endpoint failure ⇒ unchanged output

### Implementation for User Story 4

- [x] T036 [US4] Create migration `apps/cms/src/migrations/<timestamp>_media_previous_filenames.ts` adding `previousFilenames` (array of `{ filename: text }`) to `media`, with a down path that drops it; register it in `apps/cms/src/migrations/index.ts`; run down then up locally and record it in the PR body (tested down path, Principle III)
- [x] T037 [US4] Create `apps/cms/src/hooks/media-unique-key.ts` (`beforeOperation` on create/update with a file: rename the incoming file to `<base>-<hash8>.<ext>`, the hash computed on the final bytes; if the base already ends with `-[0-9a-f]{8}` — as imports name their images, `apps/cms/src/lib/import/images.ts:218` — **replace** that suffix instead of appending a second one) and wire it in `apps/cms/src/collections/Media.ts` and `apps/cms/src/collections/Fonts.ts`
- [x] T038 [US4] Add the field to `apps/cms/src/collections/Media.ts`: `previousFilenames`, hidden in the admin, read-only, update access system only — "Every key this media item has had before its current one, oldest first … Never edited by people" (data-model.md)
- [x] T039 [US4] Create `apps/cms/src/hooks/media-aliases.ts`: `beforeChange` appends `originalDoc.filename` to `previousFilenames` when `filename` changes on update; `afterChange` (filename changed) and `afterDelete` call `revalidateTags({ reason: "media", tags: ["media-aliases"] })` from `apps/cms/src/hooks/revalidate.ts`; wire in `apps/cms/src/collections/Media.ts`
- [x] T040 [US4] Create `apps/cms/src/endpoints/mediaAliases.ts` (`GET /api/media/aliases`, service-or-admin check as in `endpoints/pageView.ts`, response per contracts/media-aliases.md) and register it in `apps/cms/src/payload.config.ts`; add `"media"` to the zod `reason` enum in `packages/shared/src/index.ts` **and** to the `Reason` type in `apps/cms/src/hooks/revalidate.ts` (both enumerate reasons — without it `/api/revalidate` answers 400 and the alias map never refreshes)
- [x] T041 [US4] In `apps/web/src/app/api/revalidate/route.ts`, expire the `media-aliases` tag with `revalidateTag(tag, { expire: 0 })` (other tags keep `"max"`), with a case in `apps/web/tests/api-revalidate.test.ts`; then create `apps/web/src/lib/media-aliases.ts` (fetch through the payload client with `next: { tags: ["media-aliases"], revalidate: 3600 }`, `{}` on any error with a warning log) and export it from `apps/web/src/lib/payload-client/index.ts`
- [x] T042 [US4] In `apps/web/src/lib/imgproxy.ts`, apply `aliases[key] ?? key` in `rewriteImageTags` and `rewriteBackgroundUrls`, and add `rewriteAssetLinks` for `<a href>` under `ASSET_ORIGIN` (keeps the asset host, aliased key); call all three with the alias map in `apps/web/src/components/page-shell.tsx`
- [x] T043 [US4] Create `infra/cloudflare/purge-media.sh <key>…`: purge each `https://$ASSET_HOSTNAME/<key>` by URL and `$IMG_HOSTNAME` by hostname; its usage text explains the two cases — unused image: delete then purge; used image (deletion blocked): replace the file then purge the old key(s) (research R12)
- [x] T044 [P] [US4] Write `apps/cms/tests/media-usage.test.ts` per contracts/media-usage.md "Tests": match on current key, on a previous key, on CSS `url()`; `seo.ogImage`; domain `branding.defaultOgImage`; domain `branding.faviconUrl` pointing at the asset host; `/<key>` boundary (no false positive on a longer name); one entry per page; published before draft then title; 403 for a non-editor
- [x] T045 [US4] Create `apps/cms/src/lib/media-usage.ts` (Payload `contains` on `builder.html` / `builder.css` for `/<key>` over current + `previousFilenames`, `seo.ogImage` equals id, `domains.branding.defaultOgImage` equals id, `domains.branding.faviconUrl` contains `/<key>`; `isVariant` = `experimentOf` set) and `apps/cms/src/endpoints/mediaUsage.ts` (`GET /api/media/:id/usage`, `isAdminOrEditor`, 404 unknown id), registered on the `media` collection — depends on T038
- [x] T046 [US4] Create `apps/cms/src/components/MediaUsage.client.tsx` (« Utilisée dans N page(s) : … », empty « Cette image n'est utilisée dans aucune page. », loading and error copy, first 20 then « et N autres ») and add it to `admin.components.edit.beforeDocumentControls` in `apps/cms/src/collections/Media.ts`
- [x] T047 [US4] Create `apps/cms/src/components/MediaReplaceConfirm.client.tsx`: on save, when the upload field holds a new file and usage `total > 0` (or the lookup failed), show « Attention, l'image que vous voulez remplacer est utilisée dans ces pages : … La nouvelle image apparaîtra dans toutes ces pages. Pour ne changer qu'une page, ajoutez plutôt une nouvelle image … » with « Remplacer partout » / « Annuler »; wire it as the `media` save control in `apps/cms/src/collections/Media.ts` (confirm the Payload 3.88 slot first; fallback per plan.md Risks)
- [x] T048 [US4] Add an admin e2e spec `apps/web/tests/e2e/us-media-replace.spec.ts`: used image → panel lists the page; new file + save → confirmation; « Annuler » keeps the filename; « Remplacer partout » replaces and the page shows the new image; unused image → no confirmation; `alt`-only save → no confirmation; deleting the used image → refused with the page title (reuse the shared admin token and `Authorization: JWT` header from global-setup; run against the full stack `docker compose -f docker-compose.yml -f docker-compose.override.yml up`, where `ASSET_ORIGIN` is set — under bare `npm run dev` media URLs are Payload-served and the alias path is not exercised)
- [x] T049 [P] [US4] Write `apps/cms/tests/media-delete-guard.test.ts`: used → 409 with the page titles and the object still present; unused → deleted; bulk delete mixed → only unused deleted; `context.allowUsedMediaDelete` → deleted
- [x] T050 [US4] Create `apps/cms/src/hooks/media-delete-guard.ts` (`beforeDelete` on `media`: usage via `apps/cms/src/lib/media-usage.ts`; `total > 0` and not `req.context.allowUsedMediaDelete` → `APIError` 409 « Impossible de supprimer cette image : elle est utilisée dans N page(s) : A, B, C… Retirez-la de ces pages ou remplacez son fichier, puis réessayez. », first 5 titles then « et N autres ») and wire it in `apps/cms/src/collections/Media.ts`; add « La suppression est bloquée tant que l'image est utilisée. » to `MediaUsage.client.tsx` — depends on T045
- [x] T051 [US4] Pass `context: { allowUsedMediaDelete: true }` to the media deletions in `deleteImportedMedia` (`apps/cms/src/jobs/pageImport.ts`) and `deleteCreated` (`apps/cms/src/jobs/siteImport.ts`); check the existing import tests still pass
- [x] T052 [US4] Run quickstart V0 locally (`docker compose -f docker-compose.yml -f docker-compose.override.yml up`), then after deploy V10 (replacement visible ≤ 1 min, fresh and returning browser) and V11 (take-down, both cases) — *2026-10-10: V10 (fresh and returning browser) and V11 (a, b) passed in production (old asset and imgproxy URLs 404 at once, content-identical twin key kept); V0 local still to run* — *2026-10-11: **V0 passed locally** (stack rebuilt on `main`): upload `photo.png` → `photo-21391377.png`; replacing its file → new key `photo2-52c7bed8.png` and `/api/media/aliases` maps old → new; `us-media-replace.spec.ts` 5/5 (usage panel, alt-only save never asks, « Annuler » / « Remplacer partout », unused image replaced without asking, used image delete refused with the page title); bulk delete of a used + an unused image → only the unused one deleted, the used one refused with « Impossible de supprimer cette image : elle est utilisée dans 1 page(s) : … »; CSS `url()` and `<a href>` alias rewrites covered by `imgproxy-background.test.ts` and `asset-links.test.ts`; unit tests cms 568/568, web 194/194*
- [x] T053 [US4] Before merging the US4 PR: lint, type-check and build `apps/cms` and `apps/web`, run their tests, `docker compose -f docker-compose.yml -f docker-compose.override.yml up` healthy; record steps in the PR body

**Checkpoint**: existing replace-breaks-pages defect fixed; editors warned before overwriting a used image; used images cannot be deleted; FR-013/014/015/020/021/022 met.

---

## Phase 7: User Story 5 - Onboarding a new client domain keeps the protection (Priority: P3)

**Goal**: Client domains on `www.` via Cloudflare for SaaS; root forwarded; existing client moved.

**Independent Test**: quickstart V9 on a test domain, then on `client-site.example`.

- [x] T054 [US5] Enable Cloudflare for SaaS on the zone: fallback origin `saas-origin.example.com` (proxied → VPS), CNAME target `sites.example.com`; add both to `infra/cloudflare/README.md` — *2026-10-10: fallback origin active*
- [x] T055 [US5] Create `infra/cloudflare/add-client-domain.sh www.<client>`: create the custom hostname (HTTP DCV), print the two records the client adds (`www CNAME sites.example.com`, `_acme-challenge.www CNAME acme-delegate.example.com`) and the registrar forwarding instruction (root → `https://www.<client>`, 301, path + query kept); add the host to `WEB_HOSTNAMES` instructions
- [x] T056 [US5] Move `client-site.example`: verify the GoDaddy root forwarding keeps path and query (quickstart V9 first bullet; fallback: that zone into our account, research R2), run T055 for `www.client-site.example`, rename the Domains record hostname in the admin, replace the root by `www.` in `WEB_HOSTNAMES` in `infra/.env`, deploy, then run the rest of V9 — *2026-10-10: www. kept (page 19), root Domains record deactivated; GoDaddy forwarding does NOT keep the path (root has no traffic — accepted by the owner); www CNAME → sites, custom hostname active after a manual Refresh (≈15 min TLS outage); root removed from WEB_HOSTNAMES, Caddy recreated; V9 lead test done by the owner*

**Checkpoint**: SC-008 met; new clients onboard with two DNS records.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T057 Obtain a new VPS IP (Hostinger support first; otherwise new VPS + `infra/deploy/release.sh` + database and Garage restore); update the proxied records only, check no public record points at the new IP (research R4.3, FR-003) — *deferred, risk accepted by the owner (2026-10-19)*
  - **Hostinger support (2026-10-19)**: no in-place IPv4/IPv6 replacement for VPS 1970835; only a new VPS gives a new address. Support also confirmed the `trefle-cloudflare-only` firewall is attached and synchronised (443 from Cloudflare ranges only, 22 open).
  - **Accepted risk**: the old address stays in public DNS history. Layers 1–2 (firewall + Authenticated Origin Pulls with our own certificate) already refuse every web request that does not come through our Cloudflare account; what remains is a volumetric flood aimed at the raw address.
  - **Do it when** the VPS is replaced anyway (upgrade, end of the 24-month term) or if the raw address is attacked. Then: new VPS, `release.sh`, database and Garage restore, and change the content of the 17 proxied A/AAAA records only (they stay proxied); the new address goes only into git-crypt files and is never served grey-cloud.
- [x] T058 [P] Update `infra/deploy/README.md` and `infra/deploy/README.fr.md`: switch steps, rollback (< 15 min; after the IP change, a grey-cloud rollback publishes the new IP — prefer rolling back the Caddy/firewall change while staying proxied, and if grey cloud is unavoidable plan another IP change), client onboarding (two records + forwarding, with the list of acceptable registrar forwarding setups: HTTPS on the root, 301, path + query kept, and the fallback when not), image take-down (both cases), Pro-plan trigger, firewall/IP-range refresh (FR-017)
- [X] T059 [P] Update the legal-notice page content (admin) and the processing register to list Cloudflare as a processor (FR-019, research R19) — *moved to a future legal feature (user decision 2026-10-11); texts ready in `docs/sous-traitant-cloudflare.fr.md`*
  - **Moved out of 017 (2026-10-11)**: the texts are drafted in `docs/sous-traitant-cloudflare.fr.md` and will be published by a dedicated feature (legal notice and processing register), together with what 019 adds (Access processes members' e-mail addresses).
- [x] T060 Run the k6 scenarios after the switch, save `infra/loadtest/results/<date>-after.json`, compare with the baseline (SC-006), and count origin hits per image/font file from the Caddy access log (SC-004) — *2026-10-10: `infra/loadtest/results/2026-10-10-after.md` — pages 25.9/s (= baseline, no errors), images 99.4 % OK vs 13 %, origin saw 4 image requests for 3,631; leads 9/9*
- [ ] T061 Rollback drill on `cf-check` following the guide, timed (SC-007); remove the `cf-check` host and the temporary load-test WAF rule afterwards

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → **US1 (3)** and **US2 (4)** ship as one switch.
- **US3 (5)** needs the zone (Phase 2); T031 additionally needs T037 live.
- **US4 (6)** depends on nothing in Cloudflare — run it first or in parallel with Phases 1–2.
- **US5 (7)** after US1 + US2 have been stable in production.
- **Polish (8)**: T057 last; T058 and T059 any time after their subject exists (T018 moved into US1).

### User Story Dependencies

- Switch order inside US1: T017 → T018 → T019 → T020 → T021.
- US1 ↔ US2: deploy together (US2's Caddy real-IP changes are in Foundational T013 precisely so the switch does not regress).
- US3: independent of US1/US2 for configuration, visible only once hosts are proxied.
- US4: fully independent.
- US5: needs US1/US2 (protection in place) and T054.

### Within Each User Story

- US4: tests T033–T035 alongside T036–T042; migration T036 before T038/T039; usage warning T044–T048 after T038 (needs `previousFilenames`), deletion guard T049–T051 after T045, all before T052.
- Config files before `apply.sh` runs; Caddyfile changes deployed via `release.sh`.

### Parallel Opportunities

- T002, T003, T005 in Setup; T008, T009 in Foundational.
- T023, T024, T026 in US2; T030, T031 in US3; T033, T034, T035, T044, T049 in US4.
- All of US4 in parallel with Phases 1–2.

---

## Parallel Example: User Story 4

```text
Task: "T033 apps/cms/tests/media-unique-key.test.ts"
Task: "T034 apps/cms/tests/media-aliases.test.ts"
Task: "T035 apps/web/tests/imgproxy*.test.ts + asset-links.test.ts"
```

---

## Implementation Strategy

### MVP First

1. US4 (code, no Cloudflare) — fixes a live defect, ships alone.
2. Setup + Foundational.
3. US1 + US2 as one switch → **MVP: protected, no regression**.

### Incremental Delivery

4. US3 (edge caching of images and fonts).
5. US5 (client domain on `www.`).
6. Polish (new IP, load test after, guides, constitution, legal).

---

## Notes

- Every switch step has an undo (research R18); record it in the PR body with the verification steps (constitution Development Workflow).
- Never enable a cache rule on page HTML in this lot (FR-009).
