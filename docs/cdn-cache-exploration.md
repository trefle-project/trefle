# Caching and CDN: exploration notes

English translation of [cdn-cache-exploration.fr.md](cdn-cache-exploration.fr.md).

Status: **exploration before a spec** (2026-10-09, revised the same day after
the scoping decisions of §6). **Update 2026-10-11: study of HTML caching and
decisions in §11, which prevails over §7–§8 where they differ.** Outside §11,
nothing is decided here: this document gathers the state measured in
production, the constraints of the code and the research, to feed
`/speckit-specify` without starting over.

## 1. Starting point

Question asked: how does Trefle handle caching of pages and media, and is a
CDN (Cloudflare or another) needed? Explicit requirement: **do not break the
A/B test** (008-ab-testing).

## 2. Current state, measured in production on 2026-10-09

No CDN: every host resolves directly to the VPS (203.0.113.10, Caddy in
front, `via: 1.1 Caddy`). DNS of both domains at GoDaddy
(`ns*.domaincontrol.com`).

| Resource | Served by | `Cache-Control` observed | Remark |
|---|---|---|---|
| Page HTML | Next.js (`web:3001`) | `private, no-cache, no-store, max-age=0` | rendered on every request (see §3.1); measured TTFB ≈ 0.10–0.14 s |
| Payload data used for rendering | Next `fetch` cache | — (internal) | 1 h + tags, invalidated by `POST /api/revalidate` on publish |
| `/_next/static/*` | Next.js | `public, max-age=31536000, immutable` | hashed names, correct |
| Images (`img.example.com`) | imgproxy ← Garage S3 | `public, max-age=31536000` + `Vary: Accept` | WebP if the browser accepts it (`IMGPROXY_ENFORCE_WEBP`), otherwise the original format. **imgproxy has no cache**: every request not in the browser cache reads S3 again and reprocesses the image |
| Fonts (`assets.example.com/fonts/…`) | Garage (website endpoint) | **missing** | `ETag` + `Last-Modified` only → heuristic browser cache, frequent revalidations. CORS `*` OK |

Key files: [Caddyfile](../infra/deploy/Caddyfile),
[middleware.ts](../apps/web/src/middleware.ts),
[page.tsx](../apps/web/src/app/[[...slug]]/page.tsx),
[payload-client](../apps/web/src/lib/payload-client/index.ts),
[imgproxy.ts](../apps/web/src/lib/imgproxy.ts),
[api/leads/route.ts](../apps/web/src/app/api/leads/route.ts).

## 3. Constraints to preserve

### 3.1 HTML is necessarily dynamic
The middleware generates a **per-request nonce CSP** (002-security-hardening).
The Next.js documentation is explicit: nonce ⇒ dynamic rendering; ISR,
static rendering and PPR are incompatible with a nonce CSP. The
`revalidate = 3600` of `page.tsx` therefore caches only the *data*, not the
rendered page.

### 3.2 The A/B test lives on every request, server-side
- The middleware reads/sets the `tf-ab-<experimentKey>` cookie (30 days,
  `httpOnly`) and rewrites to `/ab-variant/<id>`.
- The view is counted **server-side during rendering** (`pingPageView`), and
  conversions are the leads received by `/api/leads`.
- Consequence: any edge caching of the HTML ("Cache Everything") would freeze
  one variant for everyone *and* make views disappear from the count. Both
  skew the experiment.

### 3.3 The visitor's real IP
`/api/leads` limits to 10/min and 100/day **per IP**, read from `X-Real-IP`
set by Caddy from the TCP peer. Behind a CDN proxy, that peer becomes the CDN:
different visitors then share the same IP, and the limiter blocks real leads,
which also skews A/B conversions. Same problem for `ADMIN_ALLOWED_IPS` on
`admin.` and `growthbook*` (address list since replaced by Cloudflare Access,
019-admin-access).

### 3.4 Client domains
Public domains (e.g. `client-site.example`) point to the VPS through
an `A`/`AAAA` record at the client's registrar, and Caddy obtains their
certificates (deployment README §4.1). Putting them behind a CDN means
touching the DNS of *each* client.

## 4. What the research establishes

