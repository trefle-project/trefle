# Research: Legal pages per domain

**Feature**: 021-legal-pages | **Date**: 2026-10-21 | **Plan**: [plan.md](plan.md)

Checked in the code on 2026-10-21: `globals/Settings.ts` (admin-only update,
`cookieBannerTranslations` per language with a French-required hook,
`afterChange` revalidates tag `settings`), `collections/Domains.ts`,
`collections/Languages.ts` (005), `fields/form.ts` (each form stores
`privacyNoticeUrl` / `privacyNoticeVersion`, defaulted **by copy** from
`Settings.defaultPrivacyNoticeUrl/Version` when the page is created),
`collections/ConsentRecords.ts`, the renderer's fixed routes (`/confirmation`,
`/mesure-audience`), `components/page-shell.tsx` (used by the catch-all page,
`ab-variant`, `confirmation`, `form-retry`, `preview`), `edgeTagsFor`
(`settings` → purge all HTML, `domain:<id>` → that domain), the Worker's
pass paths and its origin requests **without query string**, and
`@payloadcms/richtext-lexical` 3.88 (already the admin's editor; exports
`convertMarkdownToLexical` and, from `/html`, `convertLexicalToHTML`).

Production fact (2026-10-20): the client domain's lead form links « Politique
de confidentialité » to `https://digital-strategy.ec.europa.eu/…` — the
Settings default copied into the form.

## R1 — Where the data lives

**Decision**:

