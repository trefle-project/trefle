# Implementation Plan: Import a page from a URL into the block editor

**Branch**: `012-url-page-import` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-url-page-import/spec.md`

## Summary

An editor gives a public URL in the page creation wizard; the CMS renders the
page in an isolated headless browser at desktop, tablet and mobile widths,
extracts its visible texts, images, forms, computed styles and per-device
differences, and asks Claude (structured outputs) to arrange
them into a fixed, non-recursive tree of library blocks that references
source texts and images **by id only**. A pure serializer turns that tree
into native GrapesJS `projectData` + `html`/`css` — including per-device
adjustments written as the editor's own Tablet / Mobile device-view styles —
the result is checked automatically at each device width, images are downloaded,
compressed under 500 KB and stored as ordinary Media, and a regular draft
page is created with an import report. Two new library blocks, **Section**
and **Columns**, ship as a GrapesJS plugin in a new workspace package and are
usable by hand. The renderer learns to place the lead form anywhere in the
tree. Cost per import is recorded and capped monthly in euros.

## Technical Context

**Language/Version**: TypeScript 5, Node ≥ 24 (repo `engines`), React 19.2,
Next.js 16.3 (read `node_modules/next/dist/docs/` before touching Next APIs,
per AGENTS.md), Payload 3.88.

**Primary Dependencies**: existing — Payload (collections, globals, Jobs,
custom endpoints), GrapesJS 0.22.16, `sharp` 0.35 (CMS), `zod` 3
(`@trefle/shared`), `isomorphic-dompurify` (web). **New** (Principle II
justifications below): `@anthropic-ai/sdk` (CMS), `playwright-core` 1.63.0
exact (CMS), `html-react-parser` (web), `zod` added as a direct dependency of
the new package. New container: `mcr.microsoft.com/playwright:v1.63.0-noble`
(already used by e2e).

**Storage**: PostgreSQL via Payload migrations — new `page_imports` table,
new columns on `pages`, `media`, `settings` ([data-model.md](data-model.md)).
Images in Garage via the existing `media` upload collection.

**Testing**: Vitest (package, cms, web, `@trefle/shared`), Playwright e2e
(docker) with `IMPORT_AI_MODE=fixture`; manual fidelity evaluation on a
10-page reference set with the real model ([quickstart.md](quickstart.md) §4).

**Target Platform**: Docker Compose — local dev (base + override) and the
production VPS (Hostinger KVM 2: 2 vCPU, 8 GB RAM) via `docker-compose.prod.yml`.

**Project Type**: Web monorepo (npm workspaces): `apps/cms` (Payload admin +
API + jobs), `apps/web` (public renderer), `packages/shared`, new
`packages/grapesjs-page-import`.

**Performance Goals**: Typical landing page (≤ 15 sections, ≤ 30 images)
imported in < 2 min (SC-001): render at 3 widths ≤ 30 s, AI ≤ 75 s, images
≤ 20 s (parallelism 4, overlapping nothing), build + device check + save
≤ 10 s. Hard stop at 4 min (FR-021).

**Constraints**: Only renderer-allow-listed markup (FR-008); texts verbatim
(structural, R3); ≤ 500 KB per image; no request from the browser or the
image fetcher to non-public addresses (R4); `browser` container
`mem_limit: 1g`; no concurrency limit beyond what the global cap and user
budgets impose (Principle I); published-page client JS unchanged (the parser runs
server-side only).

**Scale/Scope**: Solo-operator product, a handful of editors, tens of imports
per month (≈ €0.70–0.90 per import; cap €20 ≈ 22–28 imports). One new collection, one new package,
~6 CMS modules, 2 renderer changes, wizard + report UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| **I. Simplicity First** | One job, one serializer, one guard module; no generic "importer framework"; Section/Columns only (no dedicated header/footer/pricing blocks). **Deviation (assumed structural choice, confirmed by the user):** a separate workspace package for the plugin + serializer where `apps/cms/src/fields/grapesjs/` would do — see Complexity Tracking. The renderer change *removes* the fragile string-split logic. | ⚠️ justified |
| **II. Stack-Native, Minimal Additions** | Payload Jobs for the background work, Payload collections/globals/endpoints, GrapesJS plugin API for new blocks, `sharp` already present. New runtime dependencies each justified below. GrapesJS stays pinned exactly; `playwright-core` pinned to the container tag. | ✅ with justifications |
| **III. Small, Reversible Changes** | Migration expand-only with documented down path. Feature hidden until usable: the wizard option only appears when the budget endpoint reports `enabled` — `ANTHROPIC_API_KEY` (or fixture mode) configured and the global cap > 0 — setting the cap to 0 disables it instantly. Delivered as several PRs (see below), each leaving `main` up. | ✅ |
| **IV. Working Software Over Ceremony** | Automated tests required and planned for: URL guard, budget maths, serializer + IR validation, a11y checks, image normalisation, job cleanup, custom endpoints, renderer nested-form path, Media `altPending` rule. Section/Columns markup is block markup (exempt) but covered by the serializer and renderer tests anyway. e2e smoke on an imported page. | ✅ |
| **V. Quality the User Feels** | Wizard handles loading (progress + steps), empty/unavailable (budget, missing key), error (plain French per `errorCode`). Import report panel on the page. Columns stack at 360 px without media queries; the source's tablet/mobile rendering is reproduced with the editor's existing device-view styles (R15) and the result is checked at every device width (R16). Background images go through ImgProxy (R9). Accessibility issues reported, axe on published pages still authoritative. No new client JS on published pages. | ✅ |
| Architecture — containers by concern | New `browser` container, internal network shared with `cms` only, no published port. | ✅ |
| Secrets & configuration | `ANTHROPIC_API_KEY` in git-crypt'd `infra/.env` (+ `.env.example` placeholder); `IMPORT_ALLOW_PRIVATE_HOSTS` / `IMPORT_AI_MODE=fixture` refused when `DEPLOY_ENV=production` (set only by the prod overlay; CI e2e runs production images, so `NODE_ENV` can't be the switch). | ✅ |
| Performance budget (published pages) | Unchanged client JS; `html-react-parser` server-only. | ✅ |

**Principle II — new runtime dependencies**

| Dependency | What it does | Why the stack can't | Size / maintenance |
|---|---|---|---|
| `@anthropic-ai/sdk` (cms) | Calls the Claude API with structured outputs, typed errors, retries | No LLM in the stack; conversion quality requires it (clarification Q1) | Official SDK, actively maintained, no native deps |
| `playwright-core` 1.63.0 (cms) | Drives the remote Chromium over WebSocket | Rendering JS pages needs a real browser (R2) | Same project as the e2e tooling already used; client only, no browser download |
| `html-react-parser` (web) | Parses sanitised HTML into React elements so the form can sit anywhere | React can't render unbalanced HTML fragments (R7) | ~10 KB, MIT, maintained; server components only |
| `zod` (new package) | IR schema for structured outputs + validation | Already the repo's schema library (`@trefle/shared`) | Existing dependency, same major |

**Post-design re-check (after Phase 1)**: no new violations. The design added
the `altPending` Media flag and the renderer parser change — both are the
smallest change satisfying FR-013 / FR-025, recorded in research R7/R8.

## Project Structure

### Documentation (this feature)

```text
specs/012-url-page-import/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R14 decisions
├── data-model.md        # Phase 1: page-imports, pages/media/settings changes
├── quickstart.md        # Phase 1: validation guide + fidelity evaluation
├── contracts/
│   ├── import-api.md    # Endpoints, error codes, browser service
│   └── import-ir.md     # AI output schema + serializer guarantees
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/grapesjs-page-import/            # NEW — @trefle/grapesjs-page-import
├── package.json                          # exports ./plugin ./ir ./serialize (TS sources, no build)
├── src/
│   ├── plugin.ts                         # GrapesJS plugin: trefle-section / -columns / -column types, "Colonnes" trait, 2 blocks
│   ├── layout.ts                         # Shared Section/Columns markup + style constants (used by plugin AND serializer)
│   ├── ir.ts                             # Import IR zod schema (contracts/import-ir.md)
│   ├── serialize.ts                      # IR + sources → { projectData, html, css, report parts }
│   └── a11y.ts                           # contrast / heading / alt / empty-link checks (R11)
└── tests/                                # vitest: serializer, allow-list property, verbatim texts, GrapesJS round-trip (jsdom), a11y