**Cloudflare**
- Does not cache HTML by default. Honours the origin's `Cache-Control`:
  nothing is cached if `private`/`no-store`/`max-age=0`, nor if the response
  contains `Set-Cookie`. Behind Cloudflare without a specific rule, the A/B
  test therefore passes through intact.
- **`Vary`**: historically ignored (except `Accept-Encoding`), hence a risk
  of serving WebP to a browser that does not support it. **Since 2026-09-22**,
  `Vary` support is available in Cache Rules **on every plan, Free
  included**, with normalisation of `Accept`. To be configured explicitly.
  "Vary for Images" (the older mechanism) remains Pro+ only. Polish does not
  apply if the origin sends `Vary: Accept`, and imgproxy recommends turning
  off the CDN's image optimisation anyway.
- **Partial (CNAME) setup** is Business/Enterprise only. On Free, the **whole
  DNS zone** (nameservers) of `example.com` must move to
  Cloudflare, copying every record (MX, Brevo DKIM/SPF…).
- **Client domains**: either move their nameservers, or Cloudflare for SaaS
  (100 hostnames included even on Free, then $0.10/month each).
- **Bot Fight Mode** (Free) injects a detection script, which cannot be
  turned off. Cloudflare reads the CSP nonce and adds it to its scripts: in
  principle compatible with our CSP, but to be tested. **Rocket Loader** and
  **Email Obfuscation** rewrite the HTML: to be turned off. The `__cf_bm`
  cookie is classified as strictly necessary (exempt from consent).
- **Real IP in Caddy**: `trusted_proxies` with Cloudflare's ranges (static
  list, or the `caddy-cloudflare-ip` module, which needs a custom build) +
  `client_ip_headers CF-Connecting-IP` (the only header Cloudflare makes
  unforgeable), then `header_up X-Real-IP {client_ip}`.
- **Certificates**: behind the Cloudflare proxy, TLS-ALPN-01 no longer works
  and HTTP-01 is fragile. Options: DNS-01 (`caddy-dns/cloudflare` plugin,
  custom build), a Cloudflare Origin CA certificate, or first issuance in DNS
  only, then switching to proxied.
- **Terms of service**: since the rewrite of the terms (end of the former
  §2.8), serving images through the CDN is allowed. The restriction concerns
  video and large files not hosted at Cloudflare.

**Bunny.net (alternative)**
- Pull zone with a custom hostname through a simple **CNAME**, without moving
  the DNS zone, with free SSL.
- Native **Vary Cache "WebP support"**, which separates WebP and non-WebP in
  the cache.
- $0.01/GB (Europe/North America), minimum $1/month. European company.

**imgproxy**
- Designed to sit behind a CDN or a cache. It sends `public,
  max-age=31536000` (`IMGPROXY_TTL`). The documentation asks to include
  `Accept` in the cache key when format negotiation is used, which is our
  case.
- Internal cache in the Pro version only. Free local alternative: the Caddy
  `cache-handler` module (Souin, RFC-compliant, handles `Vary`), which needs a
  custom Caddy build.

## 5. Options

| | Option | Gain | A/B, rate limit, CSP | Cost / risk |
|---|---|---|---|---|
| **A** | Origin-side fixes only: `Cache-Control` on `assets.` (fonts) in Caddy; possibly a Souin cache in front of imgproxy | font revalidations gone; no more image reprocessing (Souin) | intact | very low; Souin = custom Caddy build |
| **B** | **CDN only on `img.` and `assets.`** (Bunny through CNAME, or Cloudflare with the `example.com` zone moved) | most of the pages' weight (images, fonts) served from the edge; no more imgproxy load | **intact**: page hosts do not change, and imgproxy/Garage do not use the visitor's IP | low; to settle: the `Accept` cache key and the origin hostname |
| **C** | Cloudflare in front of the pages too (proxy, no HTML cache) | DDoS/WAF protection, `/_next/static` at the edge | intact **if** the real IP is restored in Caddy, Rocket Loader/Email Obfuscation are off, and there is no HTML cache rule | medium: DNS of each client domain, certificates, `trusted_proxies`, CSP tests with Bot Fight Mode |
| **D** | Edge caching of HTML | minimal TTFB | **breaks** A/B and view counting as long as the nonce, the cookie and server-side counting exist | big project (CSP by hash or SRI, A/B at the edge, client-side counting): out of scope |

