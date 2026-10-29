---

description: "Task list for 023 — Bilingual admin (French / English)"
---

# Tasks: Bilingual admin (French / English)

**Input**: Design documents from `/specs/023-admin-i18n/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: included where the constitution (Principle IV) requires them —
the effective-language helper, **every custom hook and endpoint** (cookie
hooks, admin-language endpoint, reserved paths), the proxy, data
transformations (migrations, keyed report lines), catalogue completeness,
redirects and the edge pass-list; e2e walks in each language.

**Organization**: by user story. Build order follows plan.md « Delivery
order », one PR per step: US1+US2 → US7 → US3 (several PRs by menu group) →
US4 → US5 → US6 → Polish. US7 and US6 do not depend on the admin stories.

**Wording rule (FR-014)**: every French string moved into `{ fr, en }`, a
catalogue or `visitor-copy.ts` keeps today's text **byte for byte**; only
the English is new. Copy, don't retype.

**Who runs what**: tasks marked **(user)** are owner steps (release on the
VPS, Worker deploy, production checks).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Payload languages: in `apps/cms/src/payload.config.ts` replace `i18n: { fallbackLanguage: "fr" }` (and its wrong comment) with `i18n: { supportedLanguages: { en, fr }, fallbackLanguage: "en", translations: { fr: { trefle: fr }, en: { trefle: en } } }`, importing `en`/`fr` from `@payloadcms/translations/languages/en` and `/fr` and the catalogues of T002; check payload-totp's 2FA screens pick its own `fr`/`en` strings (`payload-totp/dist/i18n`)
- [X] T002 [P] Catalogues: create `apps/cms/src/i18n/fr.ts` (`export const fr = { … } as const`, empty groups `common`, `nav`, `pageStats`, `ab`, `imports`, `leads`, `settings`, `members`, `editor`, `errors`) and `apps/cms/src/i18n/en.ts` typed `export const en: Catalogue = { … }`, where `Catalogue` (in `apps/cms/src/i18n/types.ts`) is « same keys as `typeof fr`, every leaf `string` » so a missing English key is a type error (research R5); export the client typing for `useTranslation<…>()` and a `TrefleKey` type
- [X] T003 [P] Catalogue test `apps/cms/tests/i18n-catalogue.test.ts`: walks `fr` and `en`, fails on an empty leaf, on a key present in one only (runtime double-check of the type), and on `{{placeholder}}` sets that differ between the two languages

**Checkpoint**: Payload chrome is French or English depending on the browser — not yet controlled by Trefle (US1 fixes this).

---

## Phase 2: Foundational

- [X] T004 Helper `apps/cms/src/lib/admin-locale.ts` (pure, like `admin-time.ts`): `ADMIN_LANGUAGES = ["fr", "en"] as const`, `isAdminLanguage(v)`, `effectiveLanguage(member, settings)` = « member.adminLanguage if valid → settings.adminLanguage if valid → `en` », `intlLocale(lang)` (`fr → fr-FR`, `en → en-GB`), `formatNumber(n, lang, opts?)`, `formatPercent(n, lang, digits?)`, `formatEur(n, lang)` via `Intl.NumberFormat` (research R8)
- [X] T005 [P] Tests `apps/cms/tests/admin-locale.test.ts`: effective-language order incl. invalid stored values; `formatNumber(1234.5, "fr")` = `1 234,5` (narrow no-break space as `Intl` gives) and `"en"` = `1,234.5`; percent and euro formats in both languages
- [X] T006 Label test `apps/cms/tests/admin-labels-config.test.ts` (modelled on `apps/cms/tests/admin-dates-config.test.ts`): walks the sanitized config (collections, globals, nested fields, tabs, groups, arrays, blocks) and reports every `label`, `labels.singular/plural`, `admin.description`, select/radio option `label` and tab `label` that is a plain string or a record missing `fr` or `en`. Starts with an **allow-list** of not-yet-converted collection/global slugs (all of them); each US3 PR removes its slugs; empty list = strict (T046)

**Checkpoint**: shared helpers ready; nothing visible.

---

## Phase 3: User Story 1 — The framework's screens follow the installation language (P1) 🎯 MVP

**Goal**: login, menus, lists, buttons, dialogs in the installation language, whatever the browser says.

**Independent Test**: installation French → login page and a list fully French Payload chrome; switch to English → same screens English (quickstart §2).

- [X] T007 [US1] Settings field in `apps/cms/src/globals/Settings.ts`, Default tab, next to `adminTimezone`: `{ name: "adminLanguage", type: "select", required: true, defaultValue: "en", options: [{ value: "fr", label: "Français" }, { value: "en", label: "English" }], label: { fr: "Langue de l'admin par défaut", en: "Default admin language" }, admin: { description: { fr: "Langue de l'admin pour les membres qui n'en ont pas choisi une dans leur compte, et de la page de connexion.", en: "Admin language for members who have not chosen one in their account, and for the login page." } } }`, editable by administrators only (same access as the tab)
- [X] T008 [US1] Endpoint on the Settings global in `apps/cms/src/globals/Settings.ts` (or `apps/cms/src/endpoints/adminLanguage.ts` registered there): `GET /api/globals/settings/admin-language`, public, reads Settings with `overrideAccess`, answers `{ "language": "fr" | "en" }` and `{ "language": "en" }` on any error, nothing else (contracts/admin-language.md)
- [X] T009 [US1] Migration `apps/cms/src/migrations/<date>_admin_language.ts` (generated with `npm run payload:migrate:create --workspace @trefle/cms`, then checked by hand): up adds `settings.admin_language` enum `fr|en` default `en`, then `UPDATE settings SET admin_language = 'fr' WHERE EXISTS (SELECT 1 FROM users)` **without touching `updated_at`** (a fresh database already has a Settings row created by the 021 migration but no member — it must stay `en`, FR-003); down drops column and enum (data-model.md); regenerate `apps/cms/src/payload-types.ts` (`npm run generate:types`)
- [X] T010 [US1] Proxy `apps/cms/src/proxy.ts` (read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` first): matcher `["/admin", "/admin/:path*", "/api/:path*"]`; keep the `x-pathname` header; set `Accept-Language` on the forwarded request to the installation language, read from `http://127.0.0.1:${process.env.PORT ?? 3000}/api/globals/settings/admin-language`, cached 30 s in module memory, last known value on failure, else `en`; skip the lookup for the endpoint's own path (no recursion); never read or write `payload-lng` (contracts/admin-language.md, research R2)
- [X] T011 [P] [US1] Tests `apps/cms/tests/admin-language-proxy.test.ts`: header overwritten whatever the browser sent; `x-pathname` still set; cache reused within 30 s and refreshed after; failure keeps the last value, first failure gives `en`; the endpoint's own request is not looked up. Tests `apps/cms/tests/admin-language-endpoint.test.ts`: returns the stored value, `en` on error, exposes no other key, needs no auth
- [X] T012 [US1] Migration test `apps/cms/tests/migration-admin-language.test.ts`: Settings row with members → `fr` with `updated_at` unchanged; fresh database with the Settings row created by the 021 migration and no user → `en`; empty database then Settings created → `en`; down path restores the previous schema. Same file also covers the `users.admin_language` column of that migration (T014): up adds a nullable `users.admin_language` with every existing member left empty; down drops it, members otherwise identical before and after
- [X] T013 [US1] e2e seed: in `apps/web/tests/e2e` global setup (and `apps/cms/src/seed/dev.ts`), set Settings `adminLanguage: "fr"` so the 16 specs matching French keep passing (research R11); run the full e2e suite in docker (`npm run test:e2e:docker`) and fix only what the now-French Payload chrome changes (e.g. « Save » → « Enregistrer » selectors)

