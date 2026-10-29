# Implementation Plan: Google Tag Manager tagging & cookie consent

**Branch**: `007-gtm-tagging` | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-gtm-tagging/spec.md`

## Summary

Add a per-domain GTM Container ID and an independent per-domain
consent-banner toggle to `domains` (`apps/cms`), a per-language
consent-banner copy array on the existing `settings` global, and a new
renderer-side (`apps/web`) `<Tagging>` component that every public entry
point (the catch-all page, `/unsubscribe`, `/confirm`) renders explicitly:
a Consent Mode default-deny script, the GTM snippet, the `<noscript>`
fallback, the consent banner (localized per the viewed page's language,
`005-content-language-tagging`), and a documented `dataLayer` contract for
page view / lead-form view / submission success / submission error /
unsubscribe. The one non-obvious integration point is
`apps/web/src/app/api/leads/route.ts`'s hand-built HTML error/fallback
responses, which bypass `RootLayout` entirely and need the same snippet +
event injected directly (research.md §7). No new npm dependency; no
migration touching `pages` or `leads`.

## Technical Context

**Language/Version**: TypeScript, Node 24. Payload 3.88 + Next 16
(`apps/cms`); Next 16 App Router (`apps/web`). Touches both apps plus
`packages/shared` only if a shared type is worth extracting (unlikely —
see Project Structure).

**Primary Dependencies**: None new. `next/script` (`apps/web`, already
part of Next) for the GTM/Consent-Mode script tags (research.md §4);
Payload's existing field/global/array primitives (`apps/cms`) for the new
settings.

**Storage**: PostgreSQL 16, via one small migration: two new columns on
`domains` (`gtm_container_id` text nullable, `consent_banner_enabled`
boolean default `true`) and the `settings` global's JSON/array storage for
`cookieBannerTranslations` (globals persist as a single row — no new
table). No backfill needed: both `domains` columns default safely for
every existing row, and `settings` is a singleton editable to add rows
after the fact.

**Testing**: Vitest (`apps/cms`) for the new field validation
(`gtmContainerId`'s format check, mirroring `languages.code`'s
`validate`-function pattern) and for the `cookieBannerTranslations`
French-fallback guarantee if enforced via a hook. Vitest (`apps/web`) for
the new pure logic: the language-fallback resolver (page → domain default
→ `"fr"`, research.md §3/§6) and the consent-cookie read/write helper.
Playwright e2e (`apps/web/tests/e2e`) for the consent-banner flow (appear,
reject, accept, revisit, persistence) and for confirming no snippet
appears on a preview link — matching the existing `a11y.spec.ts`/
`us1-capture.spec.ts` style. Live verification per `quickstart.md`.

**Target Platform**: Same Debian VPS / Docker Compose stack; no infra/
deploy change.

**Project Type**: Existing multi-app monorepo; this feature touches both
`apps/cms` and `apps/web`, unlike `004`/`005` which stayed CMS-only.

**Performance Goals**: No regression to Largest Contentful Paint on a
published page (FR-015, SC-007); client-JS weight for this feature's own
code stays within the existing ~150KB gzipped/page budget.

**Constraints**: GTM and the consent banner MUST NOT render on preview
links or the Payload admin UI (FR-010) — enforced by simply never
rendering `<Tagging>` from `apps/web/src/app/(preview)/preview/[pageId]/page.tsx`
or anywhere in `apps/cms`. The lead-capture form (`LeadForm`) MUST keep
working with JavaScript disabled and independent of GTM being
blocked/absent (FR-011) — `<Tagging>` and the consent banner are additive;
nothing in the existing form/submission path depends on them.

**Scale/Scope**: Same single shared workspace as prior features. One GTM
container per domain (not per page); consent-banner copy is 4 seeded
languages at launch, growing only as `005`'s Languages list grows.

## Constitution Check

| Principle | Check |
|---|---|
| I. Simplicity First | Two scalar fields on `domains`, one array field on the existing `settings` global, one small shared component (`<Tagging>`) called explicitly from three existing entry points — no new collection, no new app, no new abstraction layer. The trickiest part (the `/api/leads` raw-HTML branches) is handled by extending an existing helper (`page()`), not by inventing a parallel rendering path. |
| II. Stack-Native | `next/script` (already part of Next.js) is the only "new" primitive used, for exactly the two script tags GTM's own install instructions require — no analytics/consent/tag-management npm package added. Payload's own field/global/relationship primitives cover every CMS-side need. |
| III. Small, Reversible | Each phase below is one commit, independently revertible: schema fields → banner copy global field → `<Tagging>` component (inert until a domain sets `gtmContainerId`) → wiring it into the three entry points → the `/api/leads` raw-HTML injection → the dataLayer events on the form-submission path. The migration only adds nullable/defaulted columns — trivially reversible, no data loss on rollback. |
| IV. Working Software Over Ceremony | The new field-level validation (`gtmContainerId` format) and the language-fallback resolver are pure, testable logic — both get unit tests. The consent-banner flow (a user-facing interactive behavior with real compliance stakes) gets a Playwright e2e test, matching how other visitor-facing flows in this repo are covered (`us1-capture.spec.ts` etc.), not left to manual-only verification. |
| V. Quality the User Feels | The consent banner is a new interactive, keyboard-navigable UI element with accessible names for its controls (constitution's existing accessibility bar applies to it like any other published-page element) and MUST have an explicit "no banner" state for domains without one enabled — no loading flash of unstyled content. FR-011 keeps the lead form fully usable if GTM is blocked. FR-015 keeps this feature's own footprint inside the existing performance budget. |

Gate: **PASS**. No complexity-tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/007-gtm-tagging/
├── plan.md                          # this file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
└── contracts/
    ├── datalayer-events.md          # Phase 1 output
    └── tagging-admin-fields.md      # Phase 1 output
```

