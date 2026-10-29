# Specifications

Trefle was built one feature at a time with
[Spec Kit](https://github.com/github/spec-kit). Each folder holds the full
paper trail of one feature, from the problem statement to the release notes.
For a readable overview of what the features do today, start with
[docs/features.md](../docs/features.md).

## What is in a feature folder

| File | Content |
|---|---|
| `spec.md` | The problem, user stories with acceptance scenarios, functional requirements, success criteria, clarifications (questions asked and answers given) |
| `research.md` | Technical options studied and the decision for each |
| `plan.md` | Architecture, files touched, constitution check, complexity tracking |
| `data-model.md` | Collections, fields and states added or changed |
| `contracts/` | The precise behaviour of each API, component or rule, as tests read it |
| `tasks.md` | Ordered, checkable tasks; dated notes record what happened during the build and the release |
| `quickstart.md` | Manual validation scenarios |
| `checklists/` | Specification quality checklist |

Specs describe behaviour; when a later feature changes it, the later spec
says so, and [docs/features.md](../docs/features.md) shows the current
state. Every feature below is released.

## Index

| # | Feature | Area |
|---|---|---|
| [001](001-landing-page-lead-capture/) | Landing pages with GDPR-compliant lead capture | Foundation |
| [002](002-security-hardening/) | Deploy-blocking security hardening | Security |
| [003](003-post-launch-improvements/) | Post-launch fixes and improvements | Publishing, security |
| [004](004-page-types/) | Page types (subscription / free / confirmation) | Authoring |
| [005](005-content-language-tagging/) | Content language tagging | Authoring, leads |
| [006](006-double-optin-email/) | Double opt-in confirmation e-mail | Leads |
| [007](007-gtm-tagging/) | Google Tag Manager and cookie consent | Tagging |
| [008](008-ab-testing/) | Page A/B testing | Experiments |
| [009](009-lead-form-error-recovery/) | Lead form error recovery | Leads |
| [010](010-date-range-filters/) | Date-range filters | Admin |
| [012](012-url-page-import/) | Import a page from a URL | Import |
| [013](013-saved-page-import/) | Import a page from a saved file | Import |
| [014](014-custom-code-editing/) | Custom code and direct HTML editing | Authoring |
| [015](015-penpot-site-import/) | Import a website from a Penpot file | Import |
| [016](016-carousel-block/) | Carousel block | Authoring |
| [017](017-edge-protection/) | Edge protection and media caching | Edge |
| [018](018-ab-significance/) | Statistical significance for A/B tests | Experiments |
| [019](019-admin-access/) | Admin access: edge identity and two-factor login | Security |
| [020](020-edge-html-cache/) | Page HTML served from the edge cache | Edge |
| [021](021-legal-pages/) | Legal pages per domain | GDPR |
| [022](022-ux-improvement/) | Admin UX improvements | Admin |

## Notes for readers

- Specs are in English. The original French of 010 is kept as `spec.fr.md`.
  The « Input » line of a spec quotes the original request, often in French.
- The specs and task notes were written for a real installation. Its domain
  names and addresses are replaced by `example.com`, `client-site.example`
  and documentation IP ranges (`203.0.113.0/24`, `2001:db8::/32`).
- Number 011 is not used.