## 6. Scoping decisions (2026-10-09)

Answers to the questions of the first version of this note:

1. **Goal: withstand heavy traffic by design.** Not just speeding up images:
   a legitimate traffic spike must not depend on the VPS's capacity.
2. **Protection against attacks (DDoS/WAF) is needed**, on pages as on
   everything else.
3. **Replaced images**: either forbid reusing an address already used, or,
   better, be able to invalidate the cache of an image that overwrites
   another.

Consequences: option B alone is no longer enough, and option D (HTML cache)
becomes necessary again, since HTML rendered on every request on a single VPS
is precisely the bottleneck. Bunny drops out of scope: its protection against
attacks does not match Cloudflare's.

## 7. What prevents caching the HTML today

Three elements make each HTML response unique. They must be taken out of the
HTML for it to be shareable between visitors:

| Element | Where | Why it blocks | Lead |
|---|---|---|---|
| **CSP nonce** | `middleware.ts`, `code-context.ts`, `page-shell.tsx` (014 admin code) | a cached nonce is no longer a nonce; Next.js declares ISR and PPR incompatible with the nonce | **nonce injected at the edge** (§8.2) |
| **Form token** | `page.tsx:65` → `signFormToken(pageId, Date.now())`; checked with an age between 2 s and 2 h | HTML cached for more than 2 h carries an expired token: **no more leads at all**. The 2 s heuristic also loses its meaning | token fetched by the browser on load (small dynamic route) |
| **View counting** | `pingPageView` called during rendering | a page served from the cache no longer goes through the origin: views and A/B exposures are no longer counted | browser-side beacon (`sendBeacon`) without a cookie, or counting in the Worker |

And the **A/B test**, which chooses the variant on every request in the
middleware, must move in front of the cache (§8.3).

**Discarded leads for the CSP**
- **Next.js experimental SRI**: it protects JS files, but not the inline
  `self.__next_f.push(…)` scripts App Router injects into every page. It is
  therefore not enough for a strict CSP.
- **`'unsafe-inline'`**: a clear step back from 002-security-hardening, and
  the admin code (014) would no longer be controlled at all.

## 8. Proposed target architecture

### 8.1 Cloudflare in front of everything, origin locked
- `example.com` zone moved to Cloudflare (Free plan: nameservers
  moved, MX/Brevo DKIM/SPF copied).
- **Client domains**: Cloudflare for SaaS (100 hostnames included, then
  $0.10/month each). **But apex domains** (`client-site.example`)
  cannot take a CNAME at most registrars, and "apex proxying" is Enterprise
  only. Alternatives: the client's zone moved to Cloudflare (in our account),
  or `www.` as the main host with the apex redirected at the registrar. **To
  be decided.**
- **Origin reachable only through Cloudflare**: otherwise an attacker
  bypasses the CDN by targeting the IP. Caddy (or the VPS firewall) accepts
  only Cloudflare's ranges, plus Authenticated Origin Pulls (mTLS, free). The
  current IP 203.0.113.10 is public in the DNS history: plan to change it
  after the switch.
- `admin.` and `growthbook*` also go behind Cloudflare (otherwise the origin
  stays exposed). Their IP allow-list is then enforced by a WAF rule or
  Cloudflare Access, rather than by Caddy alone.
- Origin certificates: DNS-01 (`caddy-dns/cloudflare`) or Cloudflare Origin
  CA, with SSL set to "Full (strict)".
- Real IP in Caddy (`trusted_proxies` + `CF-Connecting-IP`), still useful for
  `/api/leads`. In addition, the free rate-limiting rule (1 rule, per IP,
  10 s window) goes on `/api/leads`.

### 8.2 HTML cached at the edge, nonce injected by a Worker
- The renderer produces HTML **identical for everyone**, with a fixed
  "placeholder" nonce.
