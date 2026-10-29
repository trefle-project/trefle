# Implementation Plan: Import a website from a Penpot file

**Branch**: `015-penpot-site-import` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-penpot-site-import/spec.md`

## Summary

An editor opens a new « Importer un site Penpot » wizard, either from the
Pages list or from a domain's own page. They first choose the domain the
site is for (already chosen when opened from a domain), then drop a `.penpot` file
exported from Penpot 2. The CMS reads the zip in memory and lists the boards
of the chosen Penpot page, each with a proposed address. Addresses already
published on that domain are marked. The editor ticks boards, adjusts
addresses, and confirms the language (pre-filled from the domain). A background job then turns every ticked board into
a draft « free » page.

The conversion is done by **rules, without Claude**. A pure converter in
`@trefle/grapesjs-page-import/penpot` maps Penpot's flex/grid layouts,
texts, fills, strokes, shadows and vectors to plain editable GrapesJS
components with id-based CSS. It adds tablet/mobile device styles so the
design adapts down to 360 px. It also turns Penpot prototype links into
links between the new pages, or to http(s)/mailto/tel addresses.

Images go to the Media library through the 012 normaliser. Fonts become a
**domain setting** (« Polices du domaine », User Story 4). The domain lists
its Google fonts, and Trefle downloads them once into a new `fonts`
collection. The public page shell serves them with `@font-face` for every
page of the domain, and the editor offers them in its font list. A Penpot
import adds the fonts its design uses to the domain. Each page is checked at the 4 device widths by the existing device
check and gets an import report. The whole import is recorded in a new
`site-imports` collection, so a failure or cancel leaves nothing behind.

## Technical Context

**Language/Version**: TypeScript 5, Node ≥ 24, React 19.2, Next.js 16.3.4
(read `node_modules/next/dist/docs/` before touching Next APIs, per
AGENTS.md), Payload 3.88.0, GrapesJS 0.22.16 (exact).

**Primary Dependencies**: Existing ones: Payload (collections, upload
collections, custom endpoints, Jobs, custom admin views), `@payloadcms/storage-s3`
(+ its `@aws-sdk/client-s3`, used for the bucket CORS rule), `sharp` (via the
012 `normalise()`), `playwright-core` + the `browser` container (012
`deviceCheck`), `@trefle/shared` allow-list, `@trefle/grapesjs-page-import`
(012 report types, a11y checks, round-trip helpers). **New**: `fflate`
(zip reading, in the package). Justified below.

**Storage**: PostgreSQL via two expand-only Payload migrations, one per
delivery slice: `domain_fonts` (`fonts` table, `domains` font rows) and
`site_imports` (`site_imports` + `boards` array table, `pages.site_import_id`)
([data-model.md](data-model.md)). Font files and
images go in the asset bucket (Garage / S3). The uploaded `.penpot` waits in
`$TMPDIR/trefle-site-imports/<id>` until its import ends.

**Testing**: Vitest (package, cms), Playwright e2e (docker) with a committed
trimmed fixture `.penpot`, and a manual fidelity evaluation on the 4
reference files ([quickstart.md](quickstart.md) §3).

**Target Platform**: Docker Compose. Local dev (base + override) and the
production VPS (Hostinger KVM 2, 2 vCPU, 8 GB) via `docker-compose.prod.yml`.
Penpot itself is **not** deployed: it runs on the editor's computer.

**Project Type**: Web monorepo (npm workspaces): `apps/cms`, `apps/web`,
`packages/shared`, `packages/grapesjs-page-import`.

**Performance Goals**: at most 10 boards per import (clarification).
5-board import < 2 min (SC-006): parse ≤ 5 s, fonts ≤
15 s (first time; then 0), images ≤ 20 s, build < 1 s per board, device check
≈ 8 s per page, save ≤ 5 s. Hard stop at 6 min, enough for 10 boards (≈ 3 min).

**Constraints**:
- Output only in the renderer allow-list (FR-008 of 012, guarantee 1).
- Texts verbatim.
- Each page's `builder` ≤ 450 KB, kept under the admin's 500 KB save cap
  (research P3).
- Never write zip entries to disk.
- Uploaded file ≤ 100 MB, held in memory once while parsing.
- No published page and no editor canvas loads anything from Google (FR-013).
- No new client JS on published pages.

**Scale/Scope**: Solo operator, a handful of editors, a few site imports per
month, 3–10 boards each. New: 2 collections, 4 endpoints, 1 job, 1 admin
view + 1 button used in 2 places, domain fonts (array field + hook + usage
counter, page-shell `@font-face`, editor font list), 1 converter module (~1 500 lines with tests), 2
migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| **I. Simplicity First** | Fonts handled once, at the domain, where they belong; pages carry no `@font-face`. Rules-based converter, no AI, no IR. It lives in the existing import package, not a new one (P2). It emits plain GrapesJS components and no new block types. The job copies the 012 job's checkpoint pattern rather than extracting a shared framework (second use: copy, per "abstraction on third use"). Two new collections, each a single concept: `site-imports` (an import that produces several pages, with no budget or URL; overloading `page-imports` would blur both) and `fonts` (files with their own type and lifecycle, not images). | ✅ |
| **II. Stack-Native, Minimal Additions** | Payload upload collection + existing `s3Storage` for fonts. Payload Jobs on the existing `imports` queue, a Payload custom admin view, GrapesJS device styles and `font-face` at-rules, the S3 client already installed (for CORS). One new dependency: `fflate`. | ✅ with justification |
| **III. Small, Reversible Changes** | `PENPOT_IMPORT=on` flag (default off): entry button and endpoints are absent while off. Expand-only migration with a `down`. Four PRs (below), each leaving `main` up. Undo = flag off, or revert. Created pages are ordinary drafts the editor can delete. | ✅ |
| **IV. Working Software Over Ceremony** | Tests planned for every converter guarantee (contract), zip limits, endpoints, job cleanup, sweep, font dedupe; e2e from upload to a published link; manual steps recorded in the PR bodies. | ✅ |
| **V. Quality the User Feels** | Wizard: domain first, so the editor sees from the start which site they are importing into, with addresses already published on it marked. Loading, empty (« aucun board »), error (French per code) and success states. Responsive rules emitted as device styles and checked at 4 widths (P5). Accessibility: heading inference, alt from layer names or `altPending`, link names, and the 012 a11y report. Fonts self-hosted with `font-display:swap`. **Known gap:** a board drawn with no layout at all (free positioning) is scaled down rather than rearranged, so at 360 px its text is too small. Such pages get an *action before publishing* in their report and stay drafts until the editor reworks them. Nothing unusable is published silently. | ⚠️ mitigated |
| Architecture, containers by concern | No new container. The `cms` gains outbound HTTPS to Google Fonts (import time only), the same egress class as the Claude API. | ✅ |
| Secrets & configuration | No new secret. `PENPOT_IMPORT` documented in `.env.example`. | ✅ |
| Performance budget (published pages) | No client JS added. Fonts: the domain's declared weights only (`@font-face` costs nothing until a text uses the face), latin + latin-ext woff2 (≈ 15–30 KB each), `swap`. Images through ImgProxy (`<img>` and background rewrite of 012). | ✅ |

**Principle II: new runtime dependency**

| Dependency | What it does | Why the stack can't | Size / maintenance |
|---|---|---|---|
| `fflate` (package `@trefle/grapesjs-page-import`) | Reads the `.penpot` zip in memory: central directory first (sizes, counts) for the limits, then inflates only the entries needed | Node has no zip reader; the stack has none | MIT, no dependencies, pure JS (no native build in Docker), widely used (it backs several bundlers); stable API, infrequent releases |

**Post-design re-check (after Phase 1)**: no new violations. The design
added the 450 KB size guard (P3) and the bucket CORS rule (P8). Both are the
smallest changes satisfying the editor save cap and FR-013. The free-layout
gap above is accepted by the spec (FR-011) and made visible to the editor.

## Project Structure

### Documentation (this feature)

```text
specs/015-penpot-site-import/
├── plan.md                    # This file
├── research.md                # Phase 0: P1–P16
├── data-model.md              # Phase 1: site-imports, fonts, pages.siteImport
├── quickstart.md              # Phase 1: validation guide + fidelity evaluation
├── contracts/
│   ├── site-import-api.md     # Endpoints, error codes, wizard
│   └── penpot-conversion.md   # Converter API + guarantees
├── checklists/requirements.md # Spec quality checklist
└── tasks.md                   # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
packages/grapesjs-page-import/
├── package.json                          # + "./penpot" export, + fflate
├── src/penpot/
│   ├── read.ts                           # zip limits, manifest, pages, shapes, media, thumbnails (P1, P12)
│   ├── model.ts                          # Penpot shape types used by the converter (subset of the camelCase JSON)
│   ├── paths.ts                          # board order + proposed addresses (P13)
│   ├── layout.ts                         # flex / grid / sizing / free (cqw) / responsive rules (P4–P6)
│   ├── style.ts                          # fills, strokes, radii, shadows, blur, opacity, rotation (P4)
│   ├── text.ts                           # paragraphs, spans, headings (P7)
│   ├── svg.ts                            # vector clusters → inline svg (P9)
│   ├── links.ts                          # interactions → hrefs (P10)
│   └── convert.ts                        # boardNeeds(), convertBoard(): tree walk, ids, styles, report, size
├── scripts/penpot-fixture.mjs            # builds tests/fixtures/journal-mini.penpot from a reference file
└── tests/penpot/                         # one file per guarantee of contracts/penpot-conversion.md + fixture tests

