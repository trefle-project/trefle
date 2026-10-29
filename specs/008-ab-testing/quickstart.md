# Quickstart: validate page A/B testing

Assumes the local stack is running and seeded, including the two new
`growthbook`/`growthbook-mongo` services (Phase 2) and a GrowthBook
instance reachable at `GROWTHBOOK_API_HOST`. Validation guide only —
implementation belongs in `tasks.md`.

## 1. Schema exists and default state is inert

- Create a published page with no test. Confirm nothing about its
  behavior changes versus before this feature existed (no `experimentOf`,
  no `experiments` row referencing it).
- Confirm `docker compose up` brings the full stack — including
  `growthbook`/`growthbook-mongo` — to a healthy state with zero
  `experiments` rows anywhere (constitution Principle III's "ships inert"
  requirement).

## 2. Create variants, start a 3-way test (User Story 1)

- On a published page, use "Create test variant" twice to get two
  challengers (B, C) alongside the original (A) — confirm each is edited
  through the normal GrapesJS canvas, exactly like any other page.
- Start the test. Confirm `experiments.status` is `running` and the page's
  public URL is unchanged.
- From several distinct browser profiles (clearing cookies between each),
  load the page's URL repeatedly: confirm all three variants are shown to
  a meaningfully split audience, not just two of the three (spec.md User
  Story 1, Scenario 2).
- From one profile, reload the same URL several times: confirm the same
  variant is served every time (FR-005, SC-005) — inspect the rewritten
  target directly (a server log or a hidden dev-only marker) to confirm
  it, not just visually.

## 3. No URL tell, no crawler/direct reachability (FR-006, FR-012, SC-006)

- Compare the page's address bar, canonical link tag, and any form
  `action` attribute before and during the test — none reveal the
  internal `ab-variant/<id>` rewrite target.
- Attempt to load `ab-variant/<variantPageId>` for a variant that was never
  shared as a link — it renders (by design, for review purposes) but
  confirm no sitemap, robots entry, or in-page link anywhere on the site
  points at it, so a crawler with no prior knowledge of the id can never
  discover it organically. (This app has no sitemap or robots route at
  all, so this holds trivially.)
- **Known residual gap** (documented in `contracts/bucketing-and-caching.md`
  and `apps/web/src/app/ab-variant/[pageId]/page.tsx`'s header comment):
  a visitor's own response embeds Next's App Router RSC "flight" hydration
  payload, which — for every page, not just this feature — includes the
  matched route's own segment tree. For a bucketed request that means the
  literal string `"ab-variant"` and that response's own page id are
  present in View Source. The address bar, canonical tag, form action, and
  rendered content never reveal it (verified above); only reading the raw
  HTML source does.

## 4. Cache-entry count, not cache loss (FR-018, SC-008)

- Before starting a test: note the tested page's cold-load time and
  confirm it's ISR-cached (a second request is fast).
- After starting a 3-way test: confirm the page has up to three
  independent cache entries (one per `ab-variant/<pageId>`), each individually
  fast after its own first hit — not a single, permanently-dynamic route.
- Load a *different*, untested page before and after this feature ships:
  confirm its load time is identical — this feature must not add latency
  to pages that aren't under test (research.md §1's core guarantee).
- Run a Lighthouse/PageSpeed pass on the tested page: no measurable LCP
  regression versus the same page pre-test (mirrors
  `007-gtm-tagging/quickstart.md` §9's check).

## 5. Live results on the page (User Story 2)

- With some visitor activity recorded, open the control page's edit view:
  confirm the "Tests A/B" tab shows visit/conversion counts per variant,
  including the original, without navigating elsewhere.
- Confirm a test with zero activity yet shows all variants at zero rather
  than an error or blank state.
- Confirm no individual visitor is identifiable anywhere in this view —
  aggregate counts only (FR-009).

## 6. Site-wide list (User Story 4)

- With two tests running on two different pages, open the `experiments`
  admin section: confirm both appear with their own per-variant results,
  without opening either page individually.
- Conclude one of them: confirm it disappears from this "currently
  running" list but its record (and results) remain reachable via the
  collection's own history.

## 7. Promotion and its aftermath (User Story 3)

- Promote a challenger variant on a running test: confirm every subsequent
  visitor (fresh cookie) sees that variant's content at the original URL,
  `experiments.status` is `concluded` with `winner` set, and this takes
  effect on the same on-demand-revalidation timescale an ordinary
  published-page edit already does.
- Confirm the page's existing leads and any other page's
  `confirmationPage` reference pointing at it are unchanged — only the
  visible content differs (FR-011).
- Confirm the non-promoted variant(s) are still viewable (not deleted) via
  the "Tests A/B" tab's history.
- Separately, run and conclude a test *without* promoting anything:
  confirm the original keeps serving unchanged.

## 8. The assignment lookup unavailable — fail open (FR-016)

- **Correction found live**: this section originally named the
  `growthbook` service, written before the Foundational-phase finding
  (research.md §2, docs/ab-testing-exploration.md §2) that GrowthBook is
  never actually on `apps/web`'s bucketing hot path — `getRunningTestFor`
  (`apps/web/src/lib/payload-client/index.ts`) reads the CMS's own
  `/experiments`/`/pages` REST API directly, and its `try`/`catch` is what
  FR-016 actually depends on. Stopping `growthbook` has no effect on
  bucketing at all (nothing calls it); the real dependency is the `cms`
  service, so that's what this check exercises.
- With a test running on a page that already has normal traffic/cache
  history, stop the `cms` service and load the tested page from a fresh
  profile: confirm the visitor sees the control, fully functional
  (served from the page's own cached content — a *brand-new*, never-
  before-visited page has no such cache yet and can legitimately 404
  during a full CMS outage, same as it would with no A/B testing at all;
  this checks the assignment step specifically, not "CMS being fully down
  changes nothing anywhere"), with no error, and no bucket cookie set. Also
  confirm an *already-bucketed* visitor (existing cookie from before the
  outage) still gets a fast, working response.
- Confirm this visit is not later reflected in the test's recorded results
  — `pingPageView`'s own fire-and-forget `fetch` fails silently under the
  same outage, so no `page-stats` row is written for it; no separate
  exclusion logic was needed.
- Restart `cms`: confirm bucketing resumes for new visitors without any
  redeploy.

## 9. Access control (FR-015)

- Confirm a user without editor/admin rights cannot create a variant,
  start a test, view the `experiments` section, or promote a variant —
  same `isAdminOrEditor` gate that already governs page publishing.
