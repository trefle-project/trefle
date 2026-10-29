# Quickstart: validating 021-legal-pages

Contracts: [legal-api](contracts/legal-api.md), [renderer](contracts/renderer.md),
[admin](contracts/admin.md). Data: [data-model.md](data-model.md).

## V1 — Defaults after migration

Settings has a French row with both default texts and link labels; existing
pages whose form link equalled the old default now have it empty; the down
path restores them.

## V2 — Fill the identities (SC-003)

Fill the operator and suppliers once, then one domain's owner: time it
(< 5 min for the owner part); the domain shows « Complètes ».

## V3 — Privacy policy and legal notice (US1, US2)

Open `/confidentialite` and `/mentions-legales` on that domain: owner as
controller/publisher, operator as processor/host, suppliers listed, retention
from the setting, cookie-banner paragraph only if the banner is on, link to
`/mesure-audience`, version and date shown, no `{{`.

## V4 — Languages (clarification 2)

Add an English row; an English page's footer and form links open the English
texts; a direct visit uses the domain's default language; a language without
a row falls back to French.

## V5 — Footer and form link (clarification 1, FR-006, FR-007)

Every published page (incl. an A/B variant and a confirmation page) ends
with the footer line; through the edge Worker too; axe clean; 360 px OK.
The lead form link opens the domain's policy; submit a lead: its consent
record shows the URL and version, and « Politique acceptée » opens the
archived text.

## V6 — Edits and archive (US3, FR-011)

Change a sentence: every domain shows it on the next view (edge purge), the
version changes, a new archive row exists, the old one is still readable.
Add a domain paragraph: only that domain shows it.

## V7 — External URLs, incomplete domain (FR-005, US4)

Give a domain its own policy URL: footer and form link there and
`/confidentialite` redirects. Empty an owner field: the page drops the lines
using it, the admin lists it as missing.

## V8 — Production (after release)

Operator and owners filled; both domains: pages 200 through Cloudflare, the
client domain's form link no longer points to the EU page, a test lead's
consent record names the domain policy and its archived version.
