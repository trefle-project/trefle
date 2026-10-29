# Contract delta: default landing experience via `notFoundPagePath`

Base: `specs/001-landing-page-lead-capture/data-model.md`'s `domains`
collection already declares `notFoundPagePath` ("optional path to serve for
unmatched paths on this host"); `apps/web/src/lib/payload-client/index.ts`'s
`Domain` interface already returns it. No 001 contract document ever wired a
consumer to it — this delta adds one to
`apps/web/src/app/[[...slug]]/page.tsx`.

## Behaviour (renderer, `GET` of any path under an active domain)

1. Resolve the request's `Host` to an active `Domain` (unchanged — an
   unregistered/inactive host still not-found, per FR-017).
2. Look up a published page at the requested `path` (unchanged lookup:
   `getPublishedPage(domain.id, path)`).
3. **New**: if that lookup returns nothing, **and** `domain.notFoundPagePath`
   is set **and** differs from the requested `path`, look up a published
   page at `domain.notFoundPagePath` on the same domain and serve it instead
   of not-found.
4. If step 3 also finds nothing (unset, or the configured path itself has no
   page), fall back to not-found — unchanged from today.

A real page at the requested path always takes precedence over the fallback
(step 2 runs first; step 3 only runs on a miss) — FR-015.

## Cache tags

The fallback lookup uses the same `getPublishedPage` helper as any other page
fetch, so it carries the same `page:<id>`/`domain:<id>`/`page-list` tags
already defined in `revalidation.md` — no new tag, no new invalidation rule.
Changing which page a domain's `notFoundPagePath` points at, or editing that
page, revalidates exactly like editing any other page.

## Example

`domaine.com` and `www.domaine.com` are each registered as their own
`Domain`. Neither has a page at `/`. Both have `notFoundPagePath` set to
`/default`, and a published page exists at `(domaine.com, /default)` and
`(www.domaine.com, /default)` respectively (or, if both domains happen to
share the same underlying workspace page assignment, whatever `path` the
operator chose per domain — `notFoundPagePath` is per-`Domain`, not shared
automatically). Visiting either host's root now serves that page instead of
404.
