# Implementation Plan: Bilingual admin (French / English)

**Branch**: `023-admin-i18n` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-admin-i18n/spec.md`

## Summary

Make the admin speak one language at a time, French or English, chosen per
installation (fresh install English, existing installs French) and per
member; make Trefle's built-in visitor texts follow the page's language; move
the three French public paths to English with one-hop permanent redirects.

Approach (research.md): enable Payload's French and English bundles and let
Payload keep resolving the language itself — the member's choice reaches it
as the `payload-lng` cookie (set by Trefle's login/account hooks), the
installation default as the `Accept-Language` header, overwritten by the
existing CMS proxy (R1–R3). Trefle's config labels become inline `{ fr, en }`
objects (R4); every other admin string goes into one typed catalogue per
language registered with Payload (R5), which also feeds the page editor
(R6), server messages and import reports (R7). The renderer gets a small
two-language visitor catalogue (R9). Public paths are renamed with redirects
in the old route folders and the edge pass-list (R10).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24

**Primary Dependencies**: Payload 3.88.0 (`@payloadcms/translations` French
and English bundles, already installed), Next 16.3.4 (`proxy.ts` on Node.js),
GrapesJS 0.22.16 (built-in i18n, `grapesjs/locale/fr`). No new dependency.

**Storage**: PostgreSQL — two new columns (`settings.admin_language`,
`users.admin_language`), one data migration on stored default legal texts;
import report JSON gains a keyed line form (no migration).

**Testing**: Vitest (cms, web, edge, shared), Playwright e2e (apps/web/tests/e2e),
axe on published pages.

**Target Platform**: the existing Docker Compose stack on the VPS behind
Cloudflare (Worker + Access).

**Project Type**: web monorepo — `apps/cms` (Payload admin), `apps/web`
(public renderer), `apps/edge` (Worker), `packages/shared`,
`packages/grapesjs-page-import`.

**Performance Goals**: a language switch visible on the next screen (< 5 s,
SC-004); no measurable change to admin response time (one cached loopback
call per 30 s in the proxy); published-page client JS grows by a few KB at
most (SC-009).

**Constraints**: French wording byte-identical to today (FR-014); deploys
never change a user's setting (only untouched defaults move, FR-024); old
public links keep working (FR-021).

**Scale/Scope**: ~280 config labels/descriptions, ~40 admin component files,
~50 server messages, ~40 import messages, the editor's own strings, ~40
visitor strings in 11 renderer files, 6 public paths in ~15 places, 16 e2e
specs matching French text.

## Constitution Check

*GATE: checked before Phase 0, re-checked after Phase 1 — both PASS.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity | Payload's own i18n and resolution order, no wrapper; one catalogue per language per app; no config mutation trick (R2 alternatives). Two label mechanisms (inline objects vs catalogue) — see Complexity Tracking. | PASS |
| II. Stack-native | Payload `supportedLanguages`/`translations`/`useTranslation`/`req.t`, GrapesJS i18n, Next `proxy` and `permanentRedirect`, `Intl`. No new dependency. | PASS |
| III. Small, reversible | Each user story ships alone (Delivery order). Migrations expand-only with down paths; the data migration rewrites only byte-identical defaults and reverses the same way. Old paths stay served (redirect) — no contract break. | PASS |
| IV. Tests | Catalogue completeness by type-check + leaf/placeholder test; config label walk test; unit tests for effective language, cookie hooks, proxy header, visitor language choice, redirects and reserved paths, edge pass-list; migration test; e2e walk in each language. Hooks and endpoint are custom Payload code → tested. | PASS |
| V. Quality felt | English and French admin both complete; visitor texts in the page's language with `lang` marking when they differ; axe on published pages in both languages; loading/error states translated with their screens. | PASS |
| Secrets/config | The new endpoint exposes only the language; no `NEXT_PUBLIC_*`. | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/023-admin-i18n/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-language.md
│   ├── visitor-copy.md
│   └── public-paths.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apps/cms/src/
├── payload.config.ts            # i18n: supportedLanguages, fallback en, translations
├── proxy.ts                     # + /api matcher, Accept-Language = installation language
├── i18n/fr.ts, en.ts            # NEW — Trefle admin catalogue (typed, same keys)
├── lib/admin-locale.ts          # NEW — effective language, Intl locale, number formats
├── globals/Settings.ts          # + adminLanguage, + admin-language endpoint
├── collections/Users.ts         # + adminLanguage, login/logout/afterChange cookie hooks
├── collections/*.ts, globals/*.ts, fields/*.ts   # labels → { fr, en }
├── components/*.tsx             # strings → useTranslation / req.t
├── fields/grapesjs/*            # editor i18n + Trefle editor strings
├── lib/ab-verdict-copy.ts, lib/import/*.ts, jobs/*.ts, endpoints/*.ts  # t parameter, keyed report lines
├── hooks/pages-path-validate.ts # six reserved paths
├── lib/legal/defaults.ts        # new paths in default texts
├── migrations/                  # admin_language ×2, english public paths
└── app/(payload)/custom.css     # hide Payload's Account language selector

apps/cms/tests/                  # admin-labels-config, catalogue, admin-locale, hooks, proxy, migration

apps/web/src/
├── lib/visitor-copy.ts          # NEW — visitor catalogue
├── lib/legal.ts                 # new paths, legalHref
├── app/(legal)/privacy, legal-notice/          # moved from confidentialite, mentions-legales
├── app/(legal)/confidentialite, mentions-legales/page.tsx   # 308 redirect only
├── app/(measurement)/audience-measurement/     # moved; old folder redirects
├── app/api/leads/route.ts, app/confirm, app/unsubscribe, app/(form-retry), app/(confirmation), app/error.tsx, app/global-error.tsx
└── components/lead-form.tsx, carousel.tsx, legal-page.tsx

apps/web/tests/                  # visitor-copy, redirects; e2e: English admin walk, English lead journey, path renames

apps/edge/src/classify.ts        # PASS_PATHS: new + old paths
packages/shared/src/edge.ts      # MEASUREMENT_PAGE_PATH, LEGACY_PUBLIC_PATHS
packages/grapesjs-page-import/src/serialize.ts   # ReportText, report.language
infra/deploy/README.md, README.fr.md, docs/      # new paths
```