- A **Cloudflare Worker** serves the HTML from the cache, generates a fresh
  nonce on every request, replaces it in the HTML (`HTMLRewriter`) and sets
  the matching CSP header. This is a documented technique (Scott Helme; same
  patterns at Akamai and for nginx). The strict CSP and the 014 admin code
  stay intact.
- **Invalidation**: the publish hook calls, in addition to `/api/revalidate`,
  the Cloudflare purge. Purge by tag, prefix or hostname has been available
  on every plan since April 2025; the renderer sets
  `Cache-Tag: page-<id>,domain-<id>`.
- Cost: Workers Paid $5/month for 10 M requests (the free plan caps at
  100 k/day, too tight for "heavy traffic"). The Worker runs only on page
  hosts, not on `img.` or `/_next/static`.

### 8.3 A/B test moved into the Worker
- The Worker reads the `tf-ab-<experimentKey>` cookie, draws if needed, sets
  the cookie and serves `/ab-variant/<id>` **from the cache** (one entry per
  variant, already planned by the 008 contract).
- The list of running tests comes from a JSON exposed by the origin and
  cached briefly (or pushed into Workers KV on each change).
- Views and exposures go through the browser beacon (§7).
- Risk: the draw logic then exists in two places (middleware for local dev,
  Worker in production). It needs a shared module (`@trefle/shared`) and
  shared tests, or a single path with the Worker simulated locally.
- More cautious variant for a first lot: **do not cache pages under test**
  (the origin serves them `no-store`, as today), and cache everything else.
  The current A/B stays untouched; in return, a page under test in a traffic
  spike stays on the VPS.

### 8.4 Images: version rather than purge
- imgproxy has a **`cachebuster` (`cb:`)** option, signed with the URL and
  without effect on processing. The renderer puts the media's version in it
  (`updatedAt` or a hash of the file): **when an image overwrites another,
  all its URLs change automatically**, everywhere (browsers and CDN), without
  a purge. This matches the "better" solution asked for, more robust than a
  purge.
- Pages using the image must then be revalidated and purged. That needs an
  `afterChange` hook on `media` that finds the pages concerned (the GrapesJS
  HTML contains the asset URL, or a "page ↔ media" table to create).
- Real purge (e.g. legal removal of an image): delete the S3 object, then
  purge by `img.` hostname (a radical but rare method), or by URL if the
  generated variants can be listed.
- Check how Payload behaves when the file of an existing media is replaced:
  does it reuse the same S3 key? (nothing clear in the documentation, to
  test).
- `Vary` Cache Rule on `img.` with `Accept` normalisation (`image/webp`), or
  WebP for everyone and no `Vary` at all. Polish off.

### 8.5 Fonts
Explicit `Cache-Control` on `assets.` (Caddy) and versioned URLs for domain
fonts (same principle as images).

## 9. Points to watch for the spec

- **Constitution**: the Worker is code running outside the declared stack
  (principle II), and the architecture describes "SSR with ISR" without a
  CDN. This needs at least a justification, probably an amendment of the
  Architecture section.
- **Split** (principle III, small reversible changes) suggested:
  1. Cloudflare as proxy + locked origin + real IP + images/fonts cached (no
     HTML cache);
  2. form token and view counting taken out of the HTML;
  3. Worker (nonce + HTML cache + purge) on pages not under A/B;
  4. A/B in the Worker.
- **Load tests**: define the target in numbers (e.g. N sustained
  requests/s, ×10 spike), and check it before and after.
- **Cloudflare plan**: Free + Workers Paid is enough to start; Pro ($20/month
  per zone) brings the full OWASP rule set and more rate-limiting rules. To
  decide according to the threat level.
- **GDPR**: Cloudflare is a US processor (legal notice and record to update).
  The view beacon stays cookieless.
- **Local dev and e2e**: the Worker must be able to run locally (Wrangler) or
  be bypassed cleanly, without breaking the existing Playwright specs.

## 10. Block A/B tests and the role of GrowthBook (2026-10-09)

Full analysis: `docs/ab-testing-exploration.md` §8. In short:

- **GrowthBook is not on the request path** in the shipped 008: definitions
  in Payload, draw by our `assignVariant`, statistics from `page-stats`.
  GrowthBook is an optional significance engine reading Postgres. Moving the
  draw into the Worker (lot 4) therefore does not affect it.
