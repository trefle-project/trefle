# Contract: the origin's edge rendering mode

How the renderer (`apps/web`) answers a request from the edge Worker versus
any other request. Research: R3, R4, R6, R9, R10.

## Switch

| Request | Mode |
|---|---|
| Header `X-Trefle-Edge` equal (constant-time) to `EDGE_SECRET` | **edge** |
| Header absent, wrong, or `EDGE_SECRET` unset | **legacy** (today, unchanged) |

Middleware removes `X-Trefle-Edge` from the request before rendering and, in
edge mode, adds the internal request header `x-trefle-edge-render: 1`
(overwritten on every request, so a client cannot set it).

## Legacy mode

Byte-for-byte today's behaviour: random nonce, signed form token, A/B
rewrite and cookie, `pingPageView`. Used by local dev, e2e, the Worker's
pass-through and fallback, and everything when the `*/*` route is removed.

## Edge mode

| Aspect | Behaviour |
|---|---|
| Nonce | `TFEDGENONCE000000000000000000000` in the request CSP header, `x-nonce`, and the response `Content-Security-Policy` (policy text otherwise identical to legacy) |
| Form token | `LeadForm` gets `TFEDGEFT<pageId>X` instead of `signFormToken()` |
| View counting | `pingPageView` **not** called |
| Page identity | `PageShell` emits `<meta name="tf-page" content="<pageId>">` (both modes; harmless in legacy) |
| A/B | no bucketing, no cookie; if `getRunningTestFor(domain, path)` returns a test → respond **200, empty body**, `X-Trefle-AB: <experimentKey>;<ids comma-separated>;<domainId>` |
| `/ab-variant/<id>` | rendered normally (edge mode rules above) |
| Cookies | the response never carries `Set-Cookie` |
| Cache tags | `Cache-Tag: html,domain:<domainId>` when the host resolves to an active domain; `Cache-Tag: html` otherwise |
| Everything else | identical to legacy (status codes, `notFound()` fallback page, metadata, tagging, banner, custom code) |

## Edge ingest routes (renderer)

`POST /api/edge/views` and `POST /api/edge/exposures` — see
[edge-ingest.md](edge-ingest.md). Not affected by the mode switch (they are
under `/api/*`, never routed through the Worker).

## Tests (apps/web)

- secret match → placeholder nonce in both CSP headers and `x-nonce`; no
  `Set-Cookie`; `Cache-Tag` present.
- secret mismatch / absent → legacy (random nonce, cookie on a tested path).
- tested path in edge mode → empty 200 with a parsable marker.
- page in edge mode → form token placeholder, no `pingPageView` call.