**Structure Decision**: existing monorepo layout; two new catalogue modules
(`apps/cms/src/i18n/`, `apps/web/src/lib/visitor-copy.ts`) and one helper
(`lib/admin-locale.ts`); everything else edits files in place.

## Delivery order

Each step is one PR that leaves `main` working (Principle III).

1. **US1 + US2 — language plumbing** (P1): Payload bundles, Settings and
   member fields + migrations, cookie hooks, proxy, endpoint, hidden Payload
   selector, `admin-locale.ts`, empty `trefle` catalogue. payload-totp ships
   its own `fr`/`en` strings (`payload-totp/dist/i18n`), so the 2FA screens
   follow with no extra work. Prod after deploy:
   French chrome, Trefle labels still French — already better than today.
2. **US7 — English public paths** (P3 but independent and small; ship early
   so links stabilise): renames, redirects, edge pass-list, reserved paths,
   data migration, docs. Requires an edge Worker deploy with the release.
3. **US3 — Trefle labels and screens**, in several PRs by menu group
   (Reports; Contents; Imports; Leads; Settings + Members), each adding its
   catalogue keys and inline labels; the label-walk test is introduced in
   « warn » mode listing remaining collections, and becomes strict in the
   last PR.
4. **US4 — page editor**.
5. **US5 — server messages and import reports** (keyed report lines,
   launcher-language AI lines).
6. **US6 — visitor texts**.
7. **Polish**: e2e walks in both languages (SC-001/002/007), production-copy
   upgrade check (SC-005), deploy README notes, memory/state record.

## FR-013 exceptions (third-party or non-translatable text)

- Cloudflare Access's e-mail code page (in front of the admin).
- AI-written import report lines and section names: in the launching
  member's language (R7, spec Edge Cases).
- Provider messages shown verbatim (e.g. an SMTP or S3 error detail inside a
  Trefle message).
- The rich-text editor's own hover buttons (« Add block », « Edit link »):
  hard-coded in English by Payload's Lexical editor, not in its
  translations (found by the walk check, T066, 2026-10-29).

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two translation mechanisms: inline `{ fr, en }` labels in config, a keyed catalogue elsewhere | Config labels are ~280 one-off strings attached to one field each; components/server messages are reused, interpolated and need `t` | All-catalogue: 280 keys far from their fields, every field reviewed through an indirection. All-inline: impossible for client components and server messages |
| Proxy loopback call to read the installation language | Payload resolves the language before any Trefle code runs; only the proxy can influence its inputs per request | `fallbackLanguage` is static config; mutating it at run time depends on one shared object per process; `getPayload()` in the proxy may start a second instance |
