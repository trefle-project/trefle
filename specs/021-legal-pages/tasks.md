---

description: "Task list for 021 — Legal pages per domain"
---

# Tasks: Legal pages per domain — privacy policy and legal notice

**Input**: Design documents from `/specs/021-legal-pages/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the constitution (Principle IV) requires them:
data transformations (builder, placeholders), access rules, hooks,
endpoints, the lead-capture path; e2e + axe for the footer and pages.

**Organization**: by user story. US1 (privacy policy + lead-form link) and
US3 (editable texts) share the foundation (fields, builder); US2 (legal
notice) reuses it; US4 (completeness) last.

**Who runs what**: tasks marked **(user)** are owner steps (filling
identities, legal review, Worker deploy).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Default French texts as Markdown with the placeholders of research R2 (legal notice host block uses `{{host.name}}`, `{{host.address}}`, `{{host.phone}}`): `apps/cms/src/legal/defaults/fr/privacy-policy.md` (controller, processor, `{{suppliers}}`, leads: purposes, legal basis, `{{retention.leads}}`, consent record, double opt-in e-mail, `{{cookieBanner}}` paragraph, page tests per 018 R15 with `{{measurementPage}}`, recipients, transfers, rights, CNIL complaint, `{{extra}}`, contact) and `legal-notice.md` (publisher, director, host, `{{extra}}`), each opening with « Modèle à relire par l'opérateur — n'est pas un avis juridique » as an admin-only comment (removed from output)
- [X] T002 [P] Docs: `docs/legal/contrat-sous-traitance.fr.md` (art. 28 DPA template operator ↔ domain owner) and `docs/legal/registre-traitements.fr.md` (owner's register entries for leads, consent, page tests; operator's processor register), reusing `docs/sous-traitant-cloudflare.fr.md` and `docs/mesure-ab-cnil.fr.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T003 Settings (`apps/cms/src/globals/Settings.ts`): `operator` group, `suppliers` array (with `isHost` — at most one, refused otherwise — `address`, `phone`), `legalTexts` array per data-model.md; hook refusing a save without a French `legalTexts` row (French message, test next to the banner hook's); hide `defaultPrivacyNoticeUrl` / `defaultPrivacyNoticeVersion`
- [X] T004 [P] Domains (`apps/cms/src/collections/Domains.ts`): `owner` group, `ownPrivacyPolicyUrl`, `ownLegalNoticeUrl`, `legalExtras` array per data-model.md
- [X] T005 [P] Collection `apps/cms/src/collections/LegalVersions.ts` (`legal-versions`): fields and unique index per data-model.md; read for active members with the second factor, no writes for anyone; registered in `payload.config.ts`; access test
- [X] T006 `apps/cms/src/fields/form.ts`: remove the `fromSettings` defaults of `privacyNoticeUrl` / `privacyNoticeVersion`
- [X] T007 Migration `apps/cms/src/migrations/<date>_legal_pages.ts` (generated, then by hand): fields and collection; seed `Settings.legalTexts` with the French defaults of T001 via `convertMarkdownToLexical` **only when empty**, link labels « Confidentialité » / « Mentions légales »; clear form `privacyNoticeUrl/Version` equal to the Settings defaults (down: restore them from Settings); `IF EXISTS` in the down path; regenerate types and import map (`npm run generate:importmap`)
- [X] T008 [P] Reserve `/confidentialite` and `/mentions-legales` in `apps/cms/src/hooks/pages-path-validate.ts` (+ tests)
  - *2026-10-21*: default texts embedded in `apps/cms/src/lib/legal/defaults.ts` (Markdown strings, not `.md` files: the migration runs in the cms container); optional details (legal form…) get their own paragraph so an empty one never drops the name; `/mesure-audience` and `/confidentialite` are plain Markdown links (no placeholder needed). Domains stay Administrator-only (spec FR-012 corrected). `legal-versions.domain` is optional with a `hostname` copy (archive outlives a deleted domain). Migration `20261021_101738_legal_pages` also adds `ab-analysis` to the jobs enums (missing since 018); checked locally: 878/891 copied form links cleared, French texts seeded, down restores all 891, up again. CMS 685 tests (one unrelated lead-intake test failed once in a full run, green alone and in two reruns).

**Checkpoint**: data in place, defaults seeded, nothing visible yet.

---

## Phase 3: User Story 1 + 3 — Privacy policy, editable texts, lead-form link (P1) 🎯

**Goal**: each domain serves its privacy policy from the editable texts; lead forms link to it with its version in the consent record.

### Tests

- [X] T009 [P] [US1] Builder tests `apps/cms/tests/legal-build.test.ts` per contracts/legal-api.md (language fallback; every placeholder; block dropped for empty/unknown values; never `{{` in output; cookie-banner on/off; suppliers order; extra paragraph per kind/language; version stable/changes; archive insert once — DB part in `tests/db/legal-versions.test.ts`)
- [X] T010 [P] [US1] Endpoint tests `apps/cms/tests/legal-endpoint.test.ts` (service only, 400/404, shape)
- [X] T011 [P] [US1] Renderer tests: effective link (form own URL / domain own URL / generated with `lang`), consent context (URL + version, version unavailable → « indisponible » and the lead still stored), routes (redirect to own URL, language choice, 404 unknown host)

### Implementation

- [X] T012 [US1] `apps/cms/src/lib/legal/build.ts`: research R2–R3, R5 (placeholders on the Lexical tree, `convertLexicalToHTML`, SHA-256 version, archive `ON CONFLICT DO NOTHING`)
- [X] T013 [US1] Endpoint `GET /api/legal/:kind` in `apps/cms/src/endpoints/legalPage.ts` (service account) and registration
- [X] T014 [US1] Renderer `apps/web/src/lib/legal.ts` (fetch cached with tags `settings`, `domain:<id>`; effective links) and route `apps/web/src/app/(legal)/confidentialite/page.tsx` per contracts/renderer.md (shell, title, sanitised HTML, version line, link to `/mesure-audience`, `lang`)
- [X] T015 [US1] Lead form link (`apps/web/src/components/lead-form.tsx` + page renderers passing the page language) and consent context in `apps/web/src/app/api/leads/route.ts`
- [X] T016 [US3] Admin labels/descriptions in French for the new Settings and Domains fields (placeholders listed in the field description of each text)
- [X] T017 [US1] Consent records: UI field « Politique acceptée » (`apps/cms/src/components/ConsentPolicyLink.tsx`) linking to the archive row
- [X] T018 [P] [US1] Worker: `/confidentialite`, `/mentions-legales` in `PASS_PATHS` (`apps/edge/src/classify.ts`) + test

**Checkpoint**: privacy policy live per domain; forms linked; texts editable.

---

## Phase 4: User Story 2 — Legal notice (P1)

- [X] T019 [US2] Route `apps/web/src/app/(legal)/mentions-legales/page.tsx` (same contract, kind `notice`) + renderer tests

---

## Phase 5: Footer line (clarification 1, FR-007)

- [X] T020 [US1] `apps/web/src/components/page-shell.tsx`: footer per contracts/renderer.md for real pages (catch-all, ab-variant, confirmation, form-retry, preview), hrefs with the page language, labels from the texts; tests

---

## Phase 6: User Story 4 — Completeness (P2)

- [X] T021 [P] [US4] `apps/cms/src/lib/legal/completeness.ts` + unit tests
- [X] T022 [US4] « Pages légales » column in the domains list, banner on the domain edit view, operator banner in Settings (`apps/cms/src/components/LegalCompleteness*.tsx`)
  - *2026-10-21*: T009–T022 done. Builder `lib/legal/build.ts` (pure `renderLegalPage` + `loadLegalInputs` + `archiveVersion`); endpoint `GET /api/legal/:kind` also returns the domain's own URL (the route redirects); renderer `lib/legal.ts` (`legalLinks`, `consentPolicy`), routes `(legal)/confidentialite|mentions-legales`, footer passed to `PageShell` by its five callers (PageShell renders synchronously in tests, so links are computed before); Worker pass paths; consent record « Politique acceptée »; completeness banner (domain, Settings) and « Pages légales » list column. Tests: cms 701 (+ db), web 238, edge 62.

---

## Phase 7: Polish & validation

- [x] T023 e2e `apps/web/tests/e2e/legal-pages.spec.ts` (direct and edge): FR-014 — a text edit in Settings shows on both pages and in the footer labels of a cached page within the publish delay through the Worker; both pages, language via the footer of an English page, footer on a variant and a confirmation page, lead form link + consent record, axe on a page with the footer and on both legal pages, 360 px
- [x] T024 [P] Runbook (`infra/deploy/README.md`, `README.fr.md`): step « Pages légales » (operator, suppliers, owners, review of the default texts), domain onboarding now includes the owner identity; 018 runbook 5.1 step 4 points to these pages
- [x] T025 Lint, type-check, unit, `test:db`, e2e (direct + edge); quickstart V1–V7 locally; spec status

---

## Phase 8: Release and go-live

- [x] T026 PR, CI, merge (user); tag, snapshot (user), `release.sh`; Worker deploy for the pass paths (user)
- [x] T027 (user) Fill the operator identity and suppliers (Hostinger, Cloudflare, Brevo) in Settings; review the default French texts
- [x] T028 (user) Fill each domain's owner identity (example.com, www.client-site.example); Claude checks quickstart V8 in production
- [x] T029 Then 018: `EXPOSURES=on` (018 T043)

---

## Dependencies & Execution Order

- Setup (1) → Foundational (2) → US1+US3 (3) → US2 (4) and Footer (5) → US4 (6) → Polish (7) → Release (8).
- T012 before T013–T015; T019 reuses T012–T014; T020 needs T014's `lib/legal.ts`.
- 018's activation (T029) waits for T028.

## Parallel Opportunities

- T001 ∥ T002; T004 ∥ T005 ∥ T008 after T003; T009–T011 in parallel; T018 any time; T021 ∥ Phase 4–5.

## Implementation Strategy

MVP = Phases 1–5 (both pages, footer, forms linked, editable texts); US4 rides along; one release; then the owner fills identities and 018 can be switched on.
