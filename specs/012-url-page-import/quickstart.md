# Quickstart / validation guide: Import a page from a URL (012)

How to prove the feature works end to end. Contracts:
[import-api.md](contracts/import-api.md), [import-ir.md](contracts/import-ir.md).
Data: [data-model.md](data-model.md).

## 0. Prerequisites

- Stack up with both compose files (dev overlay is required):
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up --build`
  — the new `browser` service must be healthy alongside `cms`.
- `infra/.env` has `ANTHROPIC_API_KEY` for real imports (§3–4). For §1–2 set
  `IMPORT_AI_MODE=fixture` instead (no key, no cost).
- Migration applied: `npm run cms -- payload:migrate`.
- Settings (admin): `importMonthlyCapEur` = 20, `importUsdToEurRate` = 0.92
  (defaults).

## 1. Automated checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e:docker
```

Expected: all green. Must include:
- `packages/grapesjs-page-import`: serializer allow-list property test,
  verbatim-text test, lead-form rules per page type, columns > 4 split,
  GrapesJS round-trip (projectData → `getHtml()` equals serializer html),
  device rules round-trip (device overrides appear under the Tablet / Mobile
  portrait device views and in `getCss()` media rules), breakpoint constant
  equals the installed GrapesJS default devices.
- `apps/cms`: URL guard (every private/reserved range, IPv4-mapped IPv6,
  redirect to private), budget maths across the Europe/Paris month boundary,
  image normalisation to ≤ 500 KB, device check (horizontal scroll, text
  < 14 px, targets < 44 px, overflow detected on crafted HTML), job cleanup on failure/cancel (media
  deleted, no page), `altPending` validation.
- `apps/web`: lead form rendered when nested in Section › Columns › Column;
  existing top-level-form tests unchanged; background `url()` rewritten
  through ImgProxy.
- e2e (fixture AI): wizard → "Importer depuis une page web" → progress →
  editor opens on the new draft; report panel visible; dismiss persists.

## 2. Manual walkthrough (fixture mode)

1. Admin → Pages → Nouvelle page. Choose "Importer depuis une page web",
   type Inscription, title, domain/path, URL of the e2e fixture page.
   → Progress shows steps; editor opens on a draft page.
2. Click any heading, paragraph, button, image, Section, Column: each is
   selectable, editable, movable, deletable (FR-009, SC-005).
3. Change a Columns block from 3 to 2 columns: the removed third column's
   blocks are appended to the second column; nothing is lost.
4. Preview at 1440 px and at 360 px: side by side vs stacked (FR-024).
   Switch the editor's device selector to Tablet and Mobile portrait: the
   fixture's mobile adjustments (smaller hero heading, hidden decorative
   image) are shown and editable there, and absent from Desktop (FR-011a).
   The report's "Formats d'écran" section lists the device check results
   (FR-011c).
5. Publish (after configuring the form): the lead form renders inside its
   column; view-source shows nothing from the editor missing (FR-008).
6. Media library: imported images present once each; the one without source
   alt shows "À décrire" (FR-013).
7. Start an import of `http://cms/` and of `http://169.254.169.254/` →
   refused immediately with the internal-network message (FR-002).
   `http://cms:3000/` is refused too, earlier, as an invalid address
   (non-standard port, contracts/import-api.md `invalid-url`).
8. Start an import and cancel it → no page, no leftover media.
9. Start an import and close the tab mid-way. Reopen the admin → "Imports
   de pages" shows it completed with a link to its draft, and the draft is
   in the Pages list (leaving is not cancelling, FR-004).

## 3. Budget (real AI, ~€1)

1. Set `importMonthlyCapEur` to 1. Import one real public page.
   → Import list shows its `costEur` (≈ €0.7–0.9) and the banner shows the
   month total vs cap.
2. Import again once the total is ≥ 1 → the wizard shows the workspace
   budget message before the form is filled; the start endpoint returns 409
   `budget-exhausted`.
3. Reset the cap to 20. On an editor's user record set "Budget IA mensuel"
   to 0.5; as that editor, import once (it runs), then try again → personal
   budget message, 409 `user-budget-exhausted`; another editor can still
   import. The banner shows both editors' spending vs budget.