- **Settings** (one per installation, Administrators only — already the
  global's update rule):
  - `operator` group: name, legal form, registration number (SIREN/RCS…),
    address, contact e-mail, phone;
  - `suppliers` array: name, role, location, safeguards, `isHost` with
    address and phone for the hosting provider (ordered; at most one host);
  - `legalTexts` array, one row per active language (French required — same
    hook pattern as `cookieBannerTranslations`): `privacyPolicy` (rich text),
    `legalNotice` (rich text), `policyLinkLabel`, `noticeLinkLabel` (the
    footer and form link labels).
- **Domains** (Editors and Administrators, as today): `owner` group: name,
  legal form, registration number, address, data-protection e-mail,
  publication director; `ownPrivacyPolicyUrl`, `ownLegalNoticeUrl`
  (optional); `legalExtras` array per language: `privacyParagraph`,
  `noticeParagraph` (rich text, optional).
- **New collection `legal-versions`** (archive, R5).

**Alternatives**: a separate « operator » global (one more admin entry for
six fields — Settings already holds installation-wide choices); owner data
in a new collection (a domain has exactly one owner; no owner accounts).

## R2 — Text format and placeholders

**Decision**: Lexical rich text (the admin's editor already) with
placeholders written as `{{key}}` in the text. Keys:

| Key | Value |
|---|---|
| `{{operator.name}}`, `.legalForm`, `.registration`, `.address`, `.email`, `.phone` | Settings `operator` |
| `{{owner.name}}`, `.legalForm`, `.registration`, `.address`, `.email`, `.director` | the domain's `owner` |
| `{{host.name}}`, `.address`, `.phone` | the supplier marked as host (LCEN: the hosting provider's identity in the legal notice) |
| `{{site}}` | the domain's host name |
| `{{retention.leads}}` | « 24 mois » from `Settings.retentionMonths` |
| `{{suppliers}}` | alone in a paragraph → replaced by the suppliers list |
| `{{cookieBanner}}` | alone in a paragraph → kept only when the domain shows the banner (the paragraph's other text is the banner sentence) |
| `{{extra}}` | alone in a paragraph → replaced by the domain's paragraph for that page and language, or dropped |
| `{{measurementPage}}` | link to `/mesure-audience` |

Rule (FR-010): a paragraph or list item containing a placeholder whose
value is empty is **dropped** whole; unknown keys count as empty. Applied on
the Lexical tree before HTML conversion, so no raw `{{…}}` reaches a page.

**Alternatives**: Markdown textareas (a second text format in the admin);
per-section fields (rigid, the operator could not reorder or reword).

## R3 — Rendering and the version (CMS owns the text)

**Decision**: one CMS function builds a legal page for (domain, kind,
language): picks the language row (requested → domain default → French),
substitutes placeholders (R2), inserts the domain's extra paragraph and the
suppliers list, converts to HTML (`convertLexicalToHTML`). **Version** =
first 12 hex characters of SHA-256 of that HTML; shown on the page with the
date it was first archived. Exposed to the renderer by
`GET /api/legal/:kind?domain=<id>&lang=<code>` (service account) returning
`{ html, version, versionDate, language, title }`. Renderer fetches it
cached with tags `settings` and `domain:<id>`, so a save refreshes it.

## R4 — Routes, language and the edge

**Decision**: the renderer serves `/confidentialite` and `/mentions-legales`
on every domain (fixed routes like `/confirmation`), with `?lang=<code>` for
the language (clarification 2). Because the Worker drops the query string on
cached pages, both paths join the Worker's **pass paths** (served by the
origin, like `/mesure-audience`); low traffic. Both paths are reserved for
pages (`pages-path-validate.ts`). `noindex` is NOT set (legal pages may be
indexed). When the domain gives its own URL for a page, the route answers a
302 to it.

## R5 — The archive of versions (clarification 4)

**Decision**: collection `legal-versions` — `domain`, `kind`
(privacy | notice), `language`, `version` (hash), `html`, `createdAt`; unique
on (domain, kind, language, version). The CMS function of R3 inserts the row
the first time it produces a version (`ON CONFLICT DO NOTHING`) — « archived
as published ». Read-only in the admin for Administrators and Editors, no
create/update/delete for anyone (code uses `overrideAccess`). Never deleted
by the retention sweep (consent records refer to them; consent records are
themselves kept per the existing rules). A consent record shows a link
« Voir la politique acceptée » to its archive row (UI field).

## R6 — Lead forms and the consent record

**Decision**:

- Effective link of a form: the form's own `privacyNoticeUrl` when set
  (explicit choice), else the domain's `ownPrivacyPolicyUrl`, else
  `/confidentialite?lang=<page language>`.
- Version recorded: the form's own `privacyNoticeVersion` when its own URL is
  set, else the version from `/api/legal/privacy` for that domain and page
  language (renderer, at submission).
- **Migration**: clear `form.privacyNoticeUrl` and `privacyNoticeVersion` on
  every page where they equal the Settings defaults (they were copied, not
  chosen); stop defaulting new forms from Settings (remove the `fromSettings`
  defaults). Settings' two default fields stay, hidden and unused (contract
  in a later release — Principle III), their values kept for the down path.

## R7 — The footer line (clarification 1)

**Decision**: `PageShell` renders, after the page's own HTML, a
`<footer class="trefle-legal-footer">` with two links (labels from the
language row of the page's language, else French), when the shell renders a
real page (catch-all, `ab-variant`, `confirmation`, `form-retry`, preview).
Style: small text, centered, padding, inherits colours with a subtle
semi-transparent background so it reads on any page; focusable links;
wraps at 360 px. The line is part of the cached HTML (purged with `settings`
and `domain:<id>` changes).

## R8 — Completeness (US4)

**Decision**: a pure function `legalCompleteness(operator, owner, texts)` →
list of missing items (French labels). Shown as a « Pages légales » column in
the domains list and a banner on the domain's edit view; also a banner in
Settings when the operator part is incomplete. Required: operator name,
address, e-mail; owner name, address, e-mail, director; a French text for
both pages. Pages are served anyway (edge case).

## R9 — Default French texts

**Decision**: authored as Markdown in the repo
(`apps/cms/src/legal/defaults/fr/privacy-policy.md`, `legal-notice.md`),
with the placeholders of R2; a migration converts them with
`convertMarkdownToLexical` and stores them in `Settings.legalTexts` **only
if empty**, with default link labels (« Confidentialité », « Mentions
légales »). Content (privacy): controller, processor and sub-processors,
leads (purposes, legal basis: the consent given on the form / pre-contractual
steps, retention), the consent record, the double opt-in e-mail, the cookie
banner (conditional), page tests (018, R15: nothing on the device),
recipients, transfers (Cloudflare, DPF), rights, CNIL complaint, contact,
version. Legal notice: publisher, publication director, host (operator +
its hosting provider from the suppliers list), contact. Marked as a template
to review.

## R10 — Documents outside the product

`docs/legal/contrat-sous-traitance.fr.md` (art. 28 DPA template between the
operator and a domain owner) and `docs/legal/registre-traitements.fr.md`
(register entries for the owner and the operator's processor register),
reusing `docs/sous-traitant-cloudflare.fr.md` and `docs/mesure-ab-cnil.fr.md`.

## R11 — Rollout

One release (migration: new fields, collection, default texts, form clean-up).
Right after: the operator fills its identity and suppliers, then each
domain's owner (SC-003 < 5 min each); the admin shows what is missing. Lead
forms switch to the domain policy at the release. Then 018's `EXPOSURES=on`
can follow.

## R12 — Constitution

No new dependency (`@payloadcms/richtext-lexical` is the admin's editor).
Payload fields/collection/endpoint, Next routes, a migration with a down
path. Principle V: footer accessible and responsive; admin states explicit.
