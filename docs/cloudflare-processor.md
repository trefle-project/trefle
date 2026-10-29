# Cloudflare as a data processor — ready-to-use texts

English translation of [sous-traitant-cloudflare.fr.md](sous-traitant-cloudflare.fr.md).

**Status**: draft written on 2026-10-11 for task T059 of
`specs/017-edge-protection` (FR-019, research R19). It was taken over by the
feature dedicated to legal pages and the record of processing activities
(021); nothing is published until that feature is done.

**Facts checked on 2026-10-11**: Cloudflare has been in front of every host
since 2026-10-10; no public page sets a cookie (Bot Fight Mode off, no
`__cf_bm` or `cf_clearance`); the privacy page is the URL of the
`defaultPrivacyNoticeUrl` setting (content managed in the admin, not in the
repository).

## 1. Privacy policy — "Processors" section

Audience: the sites' visitors.

> **Cloudflare (site security and delivery)**
>
> The site is delivered through the network of Cloudflare, Inc. (United
> States), which protects it against attacks and speeds up the display of
> images and fonts. To do so, Cloudflare processes, on our behalf, visitors'
> IP addresses and the technical data of each request (page address, browser,
> date and time). Information entered in forms also passes through this
> network, encrypted between your browser and Cloudflare and then between
> Cloudflare and our server. Cloudflare does not use it for its own purposes.
>
> Cloudflare sets no cookie on your device.
>
> The transfer of this data to the United States is covered by the EU–US Data
> Privacy Framework, under which Cloudflare is certified, and by the standard
> contractual clauses of its data processing agreement.

## 2. Record of processing activities — processor

| Field | Value |
|---|---|
| Processor | Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, United States |
| Processing concerned | Every public site (pages, contact form, images, fonts); the admin and GrowthBook |
| Purposes | Protection against attacks, traffic filtering, caching of images and fonts |
| Data | IP address, technical request data, request content in transit (including form data) |
| Data subjects | Site visitors, team members |
| Transfer outside the EU | United States: Data Privacy Framework and standard contractual clauses (Cloudflare's data processing agreement, accepted with its terms of use) |
| Since | 2026-10-10 |

## 3. Record of processing activities — access control to the admin (019)

Since 2026-10-16, Cloudflare Access controls access to the admin and to
GrowthBook (019-admin-access, FR-014). Entry to add to the record:

| Field | Value |
|---|---|
| Processing | Access control to the administration (Payload admin, GrowthBook) |
| Processor | Cloudflare, Inc. (Cloudflare Access, Zero Trust Free plan) |
| Purpose | Check, before any access, that a person is an active team member (one-time code sent by e-mail) |
| Data | Members' e-mail addresses; IP address, date and time of each sign-in; a 24-hour session token |
| Data subjects | Team members (not site visitors) |
| Legal basis | Legitimate interest: security of the information system and of prospects' data |
| Source of the list | The admin's active members, synchronised by `infra/cloudflare/apply.sh --sync-members` |
| Transfer outside the EU | United States: same safeguards as section 2 |
| Since | 2026-10-16 |

Informing members: one sentence is enough, for example in the invitation
message or on the "My account" page — "Access to the administration goes
through Cloudflare Access, which receives your e-mail address to send you a
sign-in code and logs each sign-in (IP address, date and time)."

## To settle in the feature

- **Retention of logs at Cloudflare**: not checked for the Free plan; add it
  if the record requires a duration.
- **019 (admin access)**: done, see section 3 (in place since 2026-10-16).
- **Lot 3 and later** (HTML served from Cloudflare, Worker): review the text,
  in particular the sentence about cookies.
