# Quickstart: validate the post-launch fixes

This guide proves each item in [spec.md](./spec.md) end to end on the local
stack. It assumes the stack is already runnable per the repo
[README](../../README.md) / 001's
[quickstart.md](../001-landing-page-lead-capture/quickstart.md) — it does not
repeat first-time setup. It is a validation guide only; implementation
belongs in `tasks.md`.

## Prerequisites

- The local Docker stack up and seeded (see 001's quickstart), or the host
  hot-reload setup — either way, `admin.trefle.localhost:3000/admin` and
  `site-a.localhost:3001` reachable.
- For Phase 1/4 (IP allow-list, X-Real-IP), the **prod overlay**
  (`infra/docker-compose.prod.yml` + `infra/deploy/Caddyfile`) is what
  actually exercises Caddy — the plain dev stack doesn't run Caddy in front,
  so those two scenarios are validated with
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config`
  (renders correctly) plus a local Caddy run if available, not the everyday
  dev loop.

## 1. X-Forwarded-For no longer bypasses rate limiting

```bash
for i in 1 2 3 4 5 6 7 8 9 10 11; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "X-Forwarded-For: 203.0.113.$i" \
    -X POST http://site-a.localhost:3001/api/leads \
    -d "pageId=<seeded-page-id>&email=test@example.com&consent=on&formToken=<token>"
done
```

Expected: once the trusted per-connection identity (not the spoofed header)
crosses 10 requests/minute, subsequent calls return `429` regardless of how
`X-Forwarded-For` is varied per request.

## 2. Reflected content is escaped / editor HTML is sanitised

- Submit the lead form with a field value like `<img src=x onerror=alert(1)>`
  in a text field that gets echoed on a validation error; confirm the
  rendered error page shows the literal text, not a broken/executing tag.
- In the admin, add a block whose custom HTML/attributes include a `<script>`
  tag or an `onclick` handler; publish; load the public page and confirm (via
  browser dev tools / view-source) neither executes or appears in the
  rendered DOM, while the rest of the block's real content still renders.

## 3. Preview links expire

- In the admin, open a page's preview link; confirm it loads.
- Re-run the equivalent of `signPreviewToken`/`verifyPreviewToken`'s unit
  test with a token minted >24h in the past (or temporarily shorten the
  window in a local env var if one is introduced) and confirm it now 404s.

## 4. Admin login is IP-restricted (prod overlay only)

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config | grep -A3 remote_ip
```

From an address inside `ADMIN_ALLOWED_IPS`: the login page loads normally.
From outside: `403` before any Payload code runs.

## 5. Rate-limit store stays bounded

Run the existing rate-limit unit tests (extended per Phase 5) with a burst of
thousands of distinct synthetic IPs/emails; assert the store's key count
never exceeds its configured cap.

## 6. Body-size limit is 500 KB and documented

```bash
grep -n "fieldSize" apps/cms/src/payload.config.ts
grep -n "bodySizeLimit" apps/cms/next.config.mjs
```

Both show `500 * 1024` / `"500kb"`. Save the heaviest seeded page in the
admin — succeeds. Pad a page's blocks well past 500 KB of JSON — fails with a
clear error, not a 500.

## 7. Editing a published page republishes reliably

```bash
PAGE=<a published page's public URL>
curl -s "$PAGE" | grep "<old heading text>"
# edit the page's heading in the admin, save
sleep 10
curl -s "$PAGE" | grep "<new heading text>"
```

Expected: the new heading appears within 10 seconds (SC-002), without any
action beyond the save. Repeat
~20 times per SC-002. To exercise the retry path, briefly stop the `web`
container mid-save and confirm the CMS logs an `error`-level line naming the
page/tags after exhausting retries, and that a subsequent unrelated save (or
the retry itself, once `web` is back) still gets the page live.

## 8. Confirmation page + unsubscribe link

- In the admin, set landing page A's `confirmationPage` to page B (an
  ordinary published page containing the text `{{unsubscribeUrl}}`
  somewhere in a block).
- Submit page A's lead form as a visitor; confirm the response renders page
  B's content, with `{{unsubscribeUrl}}` replaced by a working, clickable
  unsubscribe link that (per 001's existing contract) withdraws consent.
- Submit a different landing page with no `confirmationPage` set; confirm the
  existing generic "Merci..." message still appears.

## 9. Domain/`www` default page

- Register two local test domains (or reuse `site-a.localhost` /
  `site-b.localhost`) with **no** page at `/`.
- Set both domains' `notFoundPagePath` to an existing page's `path`.
- Visit each domain's root path; confirm both render that page, not a 404.
- Visit a path that has a real page assigned; confirm the real page still
  wins over the fallback.
- Visit an unregistered hostname; confirm it's still a 404.

## 10. GrapesJS starter template + admin branding

- Create a new page in the admin; confirm the block editor opens already
  populated (not a blank canvas) and includes one lead-form block
  (`builder.blockCount.leadForm === 1` visible in the admin/API).
- Publish it unedited; confirm it passes the existing publish guard.
- Log out and view `/admin/login`; confirm no stock Payload logo appears.

## Full regression

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e:docker
```

All green, matching 001/002's exit bar — this feature adds fixes and small
surface area, not a new subsystem, so the existing suite is the primary
regression gate.
