# Quickstart: validating the edge HTML cache

Runnable checks that prove 020 works. Contracts:
[edge-worker](contracts/edge-worker.md), [origin-edge-mode](contracts/origin-edge-mode.md),
[purge](contracts/purge.md), [edge-ingest](contracts/edge-ingest.md).

## Prerequisites

- Slice 1 deployed (origin edge mode, batch view intake); `EDGE_SECRET`,
  `CLOUDFLARE_PURGE_TOKEN`, `CLOUDFLARE_ZONE_ID` in the VPS `infra/.env`.
- Workers Paid enabled; `infra/cloudflare/secret.env` has
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_TOKEN`.
- Worker deployed (`npm run deploy --workspace @trefle/edge`) and routes
  applied (`infra/cloudflare/apply.sh`).
- A published test page `/loadtest` on `example.com` with the lead
  form and 3 images (017 load tests); a second domain for V3.
- `PAGE=https://example.com/loadtest`.

## V1 — Routing

Request a page, a `/_next/static/` file, `/api/vitals`, an image on `img.` and
the admin host. Only the page carries `x-trefle-edge-served: 1` (added by the Worker,
contract §2). Confirms the path-only no-Worker routes are accepted
(R13).

## V2 — Cache hit and per-visit values

```bash
for i in 1 2 3; do curl -s -D - -o /tmp/p$i.html "$PAGE" | grep -iE 'cf-cache-status|content-security-policy|cache-control|set-cookie'; done
grep -o 'nonce="[0-9a-f]*"' /tmp/p2.html | sort -u
grep -o 'name="formToken" value="[^"]*"' /tmp/p2.html /tmp/p3.html
grep -c TFEDGE /tmp/p1.html /tmp/p2.html /tmp/p3.html
```

Expected: `cf-cache-status: HIT` from the second request; a different nonce
in each CSP header and in each page (one value per page); different form
tokens; `Cache-Control: private, no-store`; no `Set-Cookie`; `TFEDGE` count 0.
Same check with `?utm_source=x&gclid=y` → still `HIT` (FR-002).

SC-005 — 1,000 responses, all values distinct:

```bash
for i in $(seq 1000); do curl -s "$PAGE" | grep -oE 'nonce="[0-9a-f]{32}"|name="formToken" value="[^"]*"' | sort -u; done > /tmp/vals.txt
grep -c nonce /tmp/vals.txt; grep nonce /tmp/vals.txt | sort -u | wc -l
grep -c formToken /tmp/vals.txt; grep formToken /tmp/vals.txt | sort -u | wc -l
```

Expected: 1000 / 1000 for nonces and for tokens.

## V3 — Separate copies per host

Same path on two domains → two different pages, each `HIT` after warm-up.

## V4 — Lead form, with and without JavaScript

Run the e2e `edge` project (`us1-capture` no-JS and JS flows) against
production through the Worker, or by hand: load `$PAGE`, wait 3 s, submit →
confirmation page; submit within 1 s → refused as today; a token older than
2 h → "page expired" as today.

> **2026-10-12, test host** (`edge-check`, page 61, curl): submit right after
> loading → 422 « Merci de réessayer dans quelques secondes »; after 3 s → 200
> « Merci » (the renderer accepts the salted token signed by the Worker).
> Locally, the whole e2e suite through the Worker (`npm run
> test:e2e:docker:edge`, `us1-capture` JS and no-JS, `edge-parity`) passed.
> The 2-hour expiry was not re-run: `verifyFormToken` is unchanged.

## V5 — Security policy and custom code

On a page with « Essentiel » and « Nécessite le consentement » code (014) and
a GTM container (007): DevTools shows no CSP violation; essential code runs at
load; consent code runs after « Accepter » without reload; `dataLayer`
contains `page_view` (and `lead_form_view` on form pages).

> **2026-10-12, test host**: headless Chromium on `edge-check/loadtest` (`HIT`,
> served by the Worker): no CSP violation, 11 scripts carry the nonce, the page
> hydrates. `edge-check` has no GTM container or custom code, so those parts
> were checked locally through the Worker (`gtm-consent`, `us14-custom-code`
> specs in the `edge` run): passed.

## V6 — Never cached

`/preview/<id>?token=…`, `/unsubscribe?token=…`, `/confirm?token=…`, the
form-retry page, a POST, and a request with header `RSC: 1` → no
`cf-cache-status: HIT`, behaviour as today; the `RSC: 1` answer is never
served to a plain GET afterwards.

> **2026-10-12, test host**: `/preview/61?token=x`, `/unsubscribe?token=x`,
> `/confirm?token=x`, `/form-retry`, a POST and an `RSC: 1` request → not
> served by the Worker, `cf-cache-status: DYNAMIC`; the next plain GET → the
> HTML page, `HIT`.

## V7 — Freshness

1. Change a visible text on `/loadtest`, save → a fresh `curl` shows it
   within 30 s (repeat 10 times for SC-006).
2. Unpublish → "not found" within 30 s; republish → back within 30 s.
3. Replace an image file used on `/loadtest` → page shows the new image, no
   broken image at any point.
4. Change the domain's banner text → visible within 30 s.
5. `release.sh` with a new tag → the page's `/_next/static/` URLs all match
   the new build (compare with `docker compose exec web ls .next/static`).

