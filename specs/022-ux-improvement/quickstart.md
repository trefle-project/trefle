# Quickstart: validating 022-ux-improvement

Contracts: [page-stats](contracts/page-stats.md), [admin-ui](contracts/admin-ui.md),
[legal](contracts/legal.md). Data: [data-model.md](data-model.md).

Local stack: both compose files (`-f infra/docker-compose.yml -f
infra/docker-compose.override.yml`), migrations run, dev seed loaded.

## V1 — Pages Stats totals (US1, SC-001, SC-002)

Seed two pages with daily stats on 10 days. Open Reports → Pages Stats: last
30 days, two rows (plus published pages at 0), totals = Σ seeded days, sorted
by views; no stats-row ID visible. Change the period to 3 days: totals
follow. Sort by each column. Export CSV: same rows and totals.

## V2 — Chart, day and hour (US1)

Click a row: one point per day of the period. Pick the last 2 days and switch
to « Heure »: one point per hour (installation time zone), hours before the first
hourly data shown as « pas de données horaires ». Pick 10 days: « Heure » not
offered. Send views through the edge batch and a lead: the current hour's
point grows.

## V3 — Migration back-fill and retention

With seeded `edge_view_windows` over the last 20 days and leads over 40
days, run the migration: hourly rows start at the earliest ledger window (views
and submissions alike), sums match; older leads not back-filled. Run the retention
job with an hourly row of 91 days: removed; daily rows untouched. Down path:
table dropped, nothing else changed.

## V4 — Menu and Settings (US2, SC-003)

Menu groups and entries in the order of the admin-ui contract, new names in
page titles, old URLs still open. Group headings larger. Drag the menu edge,
log out, log in from another browser: same width; double-click: 275 px.
Settings → Default: four tabs, fields as FR-012; change a value in « Général »
and save from « Textes légaux »: both kept. Search Users by a name fragment:
found.

## V5 — Legal pages (US3, SC-004)

Domain with an empty owner: `/confidentialite` and `/mentions-legales` show no
heading without text under it; fill the owner: headings come back; a new
archived version exists.

## V6 — Branding (US4, SC-005, SC-006)

As Administrator upload logo, icon, favicon, a 15×15 pattern and variant,
mode « K par écran » K = 1. Log out: login page shows logo, wallpaper with one
variant, footer « Powered by Trefle v 0.1.0 - r dev ». Log in: every page has
wallpaper, icon, favicon, footer, tab title « … · {operator name} »; the page
editor canvas has no wallpaper. Navigate: the variant moves. Switch to « 1 sur
N » N = 50: about 1 tile in 50. Upload a variant of another size: refused.
Remove every image: today's look. Non-Administrator: branding fields
read-only. Without sign-in, `GET /api/globals/settings` still refused.
Set up 2FA for a test member: the authenticator shows the operator name.
axe on the login page and on Pages Stats: no serious/critical violation.

## V7 — Avatars (US5)

Upload an avatar on one's account: account button, Users column and Activity
log actor show it. A member without one: initials disc, same colour on
reload. As Editor, try to change another member's avatar: refused. Upload a
1.5 MB image or a PDF: refused with the French message. Pick an image for a
page: no avatar offered.

## V7b — Time zone (US6, SC-008)

Browsers in Asia/Tokyo, installation default Europe/Paris. Member A chooses
America/New_York: a lead's « Soumission », an Activity log entry, a page's
« publié le », Pages Stats hours and A's export all show New York time
(export with `-04:00`/`-05:00`); « today » in a period filter = New York
midnights. Member B (no choice) sees Paris time for the same items. A clears
the choice: Paris time. Change the installation default: B follows, A (with a
choice) does not. Login page dates/footer: installation default. Editable date field: picker shows the note. Note whether Payload's
document-header dates follow (else known exception). Delete a page with stats:
Pages Stats shows « Pages supprimées » with its totals.

## V8 — Production (after release)

Footer shows the deployed tag; Pages Stats totals for page 19 over 30 days
match the sum of its daily rows (read-only SQL by the user); legal pages of
every domain have no empty heading; branding set by the user appears on
`admin.example.com`.