### Source Code (repository root)

```text
apps/cms/src/collections/Domains.ts            # + gtmContainerId, consentBannerEnabled
apps/cms/src/globals/Settings.ts               # + cookieBannerTranslations array
apps/cms/src/migrations/<ts>_gtm_tagging.ts    # new — two domains columns; settings needs none (global row already exists)
apps/cms/src/payload-types.ts                  # regenerated
apps/cms/tests/domains-tagging-fields.test.ts  # new — gtmContainerId format validation

apps/web/src/lib/payload-client/index.ts       # + gtmContainerId/consentBannerEnabled on Domain;
                                                #   + language on PublishedPage; getPageForSubmission depth 0→1
apps/web/src/lib/tagging-language.ts           # new — page → domain default → "fr" resolver (pure fn, unit-tested)
apps/web/src/lib/consent-cookie.ts             # new — read/write the consent-choice cookie (pure fn, unit-tested)
apps/web/src/components/tagging.tsx            # new — <Tagging domain language /> : Consent Mode default
                                                #   script, GTM snippet + noscript, <CookieConsentBanner>
apps/web/src/components/cookie-consent-banner.tsx  # new — "use client", accept/reject/revisit, gtag('consent','update',...)
apps/web/src/app/[[...slug]]/page.tsx          # + render <Tagging domain={domain} language={page.language?.code} />
apps/web/src/app/unsubscribe/page.tsx          # + resolveDomain(), render <Tagging .../> with domain-default language
apps/web/src/app/confirm/page.tsx              # + resolveDomain(), render <Tagging .../> with domain-default language
apps/web/src/app/api/leads/route.ts            # page() helper extended: inject Tagging snippet + dataLayer event
apps/web/tests/e2e/gtm-consent.spec.ts         # new — banner appear/reject/accept/revisit/persistence, no-JS lead form still works
apps/web/tests/e2e/gtm-preview.spec.ts         # new — no snippet/banner on a preview link
apps/web/tests/tagging-language.test.ts        # new — resolver unit tests
apps/web/tests/consent-cookie.test.ts          # new — cookie helper unit tests
```

**Structure Decision**: No new app or package. Both existing apps are
touched — `apps/cms` for the two admin-editable settings surfaces,
`apps/web` for every place a public response is produced. `packages/shared`
is not touched: nothing here is a type or utility shared between `apps/cms`
and `apps/web` today (the `Domain`/`PublishedPage` shapes are already
duplicated read-only client-side types in `apps/web`, matching this
codebase's existing pattern rather than introducing a shared-types package
for two new fields).

## Phasing

Each phase = one commit, independently revertible.

### Phase 1 — Schema: `domains` fields + `settings` banner-copy array

- `apps/cms/src/collections/Domains.ts`: add `gtmContainerId` (text,
  format-validated) and `consentBannerEnabled` (checkbox, default `true`).
- `apps/cms/src/globals/Settings.ts`: add `cookieBannerTranslations`
  (array of `language`/`title`/`body`/`acceptLabel`/`rejectLabel`/
  `revisitLabel`), per data-model.md.
- `payload generate:types`; `payload migrate:create`, hand-augment for the
  two `domains` columns (no `settings` migration needed — globals don't
  require a schema migration for a new field the same way collections do
  in Payload's Postgres adapter; confirm during implementation and adjust
  if this Payload version differs).
- `apps/cms/tests/domains-tagging-fields.test.ts`: valid/invalid
  `gtmContainerId` formats; default `consentBannerEnabled` is `true` on a
  new domain.
- Seed the French `cookieBannerTranslations` row (migration or a one-time
  admin edit — decide during implementation; either satisfies FR-014's
  "always a French fallback" as long as it ships before Phase 4).

Verify: quickstart.md §1.

### Phase 2 — Renderer plumbing: types + language resolver + consent cookie

- `apps/web/src/lib/payload-client/index.ts`: extend `Domain` and
  `PublishedPage` (research.md §1/§3); bump `getPageForSubmission`'s depth.
- `apps/web/src/lib/tagging-language.ts`: pure resolver function.
- `apps/web/src/lib/consent-cookie.ts`: pure read/write helpers around one
  cookie (research.md §9).
- Unit tests for both new lib files.