packages/shared/src/
├── blocks.ts                             # BLOCK_TYPES += section, columns, column
└── html-allowlist.ts                     # NEW — ALLOWED_TAGS / ALLOWED_ATTR moved from apps/web render.ts

apps/cms/src/
├── collections/PageImports.ts            # NEW — page-imports collection
├── collections/Pages.ts                  # + importedFrom, ImportReportPanel
├── collections/Media.ts                  # alt validate, altPending, importedBy
├── globals/Settings.ts                   # + importMonthlyCapEur, importUsdToEurRate, importDefaultUserBudgetEur
├── collections/Users.ts                  # + importMonthlyBudgetEur (admin-only field)
├── endpoints/pageImportStart.ts          # NEW — POST /api/page-imports/start
├── endpoints/pageImportCancel.ts         # NEW — POST /api/page-imports/:id/cancel
├── endpoints/pageImportBudget.ts         # NEW — GET /api/page-imports/budget
├── jobs/pageImport.ts                    # NEW — Payload task: render → convert → images → build → save
├── lib/import/url-guard.ts               # NEW — public-address check, guarded fetch agent (R4)
├── lib/import/render.ts                  # NEW — Playwright remote session, 3 renderings (desktop/tablet/mobile), DOM extract + tiles (R2)
├── lib/import/device-check.ts            # NEW — automatic check of the result at the 4 device widths (R16)
├── lib/import/extract.browser.ts         # NEW — function evaluated in the page (DOM extract)
├── lib/import/convert.ts                 # NEW — Claude call, prompt, cost (R3, R10); fixture mode
├── lib/import/images.ts                  # NEW — download, dedupe, sharp normalise, Media create (R8)
├── lib/import/budget.ts                  # NEW — month totals (Europe/Paris), global cap + per-user budget checks
├── lib/import/form-mapping.ts            # NEW — source form → pages.form.fields + Settings defaults (US4)
├── components/PageCreateWizard.tsx       # + "Importer depuis une page web" branch, progress, cancel, budget notice
├── components/ImportReportPanel.client.tsx  # NEW — report on the page edit view, dismiss
├── components/ImportBudgetBanner.tsx     # NEW — month total vs cap + per-user spending vs budget on the imports list
├── fields/grapesjs/Editor.client.tsx     # plugins: [trefleLayoutPlugin]
├── payload.config.ts                     # register collection, endpoints, task, imports queue autoRun
└── migrations/2026MMDD_page_imports.ts   # NEW