4. Clear the editor's budget (back to the default) and reset the cap.
5. Set `importMonthlyCapEur` to 0 → the wizard shows no import option at
   all (budget endpoint `enabled: false`, start → 409 `feature-disabled`).
   Same with `ANTHROPIC_API_KEY` empty and fixture mode off. Reset to 20.

## 4. Fidelity evaluation (SC-001, SC-002, SC-006, SC-009) — real AI, ≈ €9

Reference set: 10 varied public landing pages (SaaS, local business,
event, e-commerce product, association, long-form sales page, dark theme,
image-heavy, form-in-hero, one JS-rendered SPA). Keep the URL list in this
file's appendix once chosen, so later prompt changes are measured on the same
set.

For each page record: import duration (target < 2 min), reviewer verdict
"clearly the same page" yes/no at desktop width (target ≥ 8/10) **and at
390 px on a real phone or device emulation** (target ≥ 8/10), device-check
findings and whether a mobile fix was needed (SC-009: ≥ 7/10 need none),
minutes of touch-up to publishable (target < 15), cost. Failures of SC-002 lead to
prompt changes or effort `high` (research R3), re-measured on the full set.

## Verification log

**2026-09-27 — §1 and §2 (fixture mode), branch `012-url-page-import`**
(T072; §3 and §4 need the real key and wait for T070).

§1 — `npm run typecheck`, `npm run lint`: clean on all four workspaces.
`npm run test`: cms 395, web 117, grapesjs-page-import 57, shared 9 —
all passing. `test:browser` in the cms container: 6/6.
`npm run test:e2e:docker`: 37 passed, 1 skipped (us5-roles, quarantined).

§2 — scripted walkthrough (Playwright on the admin at `localhost:3000` +
REST calls), 20/20:

| Step | Result |
|---|---|
| 1 | Subscription import of the fixture page completes; editor opens on the draft. |
| 2 | Heading, paragraph, button, image, Section and Column each selectable with the move / copy / delete toolbar; heading edited in place. |
| 3 | Columns 3 → 2 from the settings panel: 2 columns, the third column's image and texts appended to the second. **Bug found and fixed here**: after loading a page, choosing 2 did nothing (the trait kept the type's default value, see the plugin's `syncCols`); regression test in `plugin.test.ts`. |
| 4 | Mobile portrait shows the smaller hero heading (32 px) and hides the decorative image; the report lists the screen-format checks. Side-by-side vs stacked at 1440 / 360 px: `us-layout-blocks` e2e. |
| 5 | Lead form in its column, publish, visitor sign-up: `us-import` e2e. |
| 6 | 3 imported images, each stored once; Media list shows « À décrire ». |
| 7 | `http://cms/` and `http://169.254.169.254/` → `private-address` in < 20 ms; `http://cms:3000/` → `invalid-url`. |
| 8 | Cancelled import: status `cancelled`, no page, no Media. |
| 9 | Wizard tab closed mid-import: import completed, the imports list links to the draft. |

No page errors in the admin during the walkthrough.

## Evaluation log (§4)

**Run 1 — 2026-09-28, `claude-opus-5`, effort `medium`, prompt with the
banner-photo rule.** 7 of the 10 reference pages (3 refuse the importer:
mariages.net, parisjetaime.com, eurofil/leroymerlin — to be run through 013,
saved files). Screens: `../eval-t070/index.html` (outside the repo).

| Page | Result | Duration | Cost | Device-check findings | Notes (reviewer to confirm) |
|---|---|---|---|---|---|
| elevalift | completed | 71 s | €0.42 | none | banner photo back after the fix; fonts substituted |
| objectif-libre | completed | 47 s | €0.37 | small text, small targets | very close; sidebar newsletter moved to the end |
| 1001traiteurs | completed | 61 s | €0.32 | small targets (card title links) | cards lose their frame; titles become blue underlined links; category chips become big buttons |
| unbounce-pricing | completed | 94 s | €0.59 | none | very close; price line all at the big size |
| unbounce-lp | completed | 53 s | €0.33 | none | very close; big product screenshot missing |
| montpellier-tourisme | completed (2nd try; 1st failed `internal` at images, €0.51) | 82 s | €0.52 | small targets | weakest: decorative film-strip image as banner background, texts over photos moved under them, agenda dates split, rows of 4 wrap 3 + 1, map missing |
| goldentree | completed | 33 s | €0.17 | small text, small target | very close |