- **Block tests are compatible, and better served**: a single cached page
  containing all tagged variants; the Worker keeps the winning fragment
  (`HTMLRewriter`, same pass as the nonce). No cache explosion, no flicker,
  no client JS.
- **Constraints to carry into the specs:**
  - **Lot 2**: the browser beacon replacing `pingPageView` records *all* the
    page's exposures (key, variant, anonymous identifier from the `tf-ab-*`
    cookie, date) and leads keep the variants seen — `page-stats` cannot tell
    two fragments of the same page apart. It is also the format GrowthBook
    expects. Decide retention, legal basis and record (pseudonymous data).
  - **Lot 4**: generic A/B Worker (page rewrite **and** fragment
    selection); `assignVariant` and fragment selection in `packages/shared`,
    one code for renderer and Worker.
  - **Lot 1**: nothing to change (an image of a losing variant counts as
    used, on purpose).
- **Decision (2026-10-09): GrowthBook is kept** and will really be wired in
  lot 2 (Postgres source, exposure and conversion queries, significance shown
  next to the counts). Removing it was considered and rejected. 017 therefore
  keeps its two GrowthBook hosts protected.

## Sources

- Cloudflare, default cache behaviour: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- Cloudflare, Vary (every plan): https://developers.cloudflare.com/cache/concepts/vary/ and https://blog.cloudflare.com/vary-support/
- Cloudflare, Vary for Images (Pro+): https://developers.cloudflare.com/cache/advanced-configuration/serve-tailored-content/
- Cloudflare, partial setup (Business+): https://developers.cloudflare.com/dns/zone-setups/partial-setup/
- Cloudflare for SaaS, pricing: https://domainee.dev/blog/cloudflare-for-saas-pricing
- Cloudflare, JavaScript detections and CSP: https://developers.cloudflare.com/bots/additional-configurations/javascript-detections
- Cloudflare, cookies: https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
- Cloudflare, new terms of service: https://blog.cloudflare.com/updated-tos/
- Caddy behind Cloudflare (real IP): https://caddy.community/t/cloudflare-proxy-x-forwarded-for-client-ip-issue/25154
- Caddy behind Cloudflare (ACME): https://caddy.community/t/letsencrypt-error-when-caddy-is-behind-cloudflare/14100/6
- Next.js, CSP and nonce: https://nextjs.org/docs/app/guides/content-security-policy
- imgproxy, external cache: https://docs.imgproxy.net/cache/external
- Caddy cache-handler (Souin): https://github.com/caddyserver/cache-handler
- Bunny, pricing and Vary Cache: https://docs.bunny.net/cdn/pricing and https://docs.bunny.net/cdn/vary-cache
- Cloudflare, purge for every plan: https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/
- Cloudflare, free rate limiting: https://blog.cloudflare.com/unmetered-ratelimiting/
- Cloudflare for SaaS, apex proxying (Enterprise): https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/setup/
- CSP nonce injected by a Worker: https://scotthelme.co.uk/csp-nonces-the-easy-way-with-cloudflare-workers/
- Next.js App Router, inline scripts and SRI: https://dev.to/0xdbe/nextjs-consequence-of-approuter-on-your-csp-839
- imgproxy, cachebuster option: https://github.com/koenpunt/imgproxy/blob/master/docs/generating_the_url_advanced.md

## 11. Study of edge HTML caching (2026-10-11)

Question asked: can page HTML be cached at Cloudflare, to increase the number
of pages served per second, **without losing any feature**? This section
revisits §7–§8 with the current code (after 017) and up-to-date Cloudflare
documentation, and replaces the split into lots 2–4 with a single feature,
**020**.

### 11.1 Measured starting point

Load test of 2026-10-10 (`infra/loadtest/results/`): the VPS **saturates at
~26 pages/s** (p95 ≈ 20 s), before as after going behind Cloudflare. The
programme's goal is 1,000 sustained pages/s, with spikes at 10,000/s. Only
HTML caching can close this gap: the origin then renders about one page per
published page, per cache tier and per cache lifetime.

