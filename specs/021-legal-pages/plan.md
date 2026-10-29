# Implementation Plan: Legal pages per domain — privacy policy and legal notice

**Branch**: `021-legal-pages` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/021-legal-pages/spec.md`

## Summary

Record the installation operator's identity and suppliers once, each domain
owner's identity per domain, and editable legal texts per language (French
required) with placeholders. The CMS builds each domain's privacy policy and
legal notice from them, versions each result (hash) and archives it the
first time it is served. The renderer serves `/confidentialite` and
`/mentions-legales` on every domain (language from the referring page),
adds a footer line linking both to every published page, and points lead
forms to the domain's policy, recording its version in the consent record.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 24.

**Primary Dependencies**: Payload 3.88 (Settings global, Domains, a new
collection, an endpoint, a migration), `@payloadcms/richtext-lexical` 3.88
(already the admin editor: `convertMarkdownToLexical`, `convertLexicalToHTML`),
Next.js renderer routes and `PageShell`, the 020 edge Worker (pass paths).

**Storage**: PostgreSQL — new fields on `settings` and `domains`, new
collection `legal-versions`; one migration (with down path) also seeds the
default French texts and clears copied form defaults.

**Testing**: vitest (cms, web, edge), Playwright e2e (direct and through the
local Worker), axe on a published page with the footer and on both legal
pages.

**Target Platform**: the existing VPS + Cloudflare.

**Project Type**: web — monorepo apps `cms`, `web`, `edge`.

**Performance Goals**: no added request on cached page views (footer is part
of the cached HTML); legal pages served by the origin (low traffic).

**Constraints**: no raw placeholder ever shown (SC-004); texts editable
without release (SC-002); the operator is never hard-coded (open-source
installation); no owner accounts (one shared workspace).

**Scale/Scope**: a handful of domains and languages; a few archive rows per
text change.

## Constitution Check

*GATE: checked before research and after design.*

| Principle | Check | Status |
|---|---|---|
| I. Simplicity | Settings and Domains fields, one collection, one builder function used by one endpoint; texts in the existing rich-text editor; placeholders as plain `{{key}}`. | Pass |
| II. Stack-native | Payload fields/hooks/collection/endpoint, Lexical converters shipped with the editor, Next routes; no new dependency. | Pass |
| III. Small, reversible | One migration with a down path (restores cleared form links, drops fields/collection); Settings' old default fields kept until a later release (expand → contract). | Pass |
| IV. Tests | Builder, placeholders, completeness, access, hook, endpoint, renderer link/consent logic, footer, routes: tests listed in the contracts; e2e + axe. | Pass |
| V. Quality | Footer accessible, responsive, readable; legal pages accessible; admin shows incomplete states with French copy. | Pass |
| Architecture | Multi-domain model unchanged (owner identity is presentation data on a domain, no tenant isolation). | Pass |

Post-design re-check: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/021-legal-pages/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── legal-api.md
│   ├── renderer.md
│   └── admin.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
apps/cms/src/
├── globals/Settings.ts                    # operator, suppliers, legalTexts (+ French-row hook)
├── collections/Domains.ts                 # owner, own URLs, legalExtras, « Pages légales » column + banner
├── collections/LegalVersions.ts           # new, read-only archive
├── collections/ConsentRecords.ts          # « Politique acceptée » UI field
├── fields/form.ts                         # no Settings defaults for privacy link/version
├── lib/legal/build.ts                     # placeholders, language, HTML, version, archive
├── lib/legal/completeness.ts              # missing items
├── legal/defaults/fr/privacy-policy.md, legal-notice.md
├── endpoints/legalPage.ts                 # GET /api/legal/:kind
├── components/LegalCompleteness*.tsx, ConsentPolicyLink.tsx
├── hooks/pages-path-validate.ts           # reserve the two paths
└── migrations/<date>_legal_pages.ts

apps/web/src/
├── app/(legal)/confidentialite/page.tsx, mentions-legales/page.tsx
├── components/page-shell.tsx (footer), components/lead-form.tsx (link)
├── lib/legal.ts                           # fetch + effective links
└── app/api/leads/route.ts                 # consent context

apps/edge/src/classify.ts                  # two pass paths
docs/legal/contrat-sous-traitance.fr.md, registre-traitements.fr.md
```

**Structure Decision**: existing monorepo layout; legal code grouped under
`lib/legal/` in the CMS and `lib/legal.ts` in the renderer.

## Complexity Tracking

None.
