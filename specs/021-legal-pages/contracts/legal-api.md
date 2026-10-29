# Contract: legal page builder and API (CMS)

Research R2, R3, R5.

## `buildLegalPage(payload, { domainId, kind, lang })` (pure-ish, one code path)

1. Load Settings (`operator`, `suppliers`, `legalTexts`, `retentionMonths`)
   and the domain (`hostname`, `owner`, `consentBannerEnabled`,
   `defaultLanguage`, `legalExtras`).
2. Language: `lang` if a `legalTexts` row exists for it, else the domain's
   default language if one exists, else `fr`.
3. Take the row's `privacyPolicy` or `legalNotice` Lexical tree; substitute
   placeholders in text nodes; replace the blocks holding `{{suppliers}}`
   (list of « name — role, location (safeguards) »), `{{extra}}` (the
   domain's paragraph for that kind and language, or nothing),
   `{{cookieBanner}}` (kept without the token when the banner is on,
   dropped otherwise); drop any block with an empty or unknown placeholder.
4. HTML with `convertLexicalToHTML`; `version` = SHA-256(html) first 12 hex.
5. Archive: insert into `legal-versions` (domain, kind, language, version,
   html) `ON CONFLICT DO NOTHING`; `versionDate` = that row's `createdAt`.
6. Return `{ html, version, versionDate, language, title }` (title: « Politique
   de confidentialité » / « Mentions légales » in French, from the row's link
   label otherwise).

Unit tests: language fallback (requested → domain default → fr); each
placeholder; block dropped when a value is empty or the key unknown; no
`{{` in any output; `{{cookieBanner}}` with banner on/off; suppliers list
order; extra paragraph per kind/language; version stable for identical
input and different after any input change; archive row created once.

## `GET /api/legal/:kind?domain=<id>&lang=<code>` (service account)

`kind` ∈ `privacy`, `notice`. 200 with the object above; 404 unknown or
inactive domain; 400 bad kind; 403 for any other caller. Tests: access,
validation, shape.

## Completeness — `legalCompleteness(settings, domain)` (pure)

Returns French labels of missing items: operator name/address/e-mail, owner
name/address/e-mail/director, French privacy policy text, French legal
notice text. Unit-tested.