### 11.2 Verdict

**Feasible without losing any feature, on one condition: a Cloudflare Worker
personalises each response served from the cache.** A simple "Cache
Everything" rule would break the CSP, leads, A/B and view counting. The
Worker therefore runs on every view; it is what costs money (§11.7), not the
counting.

### 11.3 What makes each response unique, and how it is handled

| Element | Where | Handling chosen |
|---|---|---|
| **CSP nonce** | `middleware.ts`, Next's scripts, admin code (014), **and the `nonce` prop of `ConsentCodeRunner`, serialised in the RSC payload** | The origin renders with a fixed dummy nonce; the Worker replaces it with a fresh nonce **throughout the body** (streaming text replacement, not only attributes: otherwise hydration restarts with the dummy) and sets the CSP header. |
| **Form token** | `page.tsx` → `signFormToken` (accepted age 2 s–2 h) | **The Worker signs the token** (HMAC-SHA256 through WebCrypto, same format, same secret). `verifyFormToken` does not change and **the form still works without JavaScript**. Replaces the §7 lead ("token fetched by the browser"), which would have lost the no-JS mode (constitution, principle V). |
| **View counting** | `pingPageView` on every render | The Worker writes a data point to **Workers Analytics Engine**; a job every minute adds them up and calls `incrementPageStat(…, by = N)`. See §11.6. |
| **A/B** (`tf-ab-*` cookie, rewrite) | middleware | The Worker reads or sets the cookie and serves `/ab-variant/<id>` **from the cache** (one entry per variant). The list of tests comes from an origin JSON, cached 30 s and purged when a test changes. Draw in `packages/shared`, one code. |
| **Origin "edge" mode** | middleware | With a secret header set by the Worker: dummy nonce, no A/B, no `Set-Cookie`. **Without this header, current behaviour unchanged**: dev, e2e, and fallback if the Worker fails (`passThroughOnException`). |

Everything else is already identical for everyone: cookie banner read
client-side, GTM and `dataLayer` fixed per page, fonts and media aliases. UTMs
are read by `/api/leads` from the `Referer`, not by the page.

### 11.4 Which cache: the zone's, not "Workers Caching"

- **Workers Caching** (the Worker's own cache) is **unusable**: on a hit, the
  Worker does not run (so no nonce or token), and its cache key **ignores the
  hostname** (`/` of two client domains would get mixed up).
- **Zone cache, through the Worker's `fetch()` to the origin**: the host is
  part of the key, Cache Rules apply, purge by `Cache-Tag` works on Free, and
  so does Smart Tiered Cache. The origin sets
  `Cache-Tag: page-<id>,domain-<id>`.
- `*/*` route on the zone (required for Cloudflare for SaaS client hosts),
  with routes **without the Worker** for `admin.`, `growthbook*`, `img.`,
  `assets.` and `*/api/*` (real IP and rate limit unchanged).

### 11.5 Pitfalls identified

1. **Next RSC requests** (`RSC` header, `_rsc` parameter): same URL,
   different content, and Cloudflare ignores `Vary`. Always bypassed,
   otherwise RSC payload would be served as HTML.
2. **Deployment**: each build changes the names of the `/_next/static`
   chunks; HTML left in the cache would point to JS files that no longer
   exist. `release.sh` purges the page hosts after each deployment.
3. **Replacing a media**: the old object is deleted at once (017). The
   Cloudflare purge happens in the same hook as `/api/revalidate`, otherwise
   an image stays broken until the TTL expires.
4. **Not cached**: `/api/*`, `/preview`, `/confirm`, `/confirmation`,
   `/unsubscribe`, `/form-retry`, any method other than GET/HEAD, 5xx, unknown
   hosts. 404s are cached briefly, with the domain's tag (a publication purges
   them).
5. **Existing bug**: `incrementPageStat` does a find then an update, not
   atomic; simultaneous views are already lost today. Batched increments
   (§11.6) fix it along the way.
