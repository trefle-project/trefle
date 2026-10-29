# Feature Specification: Legal pages per domain — privacy policy and legal notice

**Feature Branch**: `021-legal-pages`

**Created**: 2026-10-21

**Status**: Deployed (2026-10-22, tag 021-legal-pages)

**Input**: User description: « Nous allons séparer les 2 : application, hosting, etc. / responsable par domaine, propriétaire des contenus et gestionnaire des leads. […] Prévoir que les textes soient éditables et multilingues. » Context: the sites have no privacy policy — the lead form's « Politique de confidentialité » link points to a generic EU page — and 018's A/B measurement waits for one (`docs/mesure-ab-cnil.fr.md` §6–7); the legal notice and processing-register texts were moved out of 017 to « a future legal feature » (`docs/sous-traitant-cloudflare.fr.md`). Trefle is an open-source project: whoever runs an installation is its operator.

## Context

Two roles, kept apart:

- **The operator** runs the Trefle installation: the application, its hosting
  and its suppliers (hosting provider, CDN, e-mail service). Towards the
  domain owners and their visitors it acts as a **processor** (sous-traitant,
  GDPR art. 28) and as the **host** (hébergeur) of their sites.
- **The domain owner** owns a domain's content and its leads. For that domain
  they are the **controller** (responsable du traitement) and the **publisher**
  (éditeur) of the site.

Today neither appears anywhere a visitor can read: no legal notice, no
privacy policy; lead forms link to a placeholder. This feature records both
identities, keeps the legal texts editable and multilingual, and makes every
domain serve its own legal notice and privacy policy, which its lead forms
link to.

## Clarifications

### Session 2026-10-21