**Checkpoint**: production after this step: Payload chrome French, Trefle labels unchanged (still French).

---

## Phase 4: User Story 2 — Each member chooses their admin language (P1)

**Goal**: a personal « Installation default / Français / English » choice, effective on the next screen, kept across sign-ins.

**Independent Test**: two members on a French installation, one picks English; each sees their own language; installation unchanged (quickstart §3).

- [X] T014 [US2] Member field in `apps/cms/src/collections/Users.ts`, next to `displayTimezone`, same access (self + administrators): `{ name: "adminLanguage", type: "select", options: [{ value: "fr", label: "Français" }, { value: "en", label: "English" }], label: { fr: "Langue de l'admin", en: "Admin language" }, admin: { placeholder/empty option labelled { fr: "Par défaut de l'installation", en: "Installation default" } } }` — optional, empty = installation default; the nullable `users.admin_language` column (no backfill) is added by the same migration as T009, `20261028_113848_admin_language`; regenerate types
- [X] T015 [US2] Cookie hooks in `apps/cms/src/hooks/users-admin-language.ts`, registered in `apps/cms/src/collections/Users.ts`: `afterLogin` appends to `req.responseHeaders` `Set-Cookie: payload-lng=<value>; Path=/; Max-Age=31536000; SameSite=Lax` (+ `Secure` in production) or an expired `payload-lng` when empty; `afterLogout` expires it; `afterChange` does the same only when `req.user?.id === doc.id` and `adminLanguage` changed (an administrator editing someone else changes no cookie) — contracts/admin-language.md « Cookie » table
- [X] T016 [P] [US2] Tests `apps/cms/tests/users-admin-language.test.ts`: each row of the cookie table (login with/without choice, own save changed/unchanged, admin edits another member, logout); cookie attributes; no cookie when `responseHeaders` is absent (local API); changing `adminLanguage` changes no other field of the member (FR-015)
- [X] T017 [US2] Immediate switch: after the member saves their own account, the admin refreshes so the new cookie applies (`router.refresh()` from a small client component on the account view, e.g. in `apps/cms/src/components/AdminLanguageRefresh.client.tsx` mounted as an `afterInput`/field component of `adminLanguage`, triggered on successful save when the value changed); check two open tabs: the other one switches at its next navigation
- [X] T018 [US2] Hide Payload's own Account « Language » selector in `apps/cms/src/app/(payload)/custom.css` (target the class rendered by `@payloadcms/next/dist/views/Account/Settings/LanguageSelector.js`, read it there; scoped to the account view) so `adminLanguage` is the only control
- [X] T019 [US2] e2e `apps/web/tests/e2e/admin-language.spec.ts`: installation French; member B sets English → next screen English without sign-out, in under 5 s (SC-004), still English after sign-out/in; member A French; administrator switches installation to English → A follows within 30 s, B unchanged; signed-out login page uses the installation language whatever `Accept-Language` the browser sends (reuse the e2e shared login: global-setup admin token, a per-test `X-Real-IP`, the admin driven with an injected `Authorization: JWT` header)

**Checkpoint**: US1 + US2 = one PR / release (plan step 1).

---

## Phase 5: User Story 7 — Trefle's public paths are in English (P3, plan step 2)