Verify: `npm run typecheck`/`test` for `apps/web`.

### Phase 3 — `<Tagging>` + the consent banner (User Story 1 core)

- `apps/web/src/components/cookie-consent-banner.tsx`: `"use client"`,
  reads the consent cookie, shows/hides, Accept/Reject/revisit control,
  calls `gtag('consent','update',{...})` on change.
- `apps/web/src/components/tagging.tsx`: server component composing the
  Consent Mode default script (`beforeInteractive`), the GTM snippet +
  `<noscript>` (only when `domain.gtmContainerId` is set), and
  `<CookieConsentBanner .../>` (only when `domain.consentBannerEnabled`).
- Not wired into any route yet — this phase is buildable/testable in
  isolation (e.g. via a temporary story/harness or direct unit test of
  the banner's state machine) before touching real pages.

Verify: component-level tests for the banner's accept/reject/expiry logic.

### Phase 4 — Wire `<Tagging>` into the three public entry points (User Story 2)

- `apps/web/src/app/[[...slug]]/page.tsx`: render
  `<Tagging domain={domain} language={page.language?.code} />`.
- `apps/web/src/app/unsubscribe/page.tsx` and `.../confirm/page.tsx`: add
  `resolveDomain()`, render `<Tagging domain={domain} language={domain?.defaultLanguage?.code ?? "fr"} />`.
- Confirm the preview route (`(preview)/preview/[pageId]/page.tsx`) is
  untouched (no `<Tagging>` there — FR-010).

Verify: quickstart.md §2–§6, §8.

### Phase 5 — dataLayer events on the submission path (User Story 3)

- `<Tagging>`: emit `page_view` (and `lead_form_view` when the page has a
  form) per contracts/datalayer-events.md.
- `apps/web/src/app/api/leads/route.ts`: extend `page()` to accept
  `{ domain, dataLayerEvent }`, inject the Tagging snippet + the
  `lead_form_submit_error`/`..._success` push into every branch (research.md
  §7); the redirect-to-`/confirmation` success path gets its
  `lead_form_submit_success` push from `<Tagging>` on that page's own
  render instead (it already goes through `[[...slug]]/page.tsx`).
- `/unsubscribe/page.tsx`'s success branch: `unsubscribe_complete` push.

Verify: quickstart.md §7 (including the `curl -i` check on the raw-HTML
branches).

### Phase 6 — Verification pass

- `apps/cms` and `apps/web` full suites + typecheck + lint.
- Playwright e2e: `gtm-consent.spec.ts`, `gtm-preview.spec.ts`, plus a
  confirming re-run of `us1-capture.spec.ts`/`a11y.spec.ts` to prove no
  regression on the existing lead-capture flow.
- Live: walk quickstart.md §1–§9 end to end on the local stack, including
  the Lighthouse/PageSpeed sanity check (§9).

## Risks

| Risk | Mitigation |
|---|---|
| A future edit to `settings.cookieBannerTranslations` accidentally removes the last French row, breaking FR-014's fallback guarantee | Enforce with a field-level `validate` (array-level) rejecting a save that leaves zero `fr` rows, the same defensive shape as `languages-lifecycle.ts`'s `preventLastActiveDeactivation`. |
| `apps/web/src/app/api/leads/route.ts`'s `page()` helper injection introduces an XSS vector if `dataLayerEvent`'s `reason` or the domain's `gtmContainerId` are ever interpolated unescaped | Both are server-controlled/validated values (a fixed enum of reasons; `gtmContainerId` is format-validated at the CMS field level) — never raw visitor input — but the implementation still routes them through the file's existing `escapeHtml` for defense in depth, consistent with FR-003's "never leak submitted content" requirement. |
| `<Tagging>` rendered independently in three places drifts out of sync over time (one entry point gets an update the others miss) | All three call the same shared `<Tagging>` component with the same two props — there is no per-route copy of its internals to drift; only the *language* argument differs per call site, and that's the one thing that's genuinely different per route (research.md §5). |
| Consent Mode's default-deny script and the GTM snippet render in the wrong order on some route, defeating the "default denied before GTM loads" guarantee | Both are emitted by the same `<Tagging>` component in a fixed order using `next/script`'s `afterInteractive` strategy (not `beforeInteractive` — that strategy only works in the root layout, which `<Tagging>` deliberately isn't rendered from; see research.md §4's implementation correction), and Next.js preserves declaration order for scripts of the same strategy — a Playwright check in `gtm-consent.spec.ts` asserts the default-deny call appears before the GTM loader in the rendered HTML, not just that both exist. |
| The `/unsubscribe` and `/confirm` routes' newly added `resolveDomain()` call fails (e.g. host somehow unresolvable) and breaks a previously domain-independent flow | `resolveDomain()` already returns `null` gracefully elsewhere in this codebase; `<Tagging>` simply renders nothing when `domain` is `null`, and the token-verification logic these routes exist for is untouched and unconditional — a failed domain lookup degrades to "no tagging on this visit," never a broken unsubscribe/confirm. |
