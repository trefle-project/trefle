# Next.js App Router integration

## SDK and assignment model

- GrowthBook publishes an official Next.js App Router guide and a
  dedicated adapter for the **Vercel Flags SDK**, supporting static
  rendering, client components, and streaming server components.
- Assignment is **local, deterministic hashing** — the SDK hashes together
  the targeting attribute (typically a visitor id) and the feature/
  experiment key, converts it to a float in [0, 1), and buckets against
  that. No network call to GrowthBook happens per request.
- The feature/experiment payload is fetched **once and cached**, e.g.
  `fetch(url, { next: { revalidate: N, tags: ["growthbook"] } })`, and
  invalidated on change via a GrowthBook webhook hitting a revalidation
  endpoint — not re-fetched on every request. This is the same
  cache-tag-driven invalidation shape `apps/web` already uses for Payload
  content (`pageRevalidate`), so the pattern isn't new to this codebase,
  only the source is.

## The cache-killing trap — confirmed, not hypothetical

Reading `cookies()` or `headers()` during a Next.js App Router render
marks **the entire route** dynamic (`private, no-store`) — not just the
component that read them, and not a cacheable-per-variant response via
`Vary`. Next.js has no `Vary`-for-ISR mechanism today; the core team has
discussed and not shipped one (see source below). GrowthBook's own
`BrowserCookieStickyBucketService` reads a cookie for sticky bucketing —
using it at page level silently guts ISR on every page it touches, sending
every request through to Payload on what used to be a cached route.

**Mitigation: Partial Prerendering / Cache Components** (stable as of
Next.js 16). Keep the page a static, ISR-served shell by default; isolate
the cookie/header read inside a small `Suspense` boundary — a leaf
component, never a page-level `cookies()` call. Only that fragment
renders at request time; everything else keeps serving from the existing
cache untouched. Concretely for this codebase: never call `cookies()`/
`headers()` at the top of an `apps/web` page component for bucketing —
push it down into a dedicated leaf, wrapped in `<Suspense>`.

This is exactly the reasoning already applied to Trefle's own renderer in
`docs/ab-testing-exploration.md` §3 (the general mitigation) and §4
Option B (the in-page GrapesJS variant block, which is built specifically
to exploit this pattern — the swapped fragment *is* the Suspense island).
Read that document for how it maps onto `apps/web/src/lib/render.ts` and
the GrapesJS block model; this file is the vendor-behavior grounding for
why that design looks the way it does.

## Sources actually verified this session (not recalled)

- [GrowthBook + Next.js App Router guide](https://docs.growthbook.io/guide/nextjs-app-router)
- [GrowthBook self-hosting](https://docs.growthbook.io/self-host)
- [GrowthBook data source / warehouse docs](https://docs.growthbook.io/warehouses)
- [Next.js and Vary — why it's currently impossible to cache variants "properly" (vercel/next.js core-team discussion #82571)](https://github.com/vercel/next.js/discussions/82571)
- [Next.js 16 — Partial Prerendering / Cache Components](https://nextjs.org/blog/next-16)
