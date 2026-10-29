# Record of processing activities — entries to reuse

English translation of [registre-traitements.fr.md](registre-traitements.fr.md),
for information. Adapt it to your jurisdiction and have it reviewed.

**Status**: draft of 2026-10-21 (`specs/021-legal-pages`, research R10). Two
records: one for each **domain owner** (controller, GDPR Article 30.1) and one
for the **operator** (processor, Article 30.2). To be completed and reviewed.

## A. Record of the domain owner (controller)

### A1. Contact requests

| Field | Value |
|---|---|
| Controller | [Company name, address, contact] |
| Purpose | Receive and answer contact requests from the site [domain] |
| Legal basis | Consent (form checkbox) and pre-contractual measures |
| Data subjects | People who submit the form |
| Data | Form fields, page and date of submission, proof of consent (text, date, IP address, browser) |
| Recipients | Authorised staff of the controller; the processor [operator] and its sub-processors |
| Transfers | Cloudflare, Inc. (United States): Data Privacy Framework, standard contractual clauses |
| Retention | [24 months] after the request, then automatic erasure |
| Security | See Annex 2 of the data processing agreement |

### A2. Proof of consent and confirmation e-mail

| Field | Value |
|---|---|
| Purpose | Prove the consent given; confirm the e-mail address (double opt-in) |
| Legal basis | Obligation to be able to demonstrate consent (GDPR Art. 7.1) |
| Data | Accepted text, policy version, date, IP address, browser; confirmation date |
| Retention | That of the request it belongs to |

### A3. Page tests (018)

| Field | Value |
|---|---|
| Purpose | Compare two versions of a page to find out which is clearer |
| Legal basis | Legitimate interest (nothing is stored on or read from the visitor's device) |
| Data | Random number specific to one view, test and version shown, date; link to a request submitted from that view |
| Retention | 30 days after the test ends |
| Recipients | No third party; analysis tool hosted by the processor |

### A4. Measurement and marketing cookies (when the banner is enabled)

| Field | Value |
|---|---|
| Purpose | Audience measurement and marketing by the configured tools (Google Tag Manager) |
| Legal basis | Consent (banner) |
| Retention | Choice kept 6 months; the enabled tools' own durations |

## B. Record of the operator (processor)

| Field | Value |
|---|---|
| Processor | [Operator's company name, address, contact] |
| Controllers on whose behalf it processes | The owners of the domains served (list in the administration, "Domains" collection) |
| Categories of processing | A1 to A4 above, for each domain |
| Sub-processors | "Sous-traitants" (sub-processors) settings (Hostinger, Cloudflare, Brevo…) |
| Transfers | Cloudflare, Inc. (United States): Data Privacy Framework, standard contractual clauses |
| Security | See Annex 2 of the data processing agreement |

### B2. The operator's own processing: access control to the administration

See [cloudflare-processor.md](../cloudflare-processor.md) § 3 (Cloudflare
Access, team members).