6. **Side gains**: the Worker removes `x-middleware-rewrite` (which reveals
   the variant's id, FR-006 of 008); the cache can serve a stale version if
   the origin goes down.

### 11.6 Counting: views and A/B exposures

**Views (`page-stats` counters) — decided**: Workers Analytics Engine + a job
every minute. The admin's counters lag by up to ~1 min, with no consequence
(a test is read over days; a lead may briefly precede its view). At very
high volume, Analytics Engine samples: totals stay right (weighted by
`_sample_interval`) but become very precise estimates rather than exact
counts.

**A/B exposures for GrowthBook (018) — decided**:
- GrowthBook computes visitor by visitor: a lost exposure takes a converted
  visitor out of the experiment and skews the verdict. Analytics Engine,
  sampled, **does not suit** this data.
- The Worker sends exposures to a **Cloudflare queue (Queues)**, losslessly;
  a consumer sends them to the origin **in batches**, one SQL insert per
  batch.
- **Only a visitor's first exposure** to a test is recorded (the one
  GrowthBook uses): the volume follows unique visitors of pages under test,
  not views.
- Lead attribution stays at the origin: `/api/leads` reads the cookies.

**Discarded leads**:
- *Calling the origin on every view*: the VPS would work on every view again,
  to save one minute of delay.
- *Writing into GrowthBook's Mongo database*: it holds only its configuration
  and results; GrowthBook reads exposures from our Postgres, through SQL.
  Grouping is done on our side (batches).
- *GTM tag*: blocked by ad blockers (missing views, inflated conversion
  rates), absent from domains without a container and dependent on the
  client, and a third party (Google) loses 018's CNIL exemption.

### 11.7 Cost (Workers Paid, approved)

| Item | Included | Beyond |
|---|---|---|
| Worker (runs on every view) | 10 M requests, 30 M CPU ms / month | $0.30 / M requests + ~2 ms CPU → **~$0.35 / M views** |
| Analytics Engine (views) | 10 M data points / month *(to confirm)* | ~$0.25 / M *(to confirm)* |
| Queues (exposures) | 1 M operations / month (~330,000 exposures) | ~$1.20 / M exposures |

Base: $5/month. Example: 30 M views/month ≈ $12/month. Counting adds a few
cents per million views, often zero.

### 11.8 Split: feature 020

Lots 2–4 become a single feature, **020-edge-html-cache**, delivered in
reversible slices (constitution, principle III):

1. origin "edge" mode (dummy nonce, without A/B) and batched view intake;
2. Worker (nonce, signed token, Analytics Engine, zone cache, purge on publish
   and deploy), pages under test still `no-store`;
3. A/B in the Worker, exposures through the queue; then load tests at
   1,000/s and 10,000/s.

A constitution amendment ("Edge" bullet) comes with the slice that caches the
HTML.

### 11.9 What the implementation changed (020, 2026-10-12)

In production on every host since 2026-10-12 (`edge-on.sh live`).
Differences and checks compared with this study:

- **Routes**: Cloudflare does accept host-less exclusions (`*/_next/*`,
  `*/api/*`, `*/favicon.ico`, …) next to `*/*`. They are created before `*/*`
  and removed after it, so that no excluded request goes through the Worker
  during a change (`worker-routes.sh`).
- **"Pages: never HTML" cache rule**: it does not stop the Worker from
  caching pages; no change to `cache.json`.
- **One-version lag (fixed)**: Next's `"max"` revalidation served the old
  data on the first request after a change — the Worker's, right after the
  purge, which then kept the old page for a day. The renderer now expires
  each tag immediately (`{ expire: 0 }`).
- **Form token**: a random segment is added to the token signed by the Worker
  (two visits in the same millisecond had the same token); the renderer
  accepts it unchanged.
- **A/B**: no internal header reveals the variant any more
  (`x-middleware-rewrite` remains visible on the classic path).
- **Measurements**: 1,000 views/s on the test host with a single render at
  the server (p95 55 ms); view counting exact to 0.06 % within 2 min;
  publication visible in 1 to 3 s; A/B split 50.15/49.85 % over 9,926
  visitors; fallback checked (Worker down, routes cut, renderer stopped 44 s
  without interrupting cached pages).
- **CPU per view**: not measured yet; to read on the first invoice (§11.7,
  T067).
