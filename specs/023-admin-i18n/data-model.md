# Data model: Bilingual admin (French / English)

All changes are expand-only (Principle III); each migration has a down path.

## Settings (global) — new field

| Field | Type | Rules |
|---|---|---|
| `adminLanguage` | select `fr` \| `en` | required; `defaultValue: "en"`; Settings → Default tab, next to `adminTimezone`; editable by administrators only |

Migration `20261028_113848_admin_language` (both new columns, Settings and members):
- up: add column `admin_language` (enum `fr|en`, default `en`); then set
  `fr` on the Settings row **only when the installation already has members**
  (`EXISTS (SELECT 1 FROM users)`). On a fresh database the 021 migration has
  already created a Settings row (`20261021_101738_legal_pages.ts:124`) but no
  member exists yet, so it keeps `en` (FR-003). Existing `updated_at` is left
  unchanged (no user value touched — the column is new).
- down: drop the column and the enum.

## Users (members) — new field

| Field | Type | Rules |
|---|---|---|
| `adminLanguage` | select `fr` \| `en`, optional | empty = « Installation default »; read/update by the member themself and administrators (same access as `displayTimezone`) |

Migration: the same `20261028_113848_admin_language` adds the nullable
column `users.admin_language`; down drops it. No backfill: every existing
member starts on « Installation default ».

Hooks on `users`:
- `afterLogin`: `Set-Cookie: payload-lng=<adminLanguage>` (Path=/, 1 year,
  SameSite=Lax, `Secure` when the request came over HTTPS — `X-Forwarded-Proto`) or an expired cookie when empty.
- `afterLogout`: expired `payload-lng`.
- `afterChange`: when `req.user.id === doc.id` and `adminLanguage` changed,
  same cookie as `afterLogin`.

Effective language (pure, `lib/admin-locale.ts`):
`member.adminLanguage` if valid → else `settings.adminLanguage` if valid →
else `en`.

## Import reports — line shape (JSON, no migration)

`ImportReport` lines gain a keyed form; both forms are read:

```ts
type ReportText =
  | string                                            // pre-023 lines, AI lines
  | { key: string; values?: Record<string, string | number> }; // Trefle lines
```

- `simplified[].what/how`, `omitted[].what/reason`, `actionsBeforePublish[]`
  accept `ReportText`.
- New field `language: "fr" | "en"` on the report: the language AI-written
  lines were requested in (the launcher's effective language). Absent on
  older reports (= French).
- `page-imports.errorCode` / site-import error codes: unchanged codes; their
  texts move to the catalogue.

## Legal texts — stored defaults (data migration)

Migration `2026xxxx_english_public_paths`:
- up: for each stored legal text (privacy policy, legal notice; the link
  labels hold no path) whose value equals the pre-023 default converted the
  way the 021 migration did it (`convertMarkdownToLexical` of the frozen old
  markdown) — **links' random `id`s and jsonb key order left out**: Lexical
  gives every link a new id on each conversion, so a byte comparison never
  matches — change only its links' addresses to `/privacy`, `/legal-notice`,
  `/audience-measurement` (ids and everything else kept). Any other value is
  left as is. Also the hidden Settings `default_privacy_notice_url` (copied
  into imported forms) when it is still `/confidentialite`. Logs pages
  published at `/privacy`, `/legal-notice` or `/audience-measurement`.
  A text opened and re-saved without change but re-serialized differently
  counts as edited: it keeps the old links, which the redirect serves.
- down: the reverse replacement under the same identity rule.

## Catalogues (code, not data)

- `apps/cms/src/i18n/fr.ts`, `en.ts` — admin strings under the `trefle`
  namespace; `en` must have exactly `fr`'s keys (type-checked).
- `apps/web/src/lib/visitor-copy.ts` — visitor strings, `fr` and `en`, same
  rule.