> **2026-10-12, test host** (`edge-check`, page 61; page polled every 2 s,
> compared with the renderer's `revalidated` / `edge purged` log lines).
> First series (release `020.3-purge`): **failed** — every publish showed the
> previous version. Cause: `revalidateTag(tag, "max")` serves stale data to the
> first request after a change, and that request was the edge refilling its
> copy right after the purge. Fixed in `020.4-revalidate-expire`
> (`{ expire: 0 }` for every tag, contracts/purge.md).
> Second series (`020.4`): 10/10 publishes (V13–V22) showed **their own** title
> 1–3 s after the publish (purge ≈ 1.1 s after the publish); 2 media
> replacements → `html` purged, page re-rendered with the new image within
> 2 s; banner text change in Settings → visible after 1.5 s; enabling the
> banner on the domain → 1.2 s. After the release purge: first request
> `MISS`, the page's 11 script and style files all 200, the page carries the
> live build id. Known gap, not 020: the GrapesJS editor keeps showing a
> replaced image (it does not apply the alias map) — public pages are right.

## V8 — Counting

Note the page's `page-stats` views for today. Send exactly 5,000 requests
through the edge (k6, 50/s). After 3 minutes, views increased by 5,000 ±1 %
(SC-007). The VPS access log shows one `/api/edge/views` per minute, not one
call per view.

> **2026-10-12, test host** (release `020.5-edge-views`, Worker redeployed):
> 4,996 page views from a Hetzner CPX32 (k6, 250/s, 13:06:31–13:06:52 UTC,
> 100 % `HIT` from the Worker) plus 3 check views → page 61's `page-stats`
> row for the day: **5,002 views** (+3 other visits, 0.06 %), updated at
> 13:08:14 UTC, i.e. < 2 min after the views. The Worker posted
> `/api/edge/views` once a minute (13:06:14, 13:07:14, … all 200); each
> window was re-sent up to 10 times and counted once. The same row's
> `submissions` (lead intake) was unaffected.

## V9 — A/B at the edge

Start a 50/50 test on `/loadtest`.
1. 10,000 fresh visitors (k6, no cookie jar) → each variant 48–52 % (count
   the variant marker text in the bodies) (SC-008).
2. A returning visitor (cookie jar) keeps the variant over 20 requests.
3. Both variants `cf-cache-status: HIT` after warm-up; no response header
   contains `X-Trefle-AB`, `x-middleware-rewrite` or a page id.
4. Conclude the test → within 30 s every visitor gets the outcome page.

> **2026-10-12, test host** (release `020.6-edge-ab`; page 61 vs variant 62):
> 9,926 new visitors from a Hetzner CPX32 (`infra/loadtest/ab.js`, no
> cookies): 50.15 % original / 49.85 % variant, 0 errors, every response from
> the Worker with a variant cookie and no internal header, p95 141 ms; 7
> requests reached the server. Cookie kept over 10 reloads. Conclusion → every
> visitor on the original 4.4 s later. Details:
> `infra/loadtest/results/2026-10-12-020-ab-edge.md`.

## V10 — Exposures (only once 018 is live, `EXPOSURES=on`)

Visit a tested page with a fresh browser → one exposure row after ≤ 5 min;
reload 10 times → still one; with the objection cookie → none; with a crawler
user agent → none.

## V11 — Fallback and switch-off

1. Set the Worker variable `MODE=fail` (contract §8) → pages,
   form and A/B work as today (legacy mode), `cf-cache-status` absent.
2. `infra/cloudflare/edge-off.sh` → same, instantly; `edge-on.sh` → back to
   `HIT` (FR-023).
3. Local `npm run compose:up` + the full e2e suite → green without the Worker
   (FR-022).
4. On the test host, warm the page, then stop the renderer
   (`docker compose … stop web`) → the cached page is still served (`HIT`),
   a never-cached path errors as today; restart `web` (FR-004).

> **2026-10-12, test host** (`edge-check/loadtest`, polled every 3 s together
> with an uncached page and the real site):
> 1. `MODE=fail` (`wrangler deploy --var MODE:fail`): every page served by the
>    server through the fallback — 200, `DYNAMIC`, the renderer's own nonce,
>    form present, no placeholder; no error during the switch. Back with a
>    plain `wrangler deploy`.
> 2. `edge-off.sh`: within seconds the page is `DYNAMIC`, no
>    `x-trefle-edge-served`, the renderer's nonce; `edge-on.sh test`: `HIT`
>    from the Worker again.
> 3. Locally, the whole e2e suite without the Worker: green (US2, T030).
> 4. Renderer stopped 13:40:58–13:41:42 UTC: the cached page kept answering
>    200 `HIT`; an uncached page and the real site answered 502, as today
>    (FR-004). Real sites were down ~45 s (accepted for the drill).

## V12 — Load (SC-001 to SC-003)

```bash
docker run --rm -v "$PWD:/s" -w /s -e BASE_URL=https://example.com -e PAGE_PATH=/loadtest -e RATE=1000 -e DURATION=10m grafana/k6 run --summary-export results/$(date +%F)-020-pages-1000.json pages.js
```

From `infra/loadtest/`, on a machine (or k6 Cloud) with enough bandwidth;
10,000/s for 1 min from a distributed generator. Expected: p95 < 1 s, 0 %
errors; the Caddy access log shows fewer than 50 renders of `/loadtest`
during the 1,000/s run; leads submitted during the run all accepted.

> **2026-10-12, real host after go-live**: 599,983 page views on
> `example.com/loadtest` in 10 min (999.9/s) from a Hetzner
> CPX32: 0 errors, p95 45 ms, 0 renders of the page at the server (16 page-host
> requests in all, 11 of them view batches). SC-001 and SC-003 met; SC-002
> (10,000/s, distributed) not run. Details:
> `infra/loadtest/results/2026-10-12-020-pages-1000.md`.