apps/cms/src/
├── collections/SiteImports.ts            # NEW: site-imports
├── collections/Fonts.ts                  # NEW: fonts upload collection
├── collections/Pages.ts                  # + siteImport; importReport visible for site imports; list button
├── endpoints/siteImportAnalyse.ts        # NEW: POST /api/site-imports/analyse
├── endpoints/siteImportStart.ts          # NEW: POST /api/site-imports/:id/start
├── endpoints/siteImportCancel.ts         # NEW: POST /api/site-imports/:id/cancel
├── jobs/siteImport.ts                    # NEW: parse → fonts → images → build → check → save; cleanup; sweep of analysed
├── lib/fonts.ts                          # NEW: Google CSS2 fetch, woff2 download, fonts lookup/create, @font-face rules (shared by Domains hook, job, editor)
├── lib/import/bucket-cors.ts             # NEW: idempotent PutBucketCors at boot (P8)
├── lib/import/site-files.ts              # NEW: SITE_FILES_DIR, write/read/remove
├── components/SiteImportButton.tsx       # NEW: « Importer un site Penpot »: Pages list (beforeListTable) + Domain edit view (?domain=id), flag-gated
├── collections/Domains.ts                # + SiteImportButton in edit.beforeDocumentControls; + fonts array (« Polices ») + beforeChange download hook
├── endpoints/domainFontUsage.ts          # NEW: GET /api/domains/:id/font-usage (FR-028)
├── components/DomainFontRow.client.tsx   # NEW: « utilisée par N pages » on each font row
├── fields/grapesjs/Editor.client.tsx     # + domain fonts in the font-family options + @font-face in the canvas
├── components/SiteImportWizard.client.tsx # NEW: the 3-step wizard (custom view)
├── components/ImportReportPanel.client.tsx # + reads the report from siteImport.boards[]
├── jobs/pageImport.ts                    # sweepStaleImports also covers site-imports (running/queued + analysed > 1 h)
├── payload.config.ts                     # register collections, endpoints, task, fonts in s3Storage, CORS at init
├── migrations/2026MMDD_domain_fonts.ts   # NEW (slice 2)
└── migrations/2026MMDD_site_imports.ts   # NEW (slice 3)

