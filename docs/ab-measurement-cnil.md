# A/B test measurement (018) — CNIL self-assessment

English translation of [mesure-ab-cnil.fr.md](mesure-ab-cnil.fr.md). The CNIL
is France's data protection authority; its guidance on the consent exemption
for audience measurement applies French law (Article 82 of the French Data
Protection Act, which transposes Article 5(3) of the ePrivacy Directive).

**Status**: draft written on 2026-10-20 for step 5 of the roll-out of
`specs/018-ab-significance`, to be validated by the controller (and a legal
adviser if needed). **Conclusion: the exemption does not apply** (§ 3).
**Final decision of 2026-10-20: cookieless tests** (§ 7) — nothing is stored
on or read from the visitor's device, so neither the exemption nor consent
comes into play. (An intermediate step, "measurement with consent", release
`018.1-consent`, made landing pages untestable and was dropped the same day.)
The tables below describe the design that was assessed, that of release
`018-ab-significance`.

**Reference**: CNIL, *Outil d'auto-évaluation relatif à la mise en œuvre
d'une solution de mesure d'audience exemptée de consentement* (self-assessment
tool for an audience-measurement solution exempt from consent), July 2025
(https://cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf),
read in full on 2026-10-20. The answers below follow the table in its annex
("self-assessment document template").

**What is assessed**: the measurement as built by 018 and shipped to
production on 2026-10-20 (release `018-ab-significance`), **not switched
on**:

- on a page under an A/B test, the Cloudflare Worker sets a random identifier
  `tf-visitor` (first-party cookie, 395 days, never extended) and records the
  visitor's first "exposure": identifier, test, variant seen, date;
- when that visitor submits the page's form, the lead is linked to the
  identifier and the variant (`ab_conversions`, with the link to the lead);
- GrowthBook, self-hosted on our server, reads these two tables and computes
  the probability that a variant does better than the original; the admin
  shows only totals per variant;
- objection through the `/audience-measurement` page (opt-out cookie); data deleted
  30 days after the test ends.

Trefle is here both the publisher of the sites and the "provider" of the
solution: the criteria aimed at a third-party provider do not apply.

## 1. Purpose (tool, § 3)

The tool accepts only: performance measurement, detection of navigation
problems, optimisation of technical performance or ergonomics, estimation of
server capacity, analysis of the content viewed.

It **explicitly excludes**, even when they can be switched off:

- "any measurement for marketing purposes, including […] measuring the
  performance of conversion channels";
- "**any creation of user cohorts in order to show them different content,
  whether membership of such a cohort is defined at random** or based on
  previously collected information".

**Assessment**: a page A/B test splits visitors at random into groups that see
different content — the very definition of the second exclusion. And what 018
measures is a conversion rate (the lead) per variant, close to the first.
**Not compliant** with the purpose of the exemption, and this does not depend
on a setting: it is what the feature is for.

## 2. Criteria (tool, § 4 and annex)

| Objective | Criterion | Met | Comment / action |
|---|---|---|---|
| Single purpose: audience measurement | Instructions to switch off whatever falls outside the scope | Yes | All measurement is switched off by one setting (`EXPOSURES=off`, runbook 5.1) — but see § 1: the feature itself falls outside the scope |
| | Minimised data: HTTP headers | Yes | No header is recorded; the browser is used only, on the spot, to discard declared robots |
| | At most three types of events (presence on a page, use of a feature, time) | Partly | The exposure is a "presence on a page"; the form submission is a "use of a feature", **but it is linked to the lead**, hence to personal data (see the "tagging" row) |
| Processing on behalf | GDPR Article 28 DPA | Not applicable / yes | No measurement provider (GrowthBook self-hosted). Cloudflare acts as delivery host, with its data processing agreement (see [cloudflare-processor.md](cloudflare-processor.md)) |
| | No pooling between clients | Yes | Each test covers only the pages of one domain; identifiers specific to each domain |
| | No reuse by the provider | Yes | No provider receives this data |
| | Point of contact | Not applicable | Trefle is the publisher |
| No tracking outside the site | No import of external data (CRM, UTM, campaign, referrer limited to the domain, no third-party tool) | Yes | The measurement records no UTM, no referrer, no customer identifier; no third-party tool |
| | Identifier internal to the site | Yes | Cookie without a `Domain` attribute: one per domain, no tracking from one site to another |
| | IP address truncated if used | Yes | The measurement records no IP address |
| | Device fingerprinting | Yes | None |
| | **No tagging that makes it possible to retrieve personal information, for example through forms** | **No** | `ab_conversions` links the identifier to the lead, which holds the e-mail and form fields. Possible fix: record the conversion **without** a link to the lead (identifier, variant, date only) — but the "confirmed lead" (double opt-in) could then no longer be counted |
| | No unified coverage-rate measurement | Yes | None |
| Anonymous statistics only | Reports: anonymous statistics, rounded to the nearest ten (or an anonymity analysis) | Partly | The admin and GrowthBook show exact numbers per variant (visitors, leads). Small numbers ("3 leads") identify no one on their own, but the admin also lists leads with their page, hence their variant: an anonymity analysis would have to be written, or rounding to the nearest ten on the test screens |
| | Effective anonymisation whatever the criteria chosen | Partly | The date-range filter on the figures can isolate very small groups: same remark |
| | No tracking of a user's navigation | Yes | Only the first exposure to a test is recorded; no journey, no session replay |
| Right to object | Button or link **in the privacy policy** | To do | Planned in the legal notice: better placed in the privacy policy, as the tool recommends |
| | Refusal honoured over time | Yes | Opt-out cookie (395 days): no more identifier, no more exposure, no more lead linking |

## 3. Conclusion

According to the July 2025 tool, **018's measurement cannot benefit from the
consent exemption**:

1. **blocking** — the purpose: A/B tests (random cohorts seeing different
   content) are expressly excluded from the scope of the exemption, as is
   measuring the performance of a conversion;
2. **blocking but fixable** — linking the identifier to the form data;
3. **to complete** — the anonymity of the statistics shown (rounding or
   analysis) and the location of the objection link.

Point 1 contradicts the assumption made in the spec on 2026-10-09 ("option A:
audience-measurement exemption"), which relied on older or secondary sources
listing A/B tests among the covered uses. The July 2025 tool is the CNIL's
most recent document on the subject and says the opposite.

**A/B assignment itself (008)**: the `tf-ab-*` cookie puts the visitor in a
group to show them different content — the same "creation of a cohort".
**Decision of 2026-10-20**: from release `018.1-consent`, a visitor who has
not accepted the banner always sees the original page and receives no variant
cookie. Cookies set earlier expire by themselves (30 days); the earlier period
is not reprocessed.

## 4. Options

| Option | What it changes | Cost |
|---|---|---|
| **A. Measure only with consent** | The Worker sets `tf-visitor` and records an exposure only if the visitor accepted the cookie banner (`tf_consent=accepted`, 007). Domains without a banner are not measured. The `/audience-measurement` page becomes an information page; withdrawal goes through the banner | Small change to 018 (one more cookie read at the edge, page text, tests). Sample reduced to those who accept, so slower verdicts |
| **B. Legal opinion first** | Nothing is switched on until a DPO or a lawyer has decided, with this document | Delay; no measurement meanwhile |
| **C. Do not measure per visitor** | Measurement stays off; A/B tests keep their current totals (visits, leads per variant), without significance | No statistical verdict |

In every case: fix point 2 if measurement is switched on without the link to
the lead (or keep it under consent), and put the `/audience-measurement` link in
the privacy policy.

## 5. Record of processing activities — entry to complete for the option chosen

| Field | Value |
|---|---|
| Processing | Measurement of page A/B tests (comparing versions of a page) |
| Controller | [to complete] |
| Purpose | Find out whether a version of a page gets more contact requests than the original |
| Legal basis | Article 82 not concerned: nothing is stored on or read from the device (§ 7). For the data kept (view number, version, link to a request): **legitimate interest** (improving our own pages) — to be confirmed by the controller |
| Data | Random number specific to one view (never stored on the device); test and version shown; date; if a request is submitted from that view: date and link to the request |
| Data subjects | Visitors of the pages under test |
| Recipients | No third party. Analysis tool (GrowthBook) hosted on our server; Cloudflare as delivery processor |
| Retention | No cookie. Data: deleted 30 days after the test ends; the link to a request disappears as soon as the request is erased or its consent withdrawn |
| Security measures | Tables not reachable from the admin or the API; GrowthBook reads with a read-only role limited to these two tables; admin and GrowthBook behind Cloudflare Access and two-factor authentication |
| Transfer outside the EU | Cloudflare's (section 2 of [cloudflare-processor.md](cloudflare-processor.md)); none for the measurement itself |
| Since | [activation date] |

## 6. Informing visitors

- **Privacy policy** of each domain: a paragraph on page tests and a link to
  `/audience-measurement`, which describes them.
- **Cookie banner**: nothing to change (tests use no cookie).

## 7. Final decision: cookieless tests (2026-10-20)

Prior consent made landing pages untestable: visitors see them before
answering the banner. The design chosen (research R15 of the spec):

- the version is **drawn at random on every view**; no assignment cookie is
  read or set (a reload may show the other version);
- each view gets a **random number** that the Worker places only in the
  signed token of the page's form — it is never stored on the device;
- one "exposure" (number, test, version, date) is recorded per view; a
  request submitted from that view is linked to its number and version;
- retention: 30 days after the test ends; no per-view data in the admin.

Article 82 governs reading and writing information on the device; with none
of either, neither consent nor its exemption is at stake. The CNIL tool's
criteria remain a good minimisation grid: no cross-referencing outside the
test, no third party, aggregated statistics only. **To be confirmed** by the
controller (legal basis of the data kept: legitimate interest).
