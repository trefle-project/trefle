# Contract: request-time bucketing and caching

This is the feature's one genuinely new *runtime* contract — not an API in
the REST sense, but a fixed behavior `apps/web/src/middleware.ts` and
`apps/web/src/app/ab-variant/[pageId]/page.tsx` must jointly guarantee, since it
is what FR-005, FR-006, FR-016, FR-017, and FR-018/SC-008 depend on.

## Request flow for a page with no running test

Unchanged. `middleware.ts`'s active-tests lookup (research.md §2) returns
nothing for this path; the request proceeds through `[[...slug]]/page.tsx`
exactly as today — zero added latency, zero new cache entries. This is the
default for the overwhelming majority of requests at any given time.

## Request flow for a page with a running test

| Step | Component | Behavior |
|---|---|---|
| 1 | `middleware.ts` | Looks up whether the request's (domain, path) has a running test (cached, research.md §2). If not, falls through unchanged. |
| 2 | `middleware.ts` | Reads the sticky bucket cookie (`tf-ab-<controlPageId>`). If absent, computes a variant via `bucket.ts`'s deterministic hash and sets the cookie (FR-005). If present and still valid for this test, reuses it — this is what makes a returning visitor's assignment stable (FR-005, SC-005). If GrowthBook's own definition of the test is unreachable/errored, skip bucketing entirely and let the request fall through to serve the control unchanged (FR-016). |
| 3 | `middleware.ts` | `NextResponse.rewrite()`s the request to `/ab-variant/<assignedVariantPageId>` — an internal rewrite; the browser's address bar and every subsequent link/form action on the page still show the original URL (FR-006). No `redirect()` is used anywhere in this flow. |
| 4 | `ab-variant/[pageId]/page.tsx` | Renders using only `params.pageId` — reads the assigned page's `builder`/`form`/`seo` and renders through the same `PageShell`/`splitAroundForm`/`sanitizeHtml` pipeline `[[...slug]]/page.tsx` already uses. No `cookies()`/`headers()`/`searchParams` access anywhere in this route (research.md §1) — it is an ordinary ISR-cacheable route, one cache entry per distinct `pageId`. |
| 5 | GrowthBook (async, off the request path) | Receives an exposure event for the assigned variant, independent of step 4's render — never blocks the response. |

## Guarantees this contract must hold (verified in quickstart.md)

- **FR-005 / SC-005**: the same visitor (same cookie) requesting the same
  URL during the same running test always resolves to the same
  `ab-variant/<pageId>` target.
- **FR-006**: the address bar, canonical URL, and form `action` targets
  never reveal `ab-variant/` or the variant's page id — verified live.
  **Known residual gap**: Next's own `x-middleware-rewrite` response header
  does carry the rewritten path. Found live that this header is not
  cosmetic — it's what `next start`'s own dispatcher relies on to actually
  fetch/render the rewrite target in this Next.js version; deleting it
  produces a 200 with every other header and cookie correct but a
  permanently empty body. No known way to scrub it without breaking the
  rewrite itself, so it's accepted rather than hidden: a visitor would need
  browser dev tools open and the specific knowledge to check this one
  response header to read the variant id off it — the actual visible
  experience (URL, content, links) never tells them anything.
  **Second known residual gap**, same treatment: App Router's own RSC
  "flight" hydration payload — embedded in every page's initial HTML,
  unconditionally, not something this feature adds — includes the matched
  route's own segment tree, so a bucketed response's payload contains the
  literal string `"ab-variant"` plus that response's own page id. The page
  id itself was never secret (every page already ships it in a hidden
  `pageId` form field for lead intake); what's newly readable via View
  Source is proof that *this* response specifically came from the rewrite
  target. Avoiding it would mean not using a route param at all
  (`headers()`/`cookies()` instead), which research.md §1 already rejected
  for FR-018's independent per-arm ISR caching — not revisited here for the
  same reason. See `apps/web/src/app/ab-variant/[pageId]/page.tsx`'s header
  comment.
- **FR-012 / SC-006**: `ab-variant/[pageId]` is reachable directly if someone
  guesses/is given a URL — this is intentional (it is how a variant is
  reviewed) but that URL is never linked from anywhere a visitor or crawler
  would discover it (no sitemap entry, no canonical/alternate tag, no
  in-page link), and a variant's own `pages` document has no `domain`/
  `path` for a crawler to resolve independently in the first place
  (data-model.md).
- **FR-016**: any failure resolving the test's definition or the bucket
  (GrowthBook unreachable, malformed cache entry) MUST fall through to
  serving the control page's normal, unrewritten render — never a 500,
  never a blank page.
- **FR-018 / SC-008**: a page's *normal* (non-`ab-variant`) request path is
  provably untouched by this feature when no test is running on it — the
  Playwright regression check in Risks (plan.md) asserts this directly,
  not just infers it from the design.