apps/web/src/
├── lib/payload-client.ts                 # domain fetched with fonts.files (depth 1)
└── components/page-shell.tsx             # + one <style> of the domain's @font-face before the page CSS

infra/
├── .env.example / .env                   # + PENPOT_IMPORT
└── deploy/Caddyfile                      # only if Garage's website endpoint ignores bucket CORS (P8 fallback)
```

**Structure Decision**: Existing monorepo layout, no new workspace. The pure
conversion goes next to the 012 serializer in `@trefle/grapesjs-page-import`
(same outputs, same tests). Payload orchestration (collections, endpoints,
job, wizard, domain fonts) stays in `apps/cms`. `apps/web` changes in one
place: the page shell writes the domain's `@font-face`. Imported pages are
otherwise ordinary GrapesJS pages; background images and inline SVG already
pass through the renderer.

### Delivery slices (each a PR that leaves `main` working)

1. **Converter (package only)**: `src/penpot/*`, `fflate`, fixture + tests
   for every guarantee. Size measurement on the reference set (P3 estimate
   confirmed or the threshold revisited). Nothing user-visible yet.
2. **Domain fonts (User Story 4)**: `fonts` collection + s3Storage entry,
   `domains.fonts` + hook, usage endpoint + row component, page-shell
   `@font-face`, editor font list + canvas, bucket CORS at boot. Verify that
   Garage's website endpoint sends the CORS headers (P8); if not, add the
   Caddy fallback. **Useful on its own**: hand-made pages get their
   domain's fonts. Not flag-gated.
3. **Site import end to end, flag off in prod**: `site-imports`, migration,
   endpoints, job, sweep, wizard, list button, report panel, e2e. Enabled
   locally with `PENPOT_IMPORT=on`.
4. **Evaluation and switch-on**: quickstart §2–§3 on the 4 reference files.
   Fix what the evaluation finds, write `evaluation.md`, then set
   `PENPOT_IMPORT=on` in prod (release via `release.sh`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Free-positioned boards are imported scaled down, not rearranged (Principle V, usable from 360 px) | The spec imports them (FR-011), and a wireframe designer's file is still a useful starting point | Refusing them would block the import entirely. Inferring a layout from geometry is a project of its own (research P5/P6). Mitigation: an *action before publishing* in the report, and the page stays a draft |
