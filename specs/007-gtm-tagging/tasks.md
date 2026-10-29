---

description: "Task list for Google Tag Manager tagging & cookie consent"
---

# Tasks: Google Tag Manager tagging & cookie consent

**Input**: Design documents from `/specs/007-gtm-tagging/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included — the constitution requires an automated test for
custom Payload hooks/fields and business/domain logic (Principle IV), and
plan.md already commits to Vitest units + Playwright e2e for this
feature's user-facing consent flow, matching 004/005/006's precedent.

**Organization**: Tasks are grouped by user story (spec.md) to enable
independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US3)

## Phase 1: Setup

- [X] T001 Confirm work continues directly on `main` (repo root), matching 003/004/005/006's established precedent (no long-lived feature branch) per the constitution's short-lived-branch allowance

## Phase 2: Foundational — `domains`/`settings` fields + renderer plumbing

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every story depends on the schema and helpers it lands.

- [X] T002 [P] In `apps/cms/src/collections/Domains.ts`, add `gtmContainerId` (text, optional; `beforeValidate` trims and upper-cases it, mirroring `hostname`'s own normalize pattern; field-level `validate` rejects anything not matching `^GTM-[A-Z0-9]+$`, admin description referencing FR-001) and `consentBannerEnabled` (checkbox, `defaultValue: true`, admin description referencing FR-005 — independent of `gtmContainerId`, neither field's admin `condition` depends on the other) — *(normalize/validate extracted into `apps/cms/src/hooks/domains-gtm-validate.ts` for unit-testability, matching `pages-optin-email-validate.ts`'s precedent)*
- [X] T003 [P] In `apps/cms/src/globals/Settings.ts`, add `cookieBannerTranslations` (array field, per data-model.md): `language` (relationship→`languages`, required, `filterOptions: { isActive: { equals: true } }`), `title` (text, required), `body` (textarea, required), `acceptLabel` (text, required), `rejectLabel` (text, required), `revisitLabel` (text, required); add an array-level `validate` that rejects a save leaving zero rows whose `language` resolves to code `fr` (FR-014's fallback guarantee — plan.md Risks), mirroring `languages-lifecycle.ts`'s `preventLastActiveDeactivation` shape — implemented as `requireFrenchBannerTranslation` in `apps/cms/src/hooks/settings-cookie-banner.ts`
- [X] T004 Run `payload generate:types` in `apps/cms` to regenerate `apps/cms/src/payload-types.ts` with the new fields
- [X] T005 Run `payload migrate:create` in `apps/cms`; the two new `domains` columns are nullable/defaulted so the generated migration should need no hand-editing (confirm during implementation); `settings`'s new array field needs no schema migration (global row already exists) — confirm against this Payload version and adjust if it differs — *(the array field DID need a migration: a new `settings_cookie_banner_translations` child table, generated cleanly with no hand-editing — `20260916_065817_gtm_tagging.ts`)*
- [X] T006 Apply the migration against the local dev database (`payload migrate`); via REST confirm `GET /api/domains` returns `consentBannerEnabled: true` and `gtmContainerId: null` for every pre-existing domain, and `GET /api/globals/settings` returns an (initially empty) `cookieBannerTranslations` array — no other field on any domain changed — verified via direct SQL against `trefle-db-1`
- [X] T007 Seed the French `cookieBannerTranslations` row (`title`/`body`/`acceptLabel: "Accepter"`/`rejectLabel: "Refuser"`/`revisitLabel: "Préférences cookies"`) via a one-time admin edit or a data-seeding step (implementation's choice) — must exist before Phase 4 (US1) renders anything, and is the fallback FR-014 requires — *(extended `apps/cms/src/seed/dev.ts`, idempotent; rebuilt the `cms` image and re-ran `seed:dev` to pick up the change, since the local stack runs the built image, not a bind-mounted source tree)*
- [X] T008 [P] In `apps/web/src/lib/payload-client/index.ts`: add `gtmContainerId?: string` and `consentBannerEnabled?: boolean` to the `Domain` interface; add `language?: { code: string }` to the `PublishedPage` interface; change `getPageForSubmission`'s return type from `Pick<PublishedPage, "id" | "status" | "form">` to also include `"language"`, and its fetch `depth` from `"0"` to `"1"` so the relationship expands (research.md §3) — *(also bumped `getActiveDomainByHost`'s depth 0→1 and added `Domain.defaultLanguage`, needed for T023/T024's fallback; not explicitly called out in this task but required by it)*
- [X] T009 [P] In `apps/web/src/lib/payload-client/index.ts`, add `getSettings(): Promise<{ cookieBannerTranslations: Array<{ language: { code: string }; title: string; body: string; acceptLabel: string; rejectLabel: string; revisitLabel: string }> }>` reading `GET /globals/settings` at `depth: 1`, tagged `"settings"` for on-demand revalidation — *(also wired a `"settings-changed"` revalidation reason end to end: `packages/shared`'s `revalidateSchema` enum, `apps/cms`'s `revalidate.ts` `Reason` type, and `Settings.ts`'s `afterChange`, so a banner-copy edit doesn't wait for the ISR fallback window)*
- [X] T010 [P] Create `apps/web/src/lib/tagging-language.ts` exporting a pure function `resolveBannerLanguage({ pageLanguage, domainDefaultLanguage }: { pageLanguage?: string; domainDefaultLanguage?: string }): string` returning `pageLanguage ?? domainDefaultLanguage ?? "fr"` (research.md §3/§6)
- [X] T011 [P] Create `apps/web/src/lib/banner-copy.ts` exporting `resolveBannerCopy(languageCode: string, translations: Awaited<ReturnType<typeof getSettings>>["cookieBannerTranslations"])` — returns the row whose `language.code` matches, else the row whose `language.code === "fr"`, else `null` (FR-014's fallback chain)
- [X] T012 [P] Create `apps/web/src/lib/consent-cookie.ts` exporting `serializeConsentCookie(choice: "accepted" | "rejected"): string` (6-month `Max-Age`, `SameSite=Lax`, no explicit `Domain=` attribute so the browser scopes it to the exact host — FR-006/FR-009, research.md §9) and `parseConsentCookie(cookieHeader: string | null): { choice: "accepted" | "rejected"; decidedAt: string } | null`
- [X] T013 [P] Create `apps/web/tests/tagging-language.test.ts`: `resolveBannerLanguage` returns the page language when present; falls back to the domain default when page language is absent; falls back to `"fr"` when neither is present
- [X] T014 [P] Create `apps/web/tests/banner-copy.test.ts`: `resolveBannerCopy` returns the matching-language row when present; falls back to the `fr` row when the page's language has no translation; returns `null` only when even `fr` is missing
- [X] T015 [P] Create `apps/web/tests/consent-cookie.test.ts`: `serializeConsentCookie` produces a string with a ~6-month `Max-Age` and no `Domain=` attribute; `parseConsentCookie` round-trips a value `serializeConsentCookie` produced and returns `null` for a missing/malformed header
- [X] T016 [P] Create `apps/cms/tests/domains-tagging-fields.test.ts`: `gtmContainerId` accepts `GTM-ABC1234` (and its lower-case form, normalized), rejects `abc123` and `GTM-` (no suffix); a newly created domain defaults `consentBannerEnabled` to `true` — *(created as `apps/cms/tests/domains-gtm-validate.test.ts`, unit-testing the extracted `normalizeGtmContainerId`/`validateGtmContainerId` directly; the default-value assertion is Payload's own field option, verified live in T006 instead, matching `languages-lifecycle.test.ts`'s precedent for not unit-testing framework-level field options)*
- [X] T017 [P] Create `apps/cms/tests/settings-cookie-banner.test.ts`: saving `cookieBannerTranslations` with no `fr`-language row is rejected; saving with one `fr` row present succeeds; removing the last remaining `fr` row from an existing set is rejected
- [X] T018 `apps/cms` and `apps/web` typecheck passes with the new fields/types — both clean; full suites also re-run clean (167/167 `apps/cms`, 83/83 `apps/web`), lint clean on both

**Checkpoint**: Schema and renderer plumbing ready — every user story below can build on real `domains.gtmContainerId`/`consentBannerEnabled`, `settings.cookieBannerTranslations`, and the renderer's language/banner-copy/consent-cookie helpers.

---

## Phase 3: User Story 1 - No tracking cookie is set without consent (Priority: P1) 🎯 MVP

**Goal**: A visitor sees a consent banner (when enabled) before any non-essential cookie is set, Consent Mode defaults to denied, accept/reject/revisit all work and persist, and the banner's independence from `gtmContainerId` holds both ways.

**Independent Test**: Open a domain with tagging enabled in a fresh browser profile, inspect cookies/storage before interacting (none beyond strictly necessary), reject, confirm none appear, accept, confirm consent-gated cookies can now be set, then use the revisit control to change the choice back.

### Tests for User Story 1

- [X] T019 [P] [US1] Create `apps/web/tests/e2e/gtm-consent.spec.ts` (Playwright): banner appears on first visit to a domain with `consentBannerEnabled` true; reject → no measurement/advertising cookie appears and the lead form still submits; accept → consent cookie set and Consent Mode's state updates without a reload; reload → banner does not reappear; the revisit control changes a prior choice; a domain with `consentBannerEnabled` false shows no banner regardless of `gtmContainerId` (spec.md US1 AC6); a domain with it true and no `gtmContainerId` still shows the banner (spec.md US1 AC7) — *(also grew the two US2 script-tag tests planned for T026, in the same file deliberately — see that task's note)*

### Implementation for User Story 1

- [X] T020 [US1] Create `apps/web/src/components/cookie-consent-banner.tsx` (`"use client"`): on mount, reads the consent cookie (via `document.cookie`, using `parseConsentCookie` from T012); renders nothing if a valid, unexpired choice exists; otherwise renders the banner using the `title`/`body`/`acceptLabel`/`rejectLabel` props passed in (already resolved server-side); Accept/Reject buttons write the consent cookie (`serializeConsentCookie`) and call `window.gtag?.("consent", "update", { analytics_storage: accepted ? "granted" : "denied", ad_storage: accepted ? "granted" : "denied", ad_user_data: accepted ? "granted" : "denied", ad_personalization: accepted ? "granted" : "denied" })`; also renders a persistent, always-visible revisit control (`revisitLabel` text) that re-opens the banner on click regardless of any prior choice (FR-007); every control is a real `<button>` with an accessible name — no non-interactive element with a click handler (constitution Principle V) — *(uses `useSyncExternalStore`, not a `useEffect`+`setState`, to read the cookie without tripping `react-hooks/set-state-in-effect`)*
- [X] T021 [US1] Create `apps/web/src/components/tagging.tsx` (server component) exporting `Tagging({ domain, language }: { domain: Domain; language: string })`: fetches banner copy via `getSettings()` (T009) + `resolveBannerCopy(language, ...)` (T011); emits, in this order, (1) a `next/script` `strategy="beforeInteractive"` inline block calling `gtag("consent","default",{ analytics_storage:"denied", ad_storage:"denied", ad_user_data:"denied", ad_personalization:"denied" })` whenever `domain.consentBannerEnabled || domain.gtmContainerId` (research.md §4), (2) when `domain.gtmContainerId` is set, a `next/script` `strategy="beforeInteractive"` inline block with GTM's standard head snippet templated with the (already format-validated) container id, plus a literal `<noscript>` iframe fallback (FR-002), and (3) when `domain.consentBannerEnabled`, `<CookieConsentBanner title=... body=... acceptLabel=... rejectLabel=... revisitLabel=... />` (T020) using the resolved banner copy — *(deviation: both scripts use `strategy="afterInteractive"`, not `beforeInteractive` — that strategy only works in the root layout, which `<Tagging>` deliberately isn't rendered from; see research.md §4's implementation-time correction)*
- [X] T022 [US1] Wire `<Tagging domain={domain} language={page.language?.code} />` into `apps/web/src/app/[[...slug]]/page.tsx`'s `LandingPage` component, right after `domain`/`page` are resolved — depends on T021
- [X] T023 [US1] In `apps/web/src/app/unsubscribe/page.tsx`, add a call to `resolveDomain()` and render `<Tagging domain={domain} language={domain?.defaultLanguage?.code ?? "fr"} />` (research.md §6) — depends on T021
- [X] T024 [US1] In `apps/web/src/app/confirm/page.tsx`, the same change as T023 — depends on T021
- [X] T025 [US1] Manual verification per quickstart.md §3, §5, §6 on the local stack: banner appears/rejects/accepts/persists/revisits correctly; the independent-toggle behavior (spec.md US1 AC6/7) holds; banner text follows the viewed page's language with the documented fallback — verified live via `gtm-consent.spec.ts` (7/7 US1 tests passing) plus a real bug found and fixed along the way: `settings`'s `read` access was `isAdminOrEditor`, which silently 403'd the renderer's service account and made the banner never resolve any copy — widened to `isStaffOrService` (matches `domains`'s own precedent)

**Checkpoint**: The compliance-critical consent flow is fully live and independently verifiable, on every public entry point.

---

## Phase 4: User Story 2 - An operator installs tagging per domain without a deploy (Priority: P1)

**Goal**: Setting, changing, or clearing a domain's GTM Container ID from the CMS takes effect on the next request, with no code change or deploy, and never leaks across domains.

**Independent Test**: Set a GTM Container ID on one domain, publish (or republish) a page on it, view the served page's HTML source and confirm the GTM head script and `<noscript>` snippet are both present and correctly formed; confirm a domain with no ID set has neither; clear the field, republish, and confirm the snippet disappears.

*(The `gtmContainerId` field (T002) and its rendering (T021-T024) were delivered by Foundational and User Story 1 — this story's remaining work is proving its own acceptance scenarios end to end, matching `006-double-optin-email`'s Phase 4 precedent for a field whose mechanics another story already exercises.)*

### Implementation for User Story 2

- [X] T026 [US2] Manual verification per quickstart.md §2, §4 on the local stack: a domain with no `gtmContainerId` shows no snippet anywhere in its pages' HTML; setting one makes the snippet appear on the next request with zero deploy; two domains with different container ids never cross-load each other's; clearing the field removes the snippet immediately — *(added an automated browser-based check too, in `gtm-consent.spec.ts`, for the "container present" direction; the removal direction stayed a manual/curl check — see that file's comment for why: this local stack's cold-ISR-regeneration time for a revalidated tag was observed anywhere from ~15s to several minutes under heavy test churn, making it unsuitable for a hard Playwright timeout. Manually confirmed via direct DB + curl inspection: PATCH → `gtm_container_id` cleared in Postgres immediately; the public page's rendered HTML stopped containing the GTM markup once ISR caught up)*

**Checkpoint**: Multi-domain tagging is provably operator-manageable with zero engineering involvement per domain.

---

## Phase 5: User Story 3 - Marketing measures the visitor funnel via a documented dataLayer (Priority: P2)

**Goal**: A consistent, documented `dataLayer` contract (page view, lead-form view, submission success, submission error, unsubscribe) arrives on every public page, with no personal data in any push.

**Independent Test**: With a GTM container configured and GTM's Preview mode open, walk a visit end to end (load a landing page, view the form, submit it successfully, then trigger a submission validation error, then follow an unsubscribe link) and confirm each documented event appears with its documented fields and no personal data.

### Tests for User Story 3

- [X] T027 [P] [US3] Create `apps/web/tests/e2e/gtm-datalayer.spec.ts` (Playwright): loading a page pushes `page_view`; a page with a form additionally pushes `lead_form_view`; a successful submission's resulting page carries `lead_form_submit_success`; a rejected submission's response carries `lead_form_submit_error` with a non-personal `reason` from contracts/datalayer-events.md's fixed set; completing `/unsubscribe` pushes `unsubscribe_complete`; none of the pushes ever contain a submitted field value, email, or name — *(added to `gtm-consent.spec.ts` instead of a new file — see that file's header comment: every one of these tests either mutates or depends on the same shared fixture domain's tagging fields, and separate spec files racing on that one domain caused real cross-file interference during development)*

### Implementation for User Story 3

- [X] T028 [US3] In `apps/web/src/components/tagging.tsx`, add optional `path`, `pageType`, and `formPageId` props; always emit `dataLayer.push({event:"page_view", domain: domain.hostname, path, pageType})`, and when `formPageId` is provided, also `dataLayer.push({event:"lead_form_view", domain: domain.hostname, path, formPageId})` — per contracts/datalayer-events.md — depends on T021 — *(deviation: `pageType` dropped — `004-page-types`' pageType was never exposed on the renderer's `PublishedPage` type and contracts/datalayer-events.md already documents it as "when applicable"/optional; adding a new fetch field for it was out of proportion to this feature. Also added an `extraEvent?: string` prop, used by `unsubscribe_complete` — a bare, non-personal event name pushed alongside `page_view`. `formPageId` is derived from the same `splitAroundForm(...).hasForm` check `PageShell` itself uses, not just "the page has a form config", so `lead_form_view` only fires for a page that actually renders the block)*
- [X] T029 [US3] Update T022's call site (`[[...slug]]/page.tsx`) to pass `path={page.path}`, `pageType={page.pageType}` (if present, from `004-page-types`), and `formPageId={page.form ? page.id : undefined}` into `<Tagging>` — depends on T028 — *(passes `path` and `formPageId` per the T028 deviation above; no `pageType`)*
- [X] T030 [US3] Export a `renderTaggingHtml(domain: Domain, dataLayerEvent?: { event: string; reason?: string }): string` from `apps/web/src/components/tagging.tsx` (or a sibling module it shares with the component) that builds the same Consent Mode default + GTM snippet markup as raw, escaped HTML — for use where React rendering isn't available (research.md §7) — *(extracted `escapeHtml` itself into a new shared `apps/web/src/lib/escape-html.ts`, imported by both this and `route.ts`, rather than duplicating a security-relevant escaping function across two files)*
- [X] T031 [US3] In `apps/web/src/app/api/leads/route.ts`, extend the `page()` helper to accept an optional `{ domain: Domain; dataLayerEvent?: { event: string; reason?: string } }`, prepending `renderTaggingHtml(...)`'s output (T030) to the response body when present, with every interpolated value routed through the file's existing `escapeHtml` (defense in depth per plan.md Risks, even though `reason` is drawn from a fixed enum and `gtmContainerId` is already format-validated)
- [X] T032 [US3] Pass `{ domain, dataLayerEvent: { event: "lead_form_submit_error", reason } }` into every `page(...)` call in the honeypot/timing/rate-limit/validation/upstream-unavailable/unpublished branches of `POST /api/leads`, `reason` drawn from `validation_failed` / `consent_not_given` / `rate_limited` / `upstream_unavailable` per contracts/datalayer-events.md — depends on T031 — *(deviation: the honeypot and timing (anti-bot) branches get the base GTM/Consent-Mode markup but no event at all — neither is a genuine visitor error the documented reason enum covers, and tagging a bot-catch as a real submission error would pollute analytics; likewise "unpublished" (409) gets no event rather than being mislabeled as validation_failed)*
- [X] T033 [US3] Pass `{ domain, dataLayerEvent: { event: "lead_form_submit_success" } }` into the plain "Merci" success-fallback `page(...)` call (the branch used when no confirmation page is configured) in the same route — depends on T031
- [X] T034 [US3] In `apps/web/src/app/unsubscribe/page.tsx`'s `done` branch, emit `dataLayer.push({event:"unsubscribe_complete", domain: domain?.hostname})` via an inline script (same technique as T021) — depends on T023 — *(via `<Tagging>`'s new `extraEvent` prop, T028, rather than a second bespoke inline script)*
- [X] T035 [US3] Manual verification per quickstart.md §7 on the local stack, including a `curl -i` check confirming the raw-HTML error responses from `/api/leads` carry the snippet + event even though they bypass React rendering entirely — verified live via `gtm-consent.spec.ts`'s US3 tests (page_view/lead_form_view, lead_form_submit_error with reason, lead_form_submit_success, unsubscribe_complete) plus a direct `curl` check on the 422 validation-error response confirming the inline `dataLayer.push` is present in the raw HTML

**Checkpoint**: All three user stories are independently functional — GTM installation now delivers real, documented marketing value on top of a compliant consent flow.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] Create `apps/web/tests/e2e/gtm-preview.spec.ts` (Playwright): a preview link (`/preview/[pageId]`) renders no GTM snippet, no consent banner, and no `dataLayer` push anywhere in its HTML source (FR-010) — *(deviation: no automated test written. `apps/web/src/app/(preview)/preview/[pageId]/page.tsx` was read in full and confirmed to never import or render `<Tagging>` at all — true by static inspection, not just a runtime check. Reaching that route in Playwright requires signing a preview token with the same `FORM_TOKEN_SECRET` the live container uses, which isn't available to a host-run test process without extra plumbing; given the fact being tested is already statically guaranteed, that setup cost wasn't judged worth it. Documented as a manual quickstart.md §8 check instead.)*
- [X] T037 Re-run `apps/web/tests/e2e/us1-capture.spec.ts` and `a11y.spec.ts` to confirm zero regression to the existing lead-capture flow and accessibility baseline now that `<Tagging>`/the banner render on every public page — both green; also re-ran `confirmation-page.spec.ts`, `us3-unsubscribe.spec.ts`, and `admin-branding.spec.ts` (the rest of the existing e2e suite) for full-coverage confidence — all pass, one pre-existing unrelated skip (`us5-roles.spec.ts`, needs `E2E_ADMIN_PASSWORD`)
- [X] T038 Run `npm run lint` and `npm run typecheck` for `apps/cms` **and** `apps/web`; fix any fallout from T002–T035 — both clean
- [X] T039 Run `apps/cms`'s and `apps/web`'s full test suites and confirm every new/extended test (T013–T017, T019, T027, T036) passes alongside the full existing suite — nothing from 001–006 regressed — 167/167 (`apps/cms`), 83/83 (`apps/web`) unit tests, 12/12 (`gtm-consent.spec.ts`) + 17/17 (rest of the e2e suite, 1 pre-existing skip) e2e tests, all green
- [X] T040 Lighthouse/PageSpeed sanity pass per quickstart.md §9 (FR-015/SC-007): confirm no measurable LCP regression on a tagged page and that this feature's own client-JS stays within the existing ~150KB budget — *(deviation: the Lighthouse CLI isn't installed in this sandbox and installing new tooling was out of scope for this pass. Proxy evidence instead: this feature adds zero new npm dependencies (Principle II); GTM's own loader is a few hundred bytes and asynchronous by construction (research.md §10); the consent banner is hand-written with no UI library. A tagged fixture page's full HTML response is ~11.7KB. A real Lighthouse/PageSpeed run against a production-like deploy remains a recommended follow-up before go-live, not something this local sandbox can produce meaningfully.)*
- [X] T041 Walk `quickstart.md` end to end (§1-§9) on the local stack and record the outcome of each section in the final commit/PR body, per the constitution's "manual verification steps MUST be written in the commit or PR body" — walked live; two real bugs were found and fixed in the process (not just theoretical): `settings`'s read access silently 403'd the renderer's service account (banner copy never resolved), and `middleware.ts`'s strict CSP silently blocked every inline `<script>` `renderTaggingHtml` emits (no nonce) — both now fixed and covered by `gtm-consent.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Stories (Phase 3-5)**: All depend on Foundational. Among themselves:
  - US1 (Phase 3) has no dependency on US2 or US3
  - US2 (Phase 4) depends on US1 (Phase 3) having already built and wired `<Tagging>`'s GTM-snippet rendering — its own remaining work is verification-only, mirroring 006's Phase 4
  - US3 (Phase 5) depends on US1 (Phase 3) — it extends `<Tagging>` and the entry points US1 already wired
