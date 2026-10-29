- **Decision**: `apps/cms/src/i18n/fr.ts` (today's wording, the source) and
  `apps/cms/src/i18n/en.ts` typed as the same shape as `fr` (a recursive
  « same keys, string leaves » type), read by Trefle's own
  `adminText(lang)` (`apps/cms/src/i18n/index.ts`): `t("pageStats.empty")`.
  - Admin components: `useAdminText()` (`i18n/useAdminText.ts`, the language
    from Payload's `useTranslation()`).
  - Server components, endpoints, hooks: `adminText(i18n.language)` /
    `adminText(req.i18n.language)`.
  - Pure libraries that build sentences (`ab-verdict-copy.ts`,
    `import/errors.ts`, `import/site-errors.ts`, `import/device-summary.ts`)
    take the language instead of returning French.
  - *Changed during US3 (2026-10-28)*: first planned as Payload
    `i18n.translations` under a `trefle` namespace read with Payload's `t`.
    Payload's `t` only splits keys on `:` (`trefle:pageStats.empty` never
    resolves), logs and returns the key when one is missing, and its typing
    does not know custom keys; the own reader keeps the typed keys and the
    same language (Payload's `i18n.language`).
  - Labels that are English today and stay English in the French admin
    (FR-014) are `sameInBoth("…")` = `{ fr: "…", en: "…" }`.
# Research: Bilingual admin (French / English)

Every decision below was checked against the code on 2026-10-28 (Payload
3.88.0, `@payloadcms/next`/`ui`/`translations` 3.88.0, Next 16.3.4,
GrapesJS 0.22.16).

## R1 — How Payload picks the admin language today

- **Finding**: `payload/dist/utilities/getRequestLanguage.js` returns, in this
  order: the `payload-lng` cookie (if a supported language), the browser's
  `Accept-Language` (if supported), `config.i18n.fallbackLanguage`. It runs
  for every admin page (`initReq`) and every REST call
  (`createPayloadRequest`), so `req.i18n` / `req.t` are already per request.
- `payload.config.ts` sets only `i18n: { fallbackLanguage: "fr" }`. Without
  `supportedLanguages`, Payload keeps `{ en }`; `fr` is not supported, so the
  cookie and header are ignored and the chrome is English. The comment there
  (« defaults to the full bundled set ») is wrong and goes.
- Payload's Account view already shows a « Language » selector once two
  languages are supported (`views/Account/Settings/LanguageSelector`); it
  only writes the `payload-lng` cookie (one year, this browser) through a
  server action — nothing is stored on the member.

## R2 — Effective language: member cookie + installation default through the proxy

- **Decision**:
  1. `i18n.supportedLanguages: { en, fr }` (from
     `@payloadcms/translations/languages/en|fr`), `fallbackLanguage: "en"`.
  2. The member's choice lives on the member (`users.adminLanguage`, R3) and
     is mirrored into the `payload-lng` cookie by Trefle: set or cleared in
     an `afterLogin` hook, cleared in `afterLogout`, and set or cleared in
     `afterChange` when a member saves **their own** account — through
     `req.responseHeaders` (Payload appends them to the REST response).
  3. The installation default reaches Payload through the browser-language
     slot: `apps/cms/src/proxy.ts` (already on `/admin`) also covers `/api`
     and **overwrites `Accept-Language`** on the forwarded request with the
     installation language. A member without a choice has no cookie, so
     Payload falls to that header; a signed-out visitor too (login, reset,
     2FA). The browser's own language never decides (FR-005).
  4. The proxy gets the installation language from a public endpoint on the
     Settings global (`GET /api/globals/settings/admin-language` →
     `{ "language": "fr" }`), fetched on the loopback address and kept 30 s
     in module memory; on failure it keeps the last value, else `en`.
- **Rationale**: no fork of Payload's resolution and no config mutation;
  Payload keeps resolving the language itself, from inputs Trefle controls.
  The proxy runs on Node.js in Next 16 (`next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
  « Runtime »), so a loopback `fetch` is allowed. The 30 s cache means an
  installation change reaches members without a choice within 30 s; a
  member's own change is immediate (cookie set on the save response, then
  `router.refresh()`), meeting SC-004.
- **Loopback**: the request's own origin is the public host behind
  Cloudflare Access and must not be used; the proxy calls
  `http://127.0.0.1:${PORT ?? 3000}`. Checked in quickstart step 2.
- **Alternatives**: mutating `config.i18n.fallbackLanguage` from a Settings
  hook (works only while one process holds one config object — invisible,
  fragile); `getPayload()` inside the proxy (second Payload instance and DB
  pool if the proxy bundle does not share the module cache); `saveToJWT` on
  the member field (the token is not reissued when the member changes it —
  stale until next login); keeping only Payload's cookie selector (not
  stored on the member, lost on another device, no « installation default »).
- **Payload's own selector** is hidden (CSS in `app/(payload)/custom.css`
  on the Account « Language » row) so there is one control, ours (R3).

## R3 — The member's field mirrors 022's time zone

- **Decision**: `users.adminLanguage`, a select `fr | en`, optional, with the
  empty value labelled « Installation default »; on the account screen next
  to `displayTimezone`, same access (self + administrators). Settings →
  Default gets `adminLanguage` next to `adminTimezone` (required).
- **Rationale**: 022 US6 set the pattern and members already know where it
  is (spec Assumptions).

## R4 — Translating Trefle's config labels: inline `{ fr, en }` objects

- **Decision**: every `label`, `admin.description`, select-option label, tab
  label, group label and `labels.singular/plural` in collections, globals and
  fields becomes an inline object `{ fr: "…", en: "…" }` — Payload's
  `StaticLabel`/`StaticDescription` accept a record keyed by language and pick
  `req.i18n.language`. The French value is today's string, unchanged
  (FR-014). Validation messages returned by `validate` use `req.t` (the
  validate options carry `req`).
- **Completeness (FR-010)**: a test `admin-labels-config.test.ts`, modelled on
  022's `admin-dates-config.test.ts`, walks the sanitized config and fails on
  any plain-string label/description/option label, or a record missing `fr`
  or `en`.
- **Rationale**: ~280 labels stay next to their field, the diff per field is
  one line, no key naming for 280 entries.
- **Alternatives**: every label as `({ t }) => t("trefle:…")` with keys in
  the catalogue (R5) — 280 keys far from their fields, harder review.

## R5 — Trefle's other strings: one typed catalogue per language

- **Decision**: `apps/cms/src/i18n/fr.ts` (today's wording, the source) and
  `apps/cms/src/i18n/en.ts` typed as the same shape as `fr` (a recursive
  « same keys, string leaves » type), registered as
  `i18n.translations: { fr: { trefle: fr }, en: { trefle: en } }`.
  - Admin components: `useTranslation()` from `@payloadcms/ui`, typed with
    the catalogue's keys, `t("trefle:pageStats.empty")`.
  - Server components, endpoints, hooks: `req.t` / `req.i18n.t`.
  - Pure libraries that build sentences (`ab-verdict-copy.ts`,
    `import/errors.ts`, `import/site-errors.ts`, `import/device-summary.ts`)
    take a `t` parameter instead of returning French.
- **Completeness (FR-010)**: a missing English key is a **type error**, so
  the existing type-check is the gate; a unit test also checks no leaf is
  empty and placeholders (`{{count}}`) match between languages.
- **Rationale**: Payload's language resolution (R2) decides the language;
  a 20-line typed reader does the rest; no i18n dependency (Principle II).
- **Volume**: ~40 component files with French text, ~50 server messages,
  ~40 import messages, the editor strings (R6).

## R6 — The page editor

- **Decision**: GrapesJS's built-in i18n (`i18n: { locale, detectLocale:
  false, messages: { fr } }`, French from `grapesjs/locale/fr`, English
  built in). `Editor.client.tsx` passes `useTranslation().i18n.language`.
  Trefle's own editor strings (block categories and names in `blocks.ts`,
  `codeViewMessages.ts`, trait labels, « Replace everywhere ») move to the
  catalogue (R5), read through the same `t`.
- **Rationale**: no plugin, no copy of GrapesJS strings.
- **Content untouched (US4 s2)**: block ids, classes and stored project data
  do not depend on the language; only labels shown by the editor change.

## R7 — Import reports: codes for Trefle's lines, AI lines in the launcher's language

- **Finding**: `ImportReport` (`packages/grapesjs-page-import/src/serialize.ts`)
  stores free text: `simplified {what, how}`, `omitted {what, reason}`,
  `actionsBeforePublish: string[]`. Some lines are written by Trefle's code
  (e.g. « Fin de la page »), others by the AI conversion, which the prompt
  (`lib/import/convert.ts` §3, §6) asks to write **in French**.
- **Decision**:
  - Lines Trefle writes become `{ key, values }` (catalogue key + values) and
    are shown in the **reader's** language. Error codes
    (`page-imports.errorCode`) already are codes; their texts move to the
    catalogue.
  - Lines the AI writes cannot be re-translated per reader without a second
    AI call per view. The prompt asks for them **in the launching member's
    admin language**; they are stored as text with that language. This is an
    FR-013 exception, listed in the plan and added to the spec's edge cases.
  - Section labels the AI writes (`source`) become layer names in the page —
    content, so they also follow the launcher's language.
  - Reports stored before this feature keep their literal text; the panel
    shows a line as text when it has no `key`.
- **Alternatives**: translating AI lines at view time (cost, latency, nothing
  to gain over the launcher's language); always French (contradicts US5).

## R8 — Numbers, percentages, amounts

- **Decision**: one helper `lib/admin-locale.ts` maps `fr → fr-FR`,
  `en → en-GB` and formats with `Intl.NumberFormat` (no dependency). Dates
  keep `admin.dateFormat` `dd/MM/yyyy HH:mm:ss` in both languages
  (day-month-year, spec Assumptions); Payload's date picker uses its own
  date-fns locale per language. CSV exports keep ISO dates and plain numbers;
  only headers follow the language.

## R9 — Visitor texts on published pages

- **Inventory** (`apps/web/src`, 2026-10-28): `app/error.tsx`,
  `app/global-error.tsx`, `app/confirm/page.tsx`, `app/unsubscribe/page.tsx`,
  `app/(form-retry)/form-retry/page.tsx`, `app/(confirmation)/confirmation/page.tsx`
  (fallback thank-you), `app/api/leads/route.ts` (field validation, thank-you,
  rate-limit pages), `app/(measurement)/mesure-audience/page.tsx`,
  `components/lead-form.tsx` (privacy link, « nouvelle fenêtre »),
  `components/carousel.tsx` (aria labels), `components/legal-page.tsx`
  (fallback titles, « en cours de rédaction »).
- **Decision**: `apps/web/src/lib/visitor-copy.ts` holds `fr` (today's
  wording) and `en` typed to the same shape, and
  `visitorCopy(languageCode) → { lang, copy }`: `fr` → French, `en` →
  English, anything else → English with `lang: "en"`, which the caller puts
  on the text's container so assistive technologies read it in English
  (FR-017). Language source per surface:
  - lead route: the page's language (`cfg.language.code`, already loaded);
  - confirm / unsubscribe: the language of the lead's page, else the
    domain's default page language, else English;
  - legal and measurement pages: `?lang=` as today;
  - carousel / lead form: the page's language, passed by the renderer;
  - `error.tsx`: the nearest `lang` attribute in the document;
    `global-error.tsx`: English (no page context).
- **Rationale**: about 40 strings on one app; a module of two objects is the
  smallest thing that works; the visitor bundle grows only by the strings of
  the few client components (carousel, error page) — SC-009.
- **Editor texts win (FR-018)**: the page's own success message, the banner
  and legal translations keep their current priority over built-in texts.

## R10 — English public paths with one-hop permanent redirects

- **Decision**: `/confidentialite → /privacy`, `/mentions-legales →
  /legal-notice`, `/mesure-audience → /audience-measurement`.
  - The route folders move to the new names (`app/(legal)/privacy`,
    `app/(legal)/legal-notice`, `app/(measurement)/audience-measurement`).
  - The old folders keep a `page.tsx` that calls `permanentRedirect` (308)
    to the same target the new page would use: the owner's own address when
    the domain has one (as today), else the new path **with the query
    string** — always one hop (SC-008).
  - `packages/shared/src/edge.ts`: `MEASUREMENT_PAGE_PATH` changes, and a
    `LEGACY_PUBLIC_PATHS` list is added; the edge Worker's `PASS_PATHS`
    (`apps/edge/src/classify.ts`) passes the new and the old paths to the
    origin, so the redirect is the same with the Worker on or off.
  - `apps/web/src/lib/legal.ts` `legalHref` and its type use the new paths;
    `lead-form.tsx` fallback too.
  - `apps/cms/src/hooks/pages-path-validate.ts`: all six paths reserved.
  - Help texts in `collections/Domains.ts`, `fields/form.ts`,
    `payload-types.ts` (regenerated), the seed, the import-eval script, tests
    and both deploy READMEs move to the new paths; specs of past features
    keep the old ones (history).
- **Stored values (FR-024)**: the default legal texts seeded by
  `20261021_101738_legal_pages` link to `/confidentialite` and describe
  `/mesure-audience`. A migration replaces a stored text **only when it is
  byte-identical to the shipped old default**; anything edited is left and
  served through the redirect (rule: deploys keep user settings). The hidden,
  unused `settings.defaultPrivacyNoticeUrl` (021) is not touched. The
  migration logs every page already published at a new path (none expected).
- **Alternatives**: redirects in `next.config` (two hops for owner domains,
  and no domain lookup); per-language paths (`/fr/confidentialite`) —
  rejected by the user's decision of one English path set.

## R11 — Tests that match French text

- **Finding**: 24 Playwright specs live in `apps/web/tests/e2e`, 16 of them
  match French text in the admin or on pages.
- **Decision**: the e2e global setup pins the admin to French (installation
  language `fr` in the seeded Settings), so existing specs keep passing
  unchanged; one new spec signs in a member with `adminLanguage: en` and
  walks the SC-001 tasks, and one checks an English page's lead journey
  (SC-007). Path renames update the specs that open legal pages.