SC-001 (< 2 min): 7/7. Cost: €0.17–0.59, mean €0.39 per page; run total
€3.23 (plus the failed attempt). SC-002 / SC-006: reviewer verdicts pending.
SC-009: 3/7 with no device finding — below the 7/10 target.

Leads for the next run: rows of 4 columns wrap at 1440 px (column basis
260 px too wide for 4 in the 1120 px content width — layout bug, not
prompt); inline links flagged as small targets (check WCAG inline-link
exception in the device check); keep source link colours in texts; prefer
a photo over decorative images for banner backgrounds; text over card
photos.

**Run 2 — 2026-09-28, same model and effort.** Changes since run 1: columns
all-or-nothing (no 3 + 1 wrap), text links judged at 24 px, footer kept,
column background images (text on card photos), whole-link titles take the
text colour, banner background = the photo filling the band. Tooling:
`apps/cms/scripts/import-eval/` (skill `trefle-import-eval`). Screens:
`../eval-t070/run2/index.html`.

| Page | Result | Duration | Cost | Notes (reviewer to confirm) |
|---|---|---|---|---|
| elevalift | completed | 74 s | €0.41 | banner photo kept, footer back; all 9 carousel testimonials now stacked (long) |
| objectif-libre | completed | 58 s | €0.39 | |
| 1001traiteurs | completed | 84 s | €0.38 | titles back to black bold (not blue links), cards 3 per row, dark footer back; category chips became a bullet list |
| unbounce-pricing | completed | 106 s | €0.63 | |
| unbounce-lp | completed | 68 s | €0.37 | |
| montpellier-tourisme | 3rd try completed | 96 s | €0.56 | 1st try `internal` (Media filename race, fixed), 2nd `ai-invalid` (out-of-list value, fixed by `repairWire`) — €0.57 each. Cards keep their titles on the photos, rows of 4 on one line, footer back (partner logos stacked very large); banner still a film-strip image; agenda still messy |
| goldentree | completed | 40 s | €0.19 | |

SC-001: 7/7 under 2 min. Run cost €2.94 + €1.14 for the two failed
montpellier attempts.

**Reviewer verdict (user, 2026-09-28): accepted** — run 2 judged better
than run 1 and good enough to validate the evaluation of the 7 reachable
pages. Follow-ups decided with it: a carousel keeps only its first slide
(one testimonial), category chips as a bullet list are fine. The 3 pages
that refuse the importer are evaluated through feature 013 (saved-file
import) once it ships.

Spent on the evaluation so far (local cms budget): ≈ €8.1, including
€0.23 of e2e imports accidentally run in real mode (the skill now forbids
it).

## Appendix: reference URLs

Chosen 2026-09-27. Keep the same list when re-measuring after a prompt or
effort change.

| # | URL | Kind |
|---|---|---|
| 1 | https://objectif-libre-et-independant.fr/encadrement-des-loyers-a-paris-contournement/ | long article / sales content |
| 2 | https://www.mariages.net/ | portal home page |
| 3 | https://www.1001traiteurs.com/blog/ | blog index |
| 4 | https://unbounce.com/pricing/ | SaaS pricing page |
| 5 | https://unbounce.com/product/landing-pages/ | SaaS product landing page |
| 6 | https://parisjetaime.com/ | tourism portal, image-heavy |
| 7 | https://www.montpellier-tourisme.fr/ | tourism portal, image-heavy |
| 8 | https://www.eurofil.com/assurances/assurance-auto/devis-auto.html/vehicule/choix-vehicule? | insurance quote funnel (multi-step form) — replaces domo-blog.fr (too heavy: 400 KB extract, truncated) |
| 9 | https://sp.goldentree.fr/p/mpr/mpr-p4/ | lead-generation landing page (form) |
| 10 | https://elevalift.fr/ | local business site |