apps/web/src/
├── lib/render.ts                         # allow-list imported from shared; renderWithForm() via html-react-parser (R7)
├── lib/imgproxy.ts                       # + background url() rewrite (R9)
└── components/page-shell.tsx             # uses the parsed tree instead of before/after fragments

infra/
├── docker-compose.yml                    # + browser service, browser network; cms gets BROWSER_WS_URL, ANTHROPIC_API_KEY
├── docker-compose.prod.yml               # browser: restart always, logging, mem_limit
└── .env.example / .env                   # + ANTHROPIC_API_KEY, IMPORT_AI_MODEL, IMPORT_AI_EFFORT
```

**Structure Decision**: Existing monorepo layout. The only new top-level
unit is `packages/grapesjs-page-import` (user decision, see Complexity
Tracking). Server-side orchestration stays inside `apps/cms` (Payload job +
endpoints + `lib/import/`), the renderer change stays inside `apps/web`.

### Delivery slices (each a PR that leaves `main` working)

1. **Layout blocks (Story 3)**: package with plugin + `layout.ts`, shared
   `BLOCK_TYPES`/allow-list move, editor loads plugin, renderer parser
   change (nested lead form) + background ImgProxy rewrite. Useful on its own.
2. **Import pipeline, fixture mode (Story 1 core)**: `page-imports`,
   endpoints, job, URL guard, browser container, serializer + IR, wizard
   branch, report panel — end to end with `IMPORT_AI_MODE=fixture`; wizard
   option hidden in prod until slice 3.
3. **Real conversion + budget**: Claude call, cost, Settings fields, budget
   endpoint/banner; reference-set evaluation.
4. **Images (Story 2)**: download/normalise/Media, `altPending`, cleanup.
5. **Form mapping (Story 4)**.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Separate workspace package `@trefle/grapesjs-page-import` (Principle I: fewer files/concepts) | Explicit user decision to build the GrapesJS extension as its own package. Technically it also keeps the Section/Columns definitions shared by the browser plugin and the server serializer in one Payload-free, independently tested unit | Keeping it in `apps/cms/src/fields/grapesjs/` is simpler and was the default recommendation; the user chose the package option and confirmed it on 2026-09-27 as a deliberate, permanent structural choice (not a temporary exception to track for removal) |
| New `browser` container | Only a real browser renders JS pages and computed styles; isolating it from the CMS protects credentials and caps memory | Chromium in the CMS image: larger image, untrusted pages in the credential-holding process |