**Goal**: `/privacy`, `/legal-notice`, `/audience-measurement` everywhere; old paths one 308 hop.

**Independent Test**: quickstart §6 — footer/form links use new paths; the three old paths answer one 308 with the query kept; `/privacy` cannot be taken by an editor page.

- [X] T020 [P] [US7] Shared constants `packages/shared/src/edge.ts`: `MEASUREMENT_PAGE_PATH = "/audience-measurement"`, add `PRIVACY_PAGE_PATH = "/privacy"`, `LEGAL_NOTICE_PAGE_PATH = "/legal-notice"` and `LEGACY_PUBLIC_PATHS = { "/confidentialite": "/privacy", "/mentions-legales": "/legal-notice", "/mesure-audience": "/audience-measurement" } as const`; update `packages/shared` tests
- [X] T021 [US7] Move route folders in `apps/web/src/app`: `(legal)/confidentialite` → `(legal)/privacy`, `(legal)/mentions-legales` → `(legal)/legal-notice`, `(measurement)/mesure-audience` → `(measurement)/audience-measurement` (`git mv`, content unchanged); in `apps/web/src/lib/legal.ts` change `legalHref`'s path type and every call to the new constants; `apps/web/src/components/lead-form.tsx` fallback → `/privacy`
- [X] T022 [US7] Old paths (read the Next docs on `permanentRedirect` in `node_modules/next/dist/docs/` first): new `apps/web/src/app/(legal)/confidentialite/page.tsx`, `(legal)/mentions-legales/page.tsx`, `(measurement)/mesure-audience/page.tsx` that only call `permanentRedirect` (308) to the target the new page would use — the domain's `ownPrivacyPolicyUrl` / `ownLegalNoticeUrl` when set, else the new path **with the incoming query string** — one hop always (contracts/public-paths.md); factor the target computation once in `apps/web/src/lib/legal.ts` and use it in the new pages' own owner-address redirect too
- [X] T023 [P] [US7] Tests `apps/web/tests/legal-paths.test.ts`: the target function for each old path with/without owner address and with `?lang=en`; e2e in `apps/web/tests/e2e` (update every spec opening `/confidentialite`, `/mentions-legales`, `/mesure-audience` to the new paths; add one asserting a single 308 + `location` per old path)
- [X] T024 [P] [US7] Edge: `apps/edge/src/classify.ts` `PASS_PATHS` = new paths + `Object.keys(LEGACY_PUBLIC_PATHS)`; `apps/edge/tests/fetch.test.ts` cases for the six paths (« pass »)
- [X] T025 [P] [US7] Reserved paths `apps/cms/src/hooks/pages-path-validate.ts`: refuse all six paths with a message naming the reserved path; tests in `apps/cms/tests` (existing path-validate test file) for each
- [X] T026 [US7] Defaults and help texts: `apps/cms/src/lib/legal/defaults.ts` (links and the A/B notice → new paths), `apps/cms/src/collections/Domains.ts` descriptions (lines 187, 193), `apps/cms/src/fields/form.ts` comment, `apps/cms/src/seed/dev.ts`, `apps/cms/scripts/import-eval` reference, `packages/grapesjs-page-import/tests/penpot` fixture expectation if it names a path; regenerate `payload-types.ts`; then `git grep -n "confidentialite\|mentions-legales\|mesure-audience" -- apps packages infra docs` must list only the redirect pages, `LEGACY_PUBLIC_PATHS`, the reserved-path rule, the migration of T027 and their tests (FR-022)
- [X] T027 [US7] Data migration `apps/cms/src/migrations/<date>_english_public_paths.ts`: for each stored legal text seeded by `20261021_101738_legal_pages` (read that migration for tables/columns), replace the value **only when equal** (links' random ids and key order aside — see data-model.md) to the pre-023 default converted the way that migration did (`convertMarkdownToLexical`; keep a frozen copy of the old **markdown** inside the migration), with the new default; anything else left (a re-saved but re-serialized text counts as edited); log (console) every page whose path is `/privacy`, `/legal-notice` or `/audience-measurement`; down reverses under the same identity rule (data-model.md)
- [X] T028 [P] [US7] Migration test `apps/cms/tests/migration-english-paths.test.ts`: untouched default rewritten, edited text untouched, down restores, a page at `/privacy` reported
- [X] T029 [P] [US7] Docs: `infra/deploy/README.md` and `infra/deploy/README.fr.md` (sections 5.1, the legal-pages section, release notes) and `docs/` → new paths, with a release note « Worker deploy required with this release; old paths redirect »
- [X] T030 [US7] (user) Release US7: tag on the user's call (versions change only when the user says so), deploy the origin **and** the edge Worker in the same window, then check the three `curl -sI` of quickstart §6 against a production domain and a domain with its own policy address *Done 2026-10-29 with the whole feature as tag `023.1-admin-i18n` (`023-admin-i18n` never went live: its new preflight key check refused production's Garage key, fixed by #93), Worker version 56b5856d deployed in the same window, HTML purged after both. On both production domains the old paths answer 308 to the new ones (query kept) and the new ones 200.*

**Checkpoint**: every Trefle public path is English; old links still work.

---

## Phase 6: User Story 3 — Trefle's labels and screens are translated (P2, plan step 3)

**Goal**: no French label/help/option/button left in an English admin; French unchanged.

**Independent Test**: English member walks every menu entry and opens one document per collection — no French interface text (editor-authored content excepted); French member — reads as today (FR-014: Trefle strings already English stay English), framework chrome in French.

Each group below is one PR: convert labels to `{ fr, en }` (research R4), move component strings to the catalogue under the named group and read them with `useTranslation()` (client) or `req.i18n.t` / the `i18n` server prop (server components), format numbers with `admin-locale.ts`, remove the group's slugs from T006's allow-list.

### Group « Reports »

- [X] T031 [P] [US3] Labels in `apps/cms/src/collections/Experiments.ts`, `apps/cms/src/collections/PageStats.ts`, `apps/cms/src/collections/PageStatsHourly.ts`, `apps/cms/src/collections/AbExposures.ts`, `apps/cms/src/collections/AbConversions.ts`, `apps/cms/src/collections/EdgeViewWindows.ts` (incl. the `admin.group` « Reports » label)
- [X] T032 [US3] Screens → catalogue `pageStats` / `ab`: `PageStatsView.tsx`, `PageStatsTable.client.tsx`, `PageStatsChart.client.tsx`, `PageStatsPanel.tsx`, `DateRangePicker.client.tsx`, `CollectionDateRangeFilter.client.tsx`, `ExperimentAnalysis.tsx`, `ExperimentResultsPanel.tsx`, `ExperimentStats.tsx`, `ExperimentVerdictCell.tsx`, `RefreshAnalysisButton.client.tsx`, `VariantActions.client.tsx`, `PageExperimentsTab.tsx` in `apps/cms/src/components/`; `apps/cms/src/lib/page-stats.ts`, `apps/cms/src/lib/dateRangeBounds.ts` user-facing strings — *done with `PromoteActions`, `ExperimentsRunningBanner` and `ExperimentPeriodFilter` too; `PageStatsPanel.tsx` left: registered nowhere (Pages.ts comment), dead code; `dateRangeBounds.ts` had no user-facing string*
- [X] T033 [US3] Verdict sentences `apps/cms/src/lib/ab-verdict-copy.ts` (and the strings in `lib/ab-verdict.ts`): take a `t` (and `lang` for numbers) instead of returning French; update `apps/cms/tests/ab-verdict-copy.test.ts` to assert the French output is unchanged and add the English cases (same numbers)
- [X] T034 [US3] CSV header of `apps/cms/src/endpoints/pageStatsReport.ts` in the exporting member's language (`req.i18n`), values unchanged (ISO dates, plain numbers); test

### Group « Contents »

- [X] T035 [P] [US3] Labels in `apps/cms/src/collections/Pages.ts`, `Domains.ts`, `Media.ts`, `Fonts.ts`, `LegalVersions.ts`, `OptInEmails.ts`, `AdminImages.ts`, `apps/cms/src/fields/form.ts`, `apps/cms/src/fields/customCode.ts`
- [X] T036 [US3] Screens → catalogue: `PageCreateWizard.tsx`, `PageNotices.tsx`, `PageLiveUrl.client.tsx`, `PublishedUrl.client.tsx`, `RevalidationStatus.tsx`, `ScriptsConsentWarning.client.tsx`, `MediaReplaceConfirm.client.tsx`, `MediaUsage.client.tsx`, `MediaUsageList.client.tsx`, `DomainFontRow.client.tsx`, `ConsentPolicyLink.tsx`, `LegalCompleteness.tsx` in `apps/cms/src/components/`; `apps/cms/src/lib/legal/completeness.ts`, `apps/cms/src/lib/fonts.ts` messages. *Done 2026-10-28: also the Fonts « Domaines » column and the starter template names; the wizard's import strings went to catalogue `imports`.*
- [X] T037 [US3] Validation and guard messages → `req.t` (catalogue `errors`): `apps/cms/src/hooks/pages-publish-guard.ts`, `pages-custom-code-guard.ts`, `pages-path-validate.ts` (incl. US7's reserved-path message), `pages-lead-guard.ts`, `pages-confirmation-guard.ts`, `pages-no-inline-images.ts`, `pages-optin-email-validate.ts`, `media-delete-guard.ts`, `upload-edits-once.ts`, `domains-fonts.ts`, `domains-gtm-validate.ts`; endpoint `apps/cms/src/endpoints/domainFontUsage.ts`; existing hook tests keep asserting the French text and gain one English case each. *Done 2026-10-28 with the own reader (`adminText(req.i18n.language)`, not `req.t`, research R5). Only the French messages moved (custom-code guard, media delete guard, code length and duplicate id, font errors); the messages that are English today (publish guard, path, lead, confirmation, inline images, opt-in email, GTM) stay English in both languages, like the labels (FR-014). `upload-edits-once.ts` and `domainFontUsage.ts` have no message.*

### Group « Imports »

- [X] T038 [P] [US3] Labels in `apps/cms/src/collections/PageImports.ts`, `apps/cms/src/collections/SiteImports.ts`
- [X] T039 [US3] Screens → catalogue `imports`: `SiteImportWizard.client.tsx`, `SiteImportButton.tsx`, `SiteImportPagesCell.tsx`, `ImportPageCell.tsx`, `ImportBudgetBanner.tsx` in `apps/cms/src/components/`; `apps/cms/src/lib/import/budget.ts` messages (amounts via `formatEur`). (`ImportReportPanel.client.tsx` and report lines: US5.) *Done 2026-10-28; error codes stay as codes in both languages. `budget.ts`'s `resetDayFr` and `site-errors.ts`'s `PATH_CHARS`/`TOO_MANY_BOARDS` are only used by the start endpoints now (the wizard reads the catalogue): they move with T052.*

### Group « Leads »

- [X] T040 [P] [US3] Labels in `apps/cms/src/collections/Leads.ts`, `ConsentRecords.ts`, `DataSubjectRequests.ts`
- [X] T041 [US3] Screens and messages → catalogue `leads`: `DsrActions.client.tsx`; endpoints `leadsExport.ts` (CSV headers in the member's language, values unchanged), `dsrExport.ts`, `dsrErase.ts`, `consentWithdraw.ts`, `runRetention.ts` admin-facing messages; tests for the export headers in both languages *Done 2026-10-28: all Leads labels were English → `sameInBoth`; only `DsrActions` had French. The CSV headers are field names, English today (`leadId`, `submittedAt`…), kept as is in both languages (FR-014); the DSR/consent/retention endpoints return codes only, no message.*

### Group « Settings » + members + chrome

- [X] T042 [P] [US3] Labels in `apps/cms/src/globals/Settings.ts` (69 strings, every tab), `apps/cms/src/globals/EdgeAccess.ts`, `apps/cms/src/collections/Users.ts`, `Languages.ts`, `ActivityLog.ts` *Done 2026-10-28; also the date-filter labels of every list (`clientProps`), which the walker does not see.*
- [X] T043 [US3] Screens → catalogue `settings` / `members` / `nav`: `AdminChrome.tsx`, `Logo.tsx`, `Avatar.client.tsx`, `NavResize.client.tsx`, `TimezoneSelect.client.tsx` (its `emptyLabel` client prop becomes a key), `ResetTotpButton.client.tsx`, `EdgeDriftBanner.tsx`, `AdminDate.client.tsx` in `apps/cms/src/components/`; `apps/cms/src/lib/totp-setup-hint.ts`, `apps/cms/src/lib/admin-time.ts` labels; hooks `settings-branding.ts`, `settings-cookie-banner.ts`, `users-last-admin.ts`, `users-invite.ts`, `after-error.ts` messages; endpoints `resetTotp.ts`, `edgeAccess.ts`, `refreshAnalysis.ts`; existing tests of these hooks and endpoints keep asserting the French text and gain one English case each (Principle IV) *Done 2026-10-28. `TimezoneSelect`'s `emptyLabel` is no longer set anywhere (nothing to do); `admin-time.ts` has no label; `users-last-admin.ts`, `users-invite.ts`, `after-error.ts`, `edgeAccess.ts` messages are English today (kept). The TOTP setup hint is now added in each language. `AdminDate` resolves `{ fr, en }` descriptions (it only showed plain strings). « Rafraîchir » errors are translated by the endpoint; the `analysisError` stored on the experiment stays French until US5.*
- [X] T044 [US3] Activity log: check how entries are written (`apps/cms/src/hooks/pages-activity.ts`, `settings-activity.ts`, `users-activity.ts`); system-generated summaries become a code + values rendered in the reader's language; entries already stored stay as written (spec Edge Cases) *Done 2026-10-28: entries store a type code, ids and `meta` values only — no written summary, nothing to translate.*
- [X] T045 [US3] Dashboard / menu groups: the `admin.group` labels of every collection (« Reports », « Contents », « Imports », « Leads », « Settings ») as `{ fr, en }` — check the French names match today's menu (022 US2) *Done 2026-10-28 with each group: « Reports », « Contents », « Imports », « Leads », « Settings » are English today, `sameInBoth`.*
- [X] T046 [US3] Make T006 strict (empty allow-list); run `npm run typecheck && npm test --workspace @trefle/cms`; grep `apps/cms/src/components` and `apps/cms/src/{hooks,endpoints,lib}` for remaining French literals (`git grep -nE "[«»éèàçê]"`), each remaining hit justified (comment, test fixture, AI prompt, editor content) or moved *Done 2026-10-28: the walker has no allow-list any more. Remaining French literals in `components`/`hooks`/`endpoints`/`lib`/`jobs`: import errors, refusals, report lines and `ImportReportPanel` (US5 T051–T054); `lib/legal/defaults.ts` and `build.ts` (legal page content, in the page language); `leadIntake.ts` default success message (visitor, US6); `growthbook.ts` object names in GrowthBook and the stored `analysisError` (US5); `PageStatsPanel.tsx` (unregistered); comments and language names.*

**Checkpoint**: English admin complete except the editor (US4) and server/import reports (US5).

---

## Phase 7: User Story 4 — The page editor speaks the member's language (P2, plan step 4)

**Goal**: panels, tooltips, blocks, traits, code view in the member's language; content identical.

**Independent Test**: English member opens a page: every editor label English; the stored project data after a no-op save is identical to before.

- [X] T047 [US4] GrapesJS i18n in `apps/cms/src/fields/grapesjs/Editor.client.tsx`: `i18n: { locale: lang, detectLocale: false, messages: { fr } }` with `fr` from `grapesjs/locale/fr` (English built in), `lang` from `useTranslation().i18n.language` (research R6, see the `grapesjs` skill for the i18n API) *Done 2026-10-28: the locale is imported as `grapesjs/locale/fr.mjs` (no types shipped: `src/types/grapesjs-locale.d.ts`). GrapesJS's French names its buttons and devices in French: e2e selectors moved to the button class (`.fa-th-large`) and the device ids.*
- [X] T048 [US4] Trefle editor strings → catalogue `editor`: block categories and labels in `apps/cms/src/fields/grapesjs/blocks.ts`, `customCodeBlock.ts`, `codeView.ts`, `codeViewMessages.ts`, `editableTexts.ts`, trait labels and « Remplacer partout » dialogs (search `apps/cms/src/fields/grapesjs/` for French literals); pass `t` from `Editor.client.tsx` into the builders; block **ids, classes and content** unchanged *Done 2026-10-28: block labels are catalogue keys; `codeView`, `codeViewMessages`, `customCodeBlock` take `t`; the layout plugin's Section/Colonnes/Colonne and the carousel's words became plugin options (`packages/grapesjs-page-import`, French defaults `CAROUSEL_LABELS_FR`). Block content unchanged.*
- [X] T049 [P] [US4] Test `apps/cms/tests/grapesjs-blocks-i18n.test.ts`: the block list built with the English `t` and with the French `t` have identical ids, content and categories ids, only labels differ; e2e: open « Open Blocks » as an English member and find an English category name (selecting a component then opening « Open Blocks » races the style panel: open the blocks panel first) *Done 2026-10-28: `tests/grapesjs-blocks-i18n.test.ts`; e2e in `admin-language.spec.ts` (same page in en and fr: GrapesJS's « Open Blocks » title and the « Testimonial » / « Témoignage » tile; the canvas text is identical).*

---

## Phase 8: User Story 5 — Server messages and import reports in the reader's language (P3, plan step 5)

**Goal**: refused saves, action results and import reports in the reader's language; AI lines in the launcher's language; old reports as written.

**Independent Test**: English member: duplicate page path → English message naming the path; import with a known warning → English Trefle lines (quickstart §4).

- [X] T050 [US5] Report shape `packages/grapesjs-page-import/src/serialize.ts`: `type ReportText = string | { key: string; values?: Record<string, string | number> }`; `simplified[].what/how`, `omitted[].what/reason`, `actionsBeforePublish[]` accept `ReportText`; new optional `language: "fr" | "en"` on `ImportReport` (absent = French) — data-model.md; update the package's tests and types *Done 2026-10-29: `ReportText`, `language?` and also `formFieldsUnmapped` accept it; the package's own French lines are keyed, their French kept in `REPORT_TEXT_FR` (+ `reportText`, `reportInFrench` for plain-text uses and tests).*
- [X] T051 [US5] Trefle-written report lines → keys: `apps/cms/src/jobs/pageImport.ts` (e.g. « Fin de la page » line 181), `apps/cms/src/jobs/siteImport.ts`, `apps/cms/src/lib/import/form-mapping.ts`, `device-summary.ts`, `device-check.ts`, `images.ts`, `saved-file.ts` emit `{ key, values }` with keys in catalogue `imports.report` *Done 2026-10-29 for the jobs, `form-mapping.ts`, `images.ts` (an embedded image keeps its `embedded:` address, named at render). `device-check.ts` writes no line (its « … » quotes page text); `saved-file.ts` none; `device-summary.ts` is rendered by the panel in the reader's language. Not keyed yet: the Penpot converter's own lines in the package (« Carrousel « … » », « Cette page ne se réorganise pas sur mobile… ») — still plain French strings, shown as written.*
- [X] T052 [US5] Error texts: `apps/cms/src/lib/import/errors.ts` `IMPORT_ERROR_MESSAGES` and `apps/cms/src/lib/import/site-errors.ts` move to catalogue `imports.errors` (codes unchanged); callers (`endpoints/pageImportStart.ts`, `pageImportCancel.ts`, `siteImportStart.ts`, `siteImportAnalyse.ts`, `pageImportBudget.ts`, the `page-imports.errorCode` select options) translate with `req.t` or at render *Done 2026-10-28: `IMPORT_ERROR_MESSAGES` / `SITE_IMPORT_ERROR_MESSAGES` are the French catalogue (`imports.errors`, `imports.siteErrors`); `importErrorMessage` / `siteImportErrorMessage` give the member's language. Every refusal of the start, cancel and analyse endpoints follows `req.i18n`; the jobs still store the French text and the wizards show the stored error from its code (a Penpot « page too large » keeps the board's name in French). `resetDay(lang)` replaces `resetDayFr` in the endpoint.*
- [X] T053 [US5] AI lines in the launcher's language: `apps/cms/src/lib/import/convert.ts` prompt §3 and §6 take a `reportLanguage` (« in French » / « in English », same instructions otherwise); `pageImportStart.ts` / `siteImportStart.ts` store the launcher's effective language on the import, the job passes it and writes `report.language`. **Prompt change → re-measure with the `trefle-import-eval` skill (free dry run at least) before merging** *Done 2026-10-29: `systemPrompt(lang)`; the French prompt is byte for byte the one measured before 023 (sha256 pinned in import-convert.test.ts), English changes only rules 3 and 6. Field `page-imports.reportLanguage` (migration 20261029_140347). Site imports have no AI step: nothing to store. The eval scripts pin `payload-lng=fr` so runs stay comparable. Dry run 2026-10-29 (user's choice, no paid run): 6/8 reference pages render as before (parisjetaime, mariages.net blocked, as before). The English prompt itself is not measured yet.*
- [X] T054 [US5] Panel `apps/cms/src/components/ImportReportPanel.client.tsx`: render `{ key, values }` lines with `t`, plain strings as written (old reports and AI lines), section headings and buttons from catalogue `imports` *Done 2026-10-29 (`lib/import/report-text.ts` `reportLine`: an unknown key shows as itself).*
- [X] T055 [P] [US5] Tests: `apps/cms/tests/import-report-i18n.test.ts` — a report mixing keyed lines, AI strings and a pre-023 report renders without an empty line in both languages; keyed lines differ by language, strings do not; job test: `report.language` = launcher's language *Done 2026-10-29; the job's `report.language` case came with T053.*
- [X] T056 [US5] Remaining server messages → `req.t`: `apps/cms/src/endpoints/leadIntake.ts`, `leadsConfirm.ts`, `createTestVariant.ts`, `startTest.ts`, `promoteVariant.ts`, `concludeTestWithoutPromoting.ts`, `pageConflictCheck.ts` (duplicate path message names the conflicting path), `mediaAliases.ts`, `mediaUsage.ts`, `legalPage.ts` admin-facing responses (visitor-facing responses are US6); one English test per endpoint that returns a member-facing message *Done 2026-10-28: nothing left to move — these endpoints answer English technical errors (`missing experiment id`, `not found`…), English today, kept in both languages (FR-014); the duplicate path refusal (publish guard) is English today and names the path; `leadIntake.ts`'s default success message is visitor-facing (US6).*
---

## Phase 9: User Story 6 — Built-in visitor texts follow the page's language (P3, plan step 6)

**Goal**: an English page answers its visitors in English across the lead journey; French pages unchanged.

**Independent Test**: quickstart §5 on a French, an English and a Spanish page.

- [X] T057 [US6] Catalogue `apps/web/src/lib/visitor-copy.ts`: `fr` (today's strings, byte for byte, from every file of research R9) and `en` typed to the same shape; `visitorCopy(code) → { lang: "fr" | "en"; copy }`, anything but `fr`/`en` → English (contracts/visitor-copy.md); validation messages keep the editor's field label (`The field “{label}” must be a valid phone number.`) *Done 2026-10-29: `apps/web/src/lib/visitor-copy.ts` (+ `error-copy.ts`, `fill-text.ts` so client components import only what they show). Also the lead form's default submit label and honeypot label. CMS: `form.submitLabel` loses its « Envoyer » default (migration 20261029_143638 drops only the column default; saved labels stay); `leadIntake` no longer sends a French default thank-you.*
- [X] T058 [P] [US6] Tests `apps/web/tests/visitor-copy.test.ts`: same keys and placeholders in both languages; `es` → English with `lang: "en"`; French strings equal to a frozen snapshot of today's literals *Done 2026-10-29.*
- [X] T059 [US6] Lead route `apps/web/src/app/api/leads/route.ts`: validation messages, thank-you, « Un instant » rate-limit and back-link pages from `visitorCopy(cfg.language?.code)`; the page's own success message keeps priority (FR-018); existing route tests keep French and gain English cases *Done 2026-10-29: page language once known, domain default before; a too-fast submit is refused in its signed page's language (`verifyFormToken` names the page on a timing refusal); `<html lang>` on every result page; `lang` passed on to /form-retry and /confirmation.*
- [X] T060 [US6] E-mail link pages `apps/web/src/app/confirm/page.tsx`, `apps/web/src/app/unsubscribe/page.tsx`: language = lead's page language → domain default page language → `en` (via `apps/web/src/lib/payload-client`), every text from `visitorCopy`, container `lang` set *Done 2026-10-29: new service-only `GET /api/lead-language/:id` (the lead's stored language code, nothing else); the done redirect carries `lang`; the banner follows the same language.*
- [X] T061 [US6] Result and fallback pages: `apps/web/src/app/(form-retry)/form-retry/page.tsx`, `apps/web/src/app/(confirmation)/confirmation/page.tsx` (fallback thank-you, « retirer votre consentement »), `apps/web/src/components/legal-page.tsx` (fallback titles, « en cours de rédaction »), `apps/web/src/app/(measurement)/audience-measurement/page.tsx` (whole text, by `?lang=`) *Done 2026-10-29; measurement page: `?lang=` → domain default → English (the policy's link has no `?lang`, so a domain without default language shows it in English).*
- [X] T062 [US6] Client components: `apps/web/src/components/carousel.tsx` aria labels and `apps/web/src/components/lead-form.tsx` privacy-link text + « (nouvelle fenêtre) » take the page language from the renderer (prop from `apps/web/src/lib/render.ts` / `page-shell.tsx`); only the needed strings reach the client bundle (SC-009 — at most 2 KB gzipped more per page; check the page's JS size before/after) *Done 2026-10-29: carousel words passed as props from the renderer; the page shell now declares the page's language (`lang` + `data-page-lang`), Trefle's words carry `lang` only when they differ. Client JS added: the error texts (≈0.5 KB gz) and `fill` (≈0.25 KB gz) — estimated from the sources, not measured on a build.*
- [X] T063 [US6] Error pages: `apps/web/src/app/error.tsx` uses the nearest `lang` attribute in the document; `apps/web/src/app/global-error.tsx` English (no page context), each with `lang` on its container *Done 2026-10-29: `error.tsx` reads `[data-page-lang]`, else `<html lang>` (the root layout's « fr »); in practice French until the document itself declares the page's language.*
- [X] T064 [US6] e2e `apps/web/tests/e2e/visitor-language.spec.ts`: English page lead journey (invalid phone → English message; success; confirm and unsubscribe links from Mailpit) all English; French page unchanged; Spanish page → English with `lang="en"`; axe on the English page (no serious/critical) *Done 2026-10-29: 3 tests (English journey incl. Mailpit confirm link + axe, French unchanged, Spanish → English marked). Full e2e 107 passed, 4 skipped.*

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T065 e2e `apps/web/tests/e2e/admin-english-walk.spec.ts` (SC-001): an English member signs in with 2FA, creates and publishes a page in the editor, starts an import, reads Pages Stats and an A/B verdict, exports leads; the spec collects visible text nodes and fails on any word of a French stop-list (« Enregistrer », « Rechercher », « Paramètres », « Pages publiées »…) outside editor-authored content *Done 2026-10-29, with T066 in one spec, `admin-language-walk.spec.ts`: the core screens (dashboard, Pages list, creation wizard, editor, A/B tab, imports, Pages Stats, experiments and a verdict, leads with the export, members, Settings, account) read in each language through the `payload-lng` cookie, no shared state changed; people's content (table cells, canvas, field values) not read. It found the leads export button still French only (`ExportLeadsButton.tsx`, now in the catalogue). The two-factor screens run on a second cms (admin-totp.spec.ts) and the actions (publish, import, export) are covered by their own specs, so the walk reads screens rather than redoing them.*
- [X] T066 [P] French walk check (SC-002): same journey as a French member, fails on an English stop-list (« Save », « Create new », « Search »…), FR-013 exceptions excluded *Done 2026-10-29 in T065's spec: the stop-list is the framework's words; labels English before 023 (FR-014) and Lexical's « Add block » / « Edit link » (FR-013, added to plan.md) are taken out first.*
- [X] T067 (user) Take a production database dump and hand it over locally (Claude gives the command; production DB reads are the user's) *Done 2026-10-29: the user copied the latest nightly dump (578 KB) to `~/Claude_projects/prod-dump/`, outside the repo.*
- [X] T068 Upgrade check on the production-data copy of T067 (SC-005, quickstart §7): restore it locally, migrate, diff Settings and users before/after (`admin_language` excepted), check untouched legal defaults rewritten and edited ones not; record the result in the PR body *Done 2026-10-29: restored into a separate local database (`trefle_prodcopy`, prod at 022), 50 tables snapshotted, the four 023 migrations applied, every table compared on its columns from before. Changed: `payload_migrations` (expected) and `settings_legal_texts` only, one value: the legal notice's link `/confidentialite` → `/privacy` (untouched default). The privacy policy was edited in production: left as is, its `/mesure-audience` link redirects. Settings `admin_language` = `fr`, 4 users with no choice of their own, no editor page on a new path. Copy database and snapshots deleted afterwards; details in PR #92.*
- [X] T069 [P] Constitution and docs: `apps/cms/src/payload.config.ts` comments updated; deploy READMEs (both languages) get a « Admin language » paragraph (installation setting, member choice, how to force French on a new install); `docs/` features overview entry for 023 *Done 2026-10-29: payload.config.ts comment already describes the language choice; « Admin language » paragraph in both deploy READMEs (§1.4); docs/features.md entry, limits line and spec map row. The constitution names no admin language: unchanged.*
- [X] T070 Run lint, type-check, all tests and `docker compose` smoke for every app; record manual checks in the PR body (Principle IV) *Done 2026-10-29 on the Polish branch (on top of US6): eslint and tsc clean (cms, web), unit tests cms 830 / web 256, full e2e 108 passed, 4 skipped, 1 failed (`admin-language`: « fetch failed », the cms out of reach for a moment; passes on rerun with the walk, 4/4), stack healthy under compose. To redo once on main after #91 and this PR are merged.*
- [X] T071 (user) Release each step on the user's call (tags = releases); after the US1+US2 release, check in production: login page French, an admin screen French, Settings values unchanged *Done 2026-10-29: one release for every step (`023.1-admin-i18n`). Checked in production: published pages `lang="fr"` with French form texts, legal pages French; the user checked the admin (French) and the settings. `example.com` has no domain default language and stays so (anglophone public, the user's choice): its measurement page is English; its pages and legal texts are still French, the user will set them later.*
- [X] T072 Memory/state: update `trefle-admin-i18n-state` memory after each release *Done 2026-10-29: memory `trefle-admin-i18n-state` updated after the release.*

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T006)** → everything else.
- **US1 (T007–T013)** → **US2 (T014–T019)**: US2 relies on the proxy and Settings field; they ship together. T012 also tests T014's migration, so it runs after T014.
- **US7 (T020–T030)**: depends only on Setup for the reserved-path message (can use a plain French+English string until T037); independent of US1–US6; T030 needs the Worker deploy.
- **US3 (T031–T046)**: after US1+US2 (needs supported languages and the catalogue); groups are independent of each other; T046 last.
- **US4 (T047–T049)**: after Setup; best after US3 (shared `common` keys).
- **US5 (T050–T056)**: after US3 « Imports » (T038–T039); T053 needs an import-eval run.
- **US6 (T057–T064)**: independent of the admin stories (renderer only); after US7 for the moved measurement page path (T061).
- **Polish (T065–T072)**: after the stories it checks.

## Parallel examples

- Setup: T002 and T003 together.
- US1: T011 while T013 runs the e2e suite (T012 waits for T014).
- US7: T020, T024, T025, T029 in parallel (different apps), then T021 → T022 → T023.
- US3: the label tasks T031, T035, T038, T040, T042 are in different files and can run in parallel; each group's screen task follows its label task.
- US6: T058 alongside T059–T063 once T057 exists.

## Implementation Strategy

1. **MVP = US1 + US2** (plan step 1): one release, French chrome in production, member choice ready.
2. **US7** early (small, stabilises public links), with the Worker.
3. **US3** group by group, each a release-able PR; the English admin becomes usable as groups land.
4. **US4**, **US5**, **US6**, then Polish walks in both languages.