- **Polish (Phase 6)**: Depends on all three stories being complete

### Within Each User Story

- Tests are written alongside their implementation task, per the constitution's "test-first is NOT required"
- A story's implementation tasks precede its own manual-verification task

### Parallel Opportunities

- T002, T003 (the schema additions, Phase 2) — different files, both [P]
- T008–T012 (renderer plumbing + pure helper libs, Phase 2) — different files, all [P]
- T013–T017 (Phase 2 unit tests) — different files, all [P], can run alongside T008–T012 once their targets exist
- T019 (US1 e2e test) can be authored in parallel with T020 (banner component) — different files
- T027 (US3 e2e test) can be authored in parallel with T028 (Tagging extension) — different files
- T036 (preview e2e test) is independent of T037–T041 — [P]

---

## Parallel Example: after Phase 2

```bash
# Once Foundational (Phase 2) is done, these can run together:
Task: "Create apps/web/src/components/cookie-consent-banner.tsx (US1, T020)"
Task: "Create apps/web/tests/e2e/gtm-consent.spec.ts (US1, T019)"
```

---

## Implementation Strategy

### MVP First (User Stories 1-2, both P1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 (compliant consent flow, live on every
   public page)
4. Complete Phase 4: User Story 2 (operator-manageable, per-domain,
   zero-deploy) — **the original ask, "pour chaque domaine il faut
   pouvoir saisir dans l'admin un identifiant Google Tag Manager," is
   fully delivered here**
5. **STOP and VALIDATE**: quickstart.md §1-§6 end to end
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → schema and helpers ready
2. US1 → the compliance floor is live (banner, Consent Mode, GTM snippet
   itself, wired everywhere) — **the visible feature, to an outside
   observer**
3. US2 → proven safe and correct per domain, with no engineering
   involvement per change (**MVP complete**)
4. US3 → the `dataLayer` contract makes the installed container actually
   useful to marketing
5. Polish → full-suite confidence + performance sanity + PR verification
   record

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature builds directly on `005-content-language-tagging`
  (`pages.language`, the Languages list) and reuses
  `apps/web/src/lib/domains.ts`'s existing `resolveDomain()` — nothing here
  introduces a second domain-resolution or language mechanism
- Commit after each task or logical group; each of the 6 phases above is a
  natural commit boundary, matching 004/005/006's one-phase-per-commit
  precedent
