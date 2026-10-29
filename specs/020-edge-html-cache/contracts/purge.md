# Contract: edge cache purge

When and how cached page copies are dropped. Research: R9.

## Tags carried by cached copies

`html` (every cached page, variant, marker and "not found") and
`domain:<domainId>` (when the host resolves to a domain).

## From content changes — `POST /api/revalidate` (renderer, existing)

After the existing `revalidateTag()` loop, the renderer maps the received
tags to edge tags (`edgeTagsFor()` in `@trefle/shared`) and queues them for
purge:

| Received tag | Edge purge |
|---|---|
| `domain:<id>` | `domain:<id>` |
| `page:<id>`, `page-list` | none (the page hook always also sends `domain:<id>`) |
| `ab-tests`, `ab-test:<id>` | none (the experiments hook now also sends `domain:<id>`, see below) |
| anything else (`settings`, `media-aliases`, `domain:host:*`, …) | `html` |

Experiments hook change: it also sends `domain:<id of the control page's
domain>`, so a test start, stop or promotion purges only that domain. An
unknown tag always falls to `html`: a new tag added later can only
over-purge, never leave stale pages.

**Coalescing**: tags are collected for 1 s, de-duplicated, and sent as one
request: `POST https://api.cloudflare.com/client/v4/zones/<CLOUDFLARE_ZONE_ID>/purge_cache`
`{ "tags": [...] }` (≤ 100; `html` alone if present, since it covers
everything). Bearer `CLOUDFLARE_PURGE_TOKEN`.

**Errors**: 429 or 5xx → retry with exponential backoff (1 s, 2 s, 4 s … up
to 60 s total); final failure → `log.error("edge purge failed", { tags })`.
`/api/revalidate` answers the CMS as today (purge is not awaited by the
webhook response), so the CMS retry logic is unchanged. Missing
`CLOUDFLARE_PURGE_TOKEN` (dev, e2e) → purge skipped with a debug log.

**Fresh data before the edge refills (found 2026-10-12, quickstart V7)**: the
renderer expires every received tag with `revalidateTag(tag, { expire: 0 })`,
never `"max"`. With `"max"` (stale-while-revalidate) the first request after a
change is served the previous data — and that first request is the edge
refilling its copy right after the purge, which then kept the previous version
for a day: every publish appeared one version late.

**Media replacement order (FR-010)**: the `media-aliases` tag is revalidated
with `expire: 0` first (existing), then `html` is purged — the next render
reads the fresh alias map.

## From deployments — `infra/deploy/release.sh`

Last step, after the new containers are healthy (and on rollback too):
purge `{ "tags": ["html"] }` with `CLOUDFLARE_PURGE_TOKEN` from
`infra/.env`; failure stops the script with the command to re-run.

## Manual

`infra/cloudflare/purge-pages.sh [domain:<id>|html]` from an operator machine
(uses the existing zone token).

## Limits

Free plan, per account: 5 purge requests/minute, bucket 25, ≤ 100 tags per
request. Repeated 429s in the logs are a documented trigger for the Pro plan
(017).