- Q: How does a visitor reach the legal pages from any page of the site? → A: **Trefle adds automatically a thin line at the bottom of every published page**: « Mentions légales · Confidentialité » (in the page's language), on every domain, whatever the page's design.
- Q: Which language for the legal pages when a page is in another language than the domain's default? → A: **The language of the page the visitor comes from** (carried by the link, from the footer line and the lead form), else the domain's default language, else French.
- Q: How far can a domain customise its legal texts? → A: **Common text + one free paragraph per language specific to the domain**, for the privacy policy and for the legal notice, at a fixed place; an owner with complete texts of their own gives external addresses instead (FR-005).
- Q: Keep the exact text of each policy version? → A: **Yes — each new version is archived as published** (full text, language, domain, date), read-only in the admin, never online; a consent record's version leads to that archive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every domain serves its privacy policy, and lead forms link to it (Priority: P1)

A visitor about to send a caterer's lead form clicks « Politique de
confidentialité » and reads the policy of that site: who collects their data
(the domain owner), why, for how long, who processes it on the owner's behalf
(the operator and its suppliers), their rights and whom to contact — in the
site's language.

**Why this priority**: lead forms collect personal data today without a real
policy behind their consent link; this is the legal gap to close first, and
018's measurement waits for it.

**Independent Test**: Fill the operator and a domain owner's identity, open
the domain's privacy policy and a lead form on that domain: the page names
the owner as controller and the operator as processor with its suppliers, and
the form's link opens it.

**Acceptance Scenarios**:

1. **Given** a domain whose owner identity is filled, **When** a visitor opens
   its privacy policy, **Then** it shows the owner as controller, the
   operator as processor and the operator's suppliers as sub-processors, the
   purposes and retention of leads, the cookie banner (when the domain uses
   it), the page tests, the rights and how to exercise them.
2. **Given** a lead form on that domain with no specific privacy link of its
   own, **When** it is shown, **Then** its « Politique de confidentialité »
   link opens that domain's policy.
3. **Given** a lead is submitted, **When** its consent record is stored,
   **Then** it records which version of that domain's policy was linked.
4. **Given** a page in English on a domain whose default language is French,
   and an English text, **When** the visitor follows its « Privacy policy »
   link, **Then** the policy is in English; a direct visit uses the domain's
   default language; a language without a text falls back to French.
5. **Given** an owner who already publishes their own policy elsewhere,
   **When** the operator gives that address for the domain, **Then** the
   domain's lead forms link there instead.

---

### User Story 2 - Every domain serves its legal notice (Priority: P1)

A visitor opens a site's legal notice (mentions légales) and finds who
publishes the site (the domain owner) and who hosts it (the operator and its
hosting provider), with the required contact details.

**Why this priority**: required for every French website, and it rests on the
same two identities as the privacy policy.

**Independent Test**: With both identities filled, open the domain's legal
notice: publisher, publication director, host and contacts are shown in the
site's language.

**Acceptance Scenarios**:

1. **Given** both identities filled, **When** a visitor opens the legal
   notice, **Then** it shows the publisher (owner's name, legal form,
   registration number, address, contact, publication director) and the host
   (operator, and the hosting provider it relies on).
2. **Given** an owner who publishes their own legal notice elsewhere, **When**
   the operator gives that address, **Then** the domain's footer link and
   « legal notice » address lead there.

---

### User Story 3 - The operator edits the texts, in every language (Priority: P1)

An administrator reworks a sentence of the privacy policy, adds a supplier,
and writes the English version. Every domain's policy follows at once, each
with its own owner details; one domain gets an extra paragraph of its own.

**Why this priority**: the texts must be editable without a release
(requested), and the sites are multilingual.

**Independent Test**: Edit the French text and add an English one; check two
domains show the new text with their own identities; add a domain-specific
paragraph to one and check only that domain shows it.

**Acceptance Scenarios**:

1. **Given** the default texts in French, **When** an administrator edits
   them, **Then** every domain's page shows the new text after the next view
   (no release), and the policy's version changes.
2. **Given** a text written for another active language, **When** a domain in
   that language is viewed, **Then** that version is used; a language without
   a text falls back to French.
3. **Given** a text that refers to the owner's or the operator's details
   (name, address, contact…), **When** the page is shown, **Then** those
   details are filled in from the identities; a detail left empty is never
   shown as a raw placeholder.
4. **Given** a domain-specific additional paragraph (per language), **When**
   that domain's page is shown, **Then** it appears in its place; other
   domains do not show it.
5. **Given** only an Administrator, **When** anyone else tries to edit the
   operator identity, the suppliers, the texts or a domain's owner, **Then**
   it is refused; Editors can see them.

---

### User Story 4 - The admin shows what is missing (Priority: P2)

Before a domain goes live, the operator sees at a glance whether its legal
pages are complete.

**Why this priority**: incomplete legal pages are easy to miss; the warning
prevents publishing a site without them.

**Independent Test**: Leave an owner's contact empty: the domain shows
« Pages légales incomplètes » with what is missing; fill it: the warning
disappears.

**Acceptance Scenarios**:

1. **Given** a domain without its owner's name, address or contact, **When**
   the domains list or the domain is opened, **Then** it says the legal pages
   are incomplete and names the missing details.
2. **Given** the operator identity is incomplete, **Then** every domain shows
   the same warning, naming the operator's missing details.

---

### Edge Cases

- A domain with incomplete details: its pages are still served (better than
  no page), missing details are simply left out, and the admin warns (US4).
- A page published by an editor at the legal pages' address: refused, like
  the other reserved addresses.
- The operator is also the owner of a domain (e.g. the operator's own site):
  the same company appears as controller and as processor — the texts read
  naturally in that case (no contradiction).
- A domain whose banner is off: the policy does not describe the cookie
  banner; the page tests paragraph stays (they use no cookie).
- A text changes after a lead was submitted: the lead's consent record keeps
  the version it was given; that version's text stays in the admin archive,
  not online.
- Lead forms that set their own privacy link (existing pages): they keep it;
  only forms without one use the domain's policy.
- Inactive languages: their texts stay stored but are not offered.

## Requirements *(mandatory)*

### Functional Requirements

**Identities**

- **FR-001**: The installation MUST record the operator's identity once:
  name, legal form, registration number, address, contact e-mail and phone
  (its role — processor and host — is stated by the texts).
- **FR-002**: The installation MUST record the operator's suppliers that
  process visitors' data (sub-processors): name, role, location and transfer
  safeguards, and, for the one that hosts the sites, its address and phone
  (marked as the host, as the legal notice requires); administrators add,
  edit, order and remove them.
- **FR-003**: Each domain MUST record its owner's identity: name, legal form,
  registration number, address, contact e-mail for data-protection requests,
  publication director; and optionally the addresses of its own privacy
  policy and legal notice when the owner publishes them elsewhere.

**Pages**

- **FR-004**: Every active domain MUST serve, at fixed addresses on its host,
  a privacy policy and a legal notice built from the editable texts, the
  operator's identity and suppliers, and the domain owner's identity. Their
  language: the language of the page the visitor comes from, carried by the
  link (footer line, lead form), when a text exists in it; else the domain's
  default language; else French. The same address serves every language.
  These addresses are reserved (no page may take them).
- **FR-005**: When the domain gives its own address for either page, links
  generated by Trefle (lead forms, footer) MUST point there; the generated
  page MAY stay reachable.
- **FR-006**: Lead forms without a privacy link of their own MUST link to
  their domain's privacy policy; the consent record MUST store that policy's
  address and version.
- **FR-007**: Every published page MUST end with a thin line added by Trefle
  (not part of the page's design, not editable per page) linking to both
  legal pages of its domain — « Mentions légales · Confidentialité », in the
  page's language when a text exists for it, else French — keyboard
  reachable, readable on the page's background, and not breaking layouts
  from 360 px up. The measurement page of 018 MUST be reachable from the
  privacy policy.

**Texts**

- **FR-008**: The privacy policy and legal notice texts MUST be editable by
  Administrators in the admin, per active language, French required (it is
  the fallback), with placeholders for the operator's and owner's details.
  The default French texts ship with the feature, covering: controller,
  processor and sub-processors, purposes, legal bases and retention of leads
  (the installation's retention setting), the consent record, the double
  opt-in e-mail, the cookie banner (when used), page tests and their
  measurement (018), visitors' rights and how to exercise them, the right to
  complain to the CNIL; and, for the legal notice, publisher, publication
  director and host.
- **FR-009**: A domain MAY add one free paragraph per language to its privacy
  policy and one to its legal notice (e.g. its own CRM, newsletter or other
  supplier), each shown at a fixed place of the common text; the common text
  itself is not editable per domain.
- **FR-010**: A placeholder whose value is empty MUST never appear raw; the
  sentence or line it belongs to is left out.
- **FR-011**: The privacy policy's version MUST change whenever its text, the
  operator's identity or suppliers, or the domain's owner identity or extra
  paragraph change; the version is shown on the page with its date. Each new
  version MUST be archived as published — full text, language, domain, date —
  read-only in the admin (Administrators and Editors), never served online,
  and findable from a consent record's version. Archived versions are kept as
  long as consent records may refer to them.

**Admin**

- **FR-012**: Only Administrators MAY edit the operator identity, suppliers,
  texts and a domain's owner identity (domains are Administrator-only
  today); Editors can read them.
- **FR-013**: The domains list and each domain MUST show whether its legal
  pages are complete, naming what is missing (owner or operator details).
- **FR-014**: Saving texts or identities MUST refresh the affected pages
  within the delay of a normal publish (edge cache included).

### Key Entities

- **Operator identity**: one per installation — legal identity, contacts.
- **Supplier (sub-processor)**: name, role, location, safeguards; ordered
  list, one per installation.
- **Domain owner identity**: per domain — legal identity, data-protection
  contact, publication director, optional external policy/notice addresses,
  optional extra paragraph per language for each of the two pages.
- **Legal text**: privacy policy or legal notice, per language, with
  placeholders; French required.
- **Policy version**: identifies the text a visitor was given (shown on the
  page, stored with each consent record).
- **Archived policy version**: the full text of a version as published, with
  its language, domain and date; read-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of active domains serve a privacy policy and a legal
  notice, and 100% of lead forms without their own link point to their
  domain's policy.
- **SC-002**: An administrator changes a sentence of the policy and sees it on
  every domain within the delay of a normal publish, without a release.
- **SC-003**: A new domain can be given complete legal pages in under 5
  minutes (owner details only; texts and operator already set).
- **SC-004**: No generated page ever shows a raw placeholder or an empty
  « : » line, whatever is missing.
- **SC-005**: Every consent record stored after the release names its
  domain's policy address and version, and that version's full text can be
  shown from the admin.

## Assumptions

- **Roles**: the operator is processor (GDPR art. 28) and host (LCEN art.
  6-III); each domain owner is controller and publisher. The contract between
  them (data processing agreement) and the processing register are documents
  outside the product; a template for each ships in `docs/`.
- **No owner accounts**: domain owners do not log into the admin (one shared
  workspace, constitution); the operator's staff fill their details.
- **Default texts**: written in French by the project and reviewed by the
  operator before use; they are a template, not legal advice. Other languages
  are added by the operator.
- **Addresses**: fixed French paths on every domain (`/confidentialite`,
  `/mentions-legales`), like `/mesure-audience`.
- **Retention**: leads' retention comes from the existing setting (24 months
  today); text changes only through the texts.
- **Out of scope**: owner self-service, per-page legal texts, old policy
  versions online (they are archived in the admin only), cookie-banner text
  changes, processing-register tooling, terms of sale.
