---

description: "Task list for 012-url-page-import"
---

# Tasks: Import a page from a URL into the block editor

**Input**: Design documents from `/specs/012-url-page-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The spec does not ask for TDD, but the constitution
(Principle IV) makes automated tests mandatory for business logic, data
transformations, access rules, custom hooks/endpoints and any path that
had a bug. Tests may be written before or after the code they cover.

**Organization**: Tasks are grouped by user story (spec.md) so each story
can be built, tested and shipped on its own. Story order follows the
dependencies below, not only priority: US3's renderer change is needed by
US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 import, US2 images, US3 Section/Columns, US4 forms
- Paths are relative to the repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New package, dependencies, browser container, configuration.

- [X] T001 Create `packages/grapesjs-page-import/` with `package.json` (`"name": "@trefle/grapesjs-page-import"`, `"private": true`, `"type": "module"`, `exports` `./plugin` → `./src/plugin.ts`, `./ir` → `./src/ir.ts`, `./serialize` → `./src/serialize.ts`, no build step, scripts `typecheck`/`test`/`lint` like `packages/shared/package.json`), `tsconfig.json` extending `tsconfig.base.json`, `vitest.config.ts`, empty `src/` and `tests/` — *done in slice 1 with exports `./plugin` and `./layout`; `./ir` and `./serialize` are added by T033 and T034 when those files exist*
- [X] T002 Add dependencies: `zod` (same major as `packages/shared`) + `grapesjs` as exact `peerDependency` and `devDependency` `0.22.16` in `packages/grapesjs-page-import/package.json`; `@anthropic-ai/sdk`, `playwright-core` pinned exactly `1.63.0`, and `"@trefle/grapesjs-page-import": "*"` in `apps/cms/package.json`; `html-react-parser` in `apps/web/package.json`; run `npm install` at the root to update `package-lock.json` — *slice 1 installed only `@trefle/grapesjs-page-import` (cms) and `html-react-parser` (web); `@anthropic-ai/sdk` moves to T038 and `playwright-core` to T037*
- [X] T003 [P] Add the `browser` service to `infra/docker-compose.yml`: image `mcr.microsoft.com/playwright:v1.63.0-noble`, command `npx -y playwright@1.63.0 run-server --port 3100 --host 0.0.0.0`, no published ports, `mem_limit: 1g`, healthcheck on the port, on a new `browser` network shared with `cms` only; give `cms` `BROWSER_WS_URL: ws://browser:3100/`, `ANTHROPIC_API_KEY`, `IMPORT_AI_MODEL` (default `claude-opus-5`), `IMPORT_AI_EFFORT` (default `medium`), `IMPORT_AI_MODE`, `IMPORT_ALLOW_PRIVATE_HOSTS`
- [X] T004 [P] Add `browser` overrides to `infra/docker-compose.prod.yml` (`restart: always`, `<<: *logging`, `ports: !reset []`) and require `ANTHROPIC_API_KEY` only when the import feature is enabled (document "leave empty to hide the feature")
- [X] T005 [P] Document the new variables in `infra/.env.example` (placeholders, one comment each) and add them to the git-crypt'd `infra/.env` with dev values (`IMPORT_AI_MODE=fixture` in dev) — *done in slice 2 for `infra/.env.example`; the git-crypt'd `infra/.env` is left unchanged: the dev overlay supplies the dev values (`IMPORT_AI_MODE=fixture`, `IMPORT_ALLOW_PRIVATE_HOSTS=import-fixture`), and a new key there would make `release.sh` stop the next deploy until prod values are added*
- [X] T006 In `apps/cms/src/lib/env.ts`, refuse at boot (throwing, like `requiredInProd`) `IMPORT_ALLOW_PRIVATE_HOSTS=true` and `IMPORT_AI_MODE=fixture` when `DEPLOY_ENV=production` — not `NODE_ENV`, because CI e2e runs the production images; set `DEPLOY_ENV: production` on `cms` in `infra/docker-compose.prod.yml` only; test in `apps/cms/tests/env.test.ts`
- [X] T007 Make the production images carry the new package: copy `packages/grapesjs-page-import` in the `runtime` stage of `apps/cms/Dockerfile` (next to `packages/shared`) and wherever the build stage copies workspace packages; read `node_modules/next/dist/docs/` on server external packages and add `playwright-core` to `serverExternalPackages` in `apps/cms/next.config.*` if it is not external by default; verify with `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up --build --wait` that `cms`, `web` and `browser` come up healthy — *done in slice 1: package copied into the cms runtime image and declared in both images' `deps` stage and the e2e runner; images rebuilt and stack healthy. The `playwright-core` bundling check moved to T037*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared block vocabulary, schema, URL guard: needed by every story.

**⚠️ CRITICAL**: No user-story work before this phase is complete.

- [X] T008 [P] Add `"section"`, `"columns"`, `"column"` to `BLOCK_TYPES` in `packages/shared/src/blocks.ts`; extend `packages/shared/tests/blocks.test.ts` (nested markers counted, `leadForm` count unchanged when the lead form is nested in a column)
- [X] T009 [P] Move `ALLOWED_TAGS` / `ALLOWED_ATTR` / `SAFE_URI_REGEXP` from `apps/web/src/lib/render.ts` to new `packages/shared/src/html-allowlist.ts`, export from `packages/shared/src/index.ts`, import them back in `apps/web/src/lib/render.ts` (no behaviour change; existing web tests must stay green)
- [X] T010 [P] Create `packages/grapesjs-page-import/src/layout.ts`: the single source of Section / Columns / Column markup (research R6): `section[data-block="section"]` + inner `div[data-block-inner]` (`max-width`, `margin:0 auto`), `div[data-block="columns"][data-cols]` with `display:flex;flex-wrap:wrap;gap:24px`, `div[data-block="column"]` with `flex:1 1 260px;min-width:0`, plus helpers returning both GrapesJS component JSON and HTML for each; also export `DEVICE_BREAKPOINTS = { tablet: "(max-width: 992px)", mobileLandscape: "(max-width: 768px)", mobilePortrait: "(max-width: 480px)" }` and the device preview widths `{ desktop: 1440, tablet: 770, mobileLandscape: 568, mobilePortrait: 320 }` (research R15)
- [X] T011 [P] Test in `packages/grapesjs-page-import/tests/layout.test.ts` that `DEVICE_BREAKPOINTS` and preview widths equal the installed GrapesJS 0.22.16 default `deviceManager` devices (`widthMedia` with `max-width`, `width`), so a GrapesJS upgrade that changes them fails loudly
- [X] T012 Create the GrapesJS plugin `packages/grapesjs-page-import/src/plugin.ts` registering component types `trefle-section`, `trefle-columns`, `trefle-column` (recognised by `data-block` via `isComponent`, selectable/editable/stylable, droppable as below), no blocks yet (added in US3); verify each API against installed 0.22.16 types with `.claude/skills/grapesjs/scripts/gjs-api.sh`
- [X] T013 Load the plugin in `apps/cms/src/fields/grapesjs/Editor.client.tsx` (`plugins: [trefleLayoutPlugin]` in `grapesjs.init`) so imported or hand-built layout markup opens as native components
- [X] T014 Create collection `apps/cms/src/collections/PageImports.ts` (slug `page-imports`, group "Content", label "Imports de pages") with the fields, access and list columns in data-model.md, verbatim: `sourceUrl` text required; `finalUrl` text; `pageType` select `subscription|free|confirmation` required; `title` text required; `domain` rel→domains; `path` text; `language` rel→languages; `status` select `queued|running|completed|failed|cancelled` required default `queued`; `step` select `render|convert|images|build|check|save`; `progress` number 0–100; `cancelRequested` checkbox default false; `errorCode` select (codes of contracts/import-api.md); `errorMessage` text; `costUsd`/`costEur` number; `aiModel` text; `startedAt` date required; `finishedAt` date; `createdBy` rel→users required; `page` rel→pages; `media` rel→media hasMany; `report` json; `reportDismissed` checkbox default false. Access: read `isAdminOrEditor`; create/update/delete `() => false` except field-level update on `reportDismissed` for `isAdminOrEditor`; list columns `sourceUrl, status, createdBy, startedAt, costEur, page` with `page` rendered as a link to the draft and `errorMessage` visible on the document view (FR-004a) — *done; `title` added to the list columns (tells imports of one site apart); endpoints registered on the collection itself, since `/api/page-imports/*` never falls back to top-level endpoints*
- [X] T015 [P] Add `importedFrom` (rel→`page-imports`, optional, read-only, sidebar) to `apps/cms/src/collections/Pages.ts`
- [X] T016 [P] Change `apps/cms/src/collections/Media.ts`: `alt` no longer `required`, custom `validate` "required unless `altPending` is true"; add `altPending` checkbox default false label "À décrire" (list column) and `importedBy` rel→`page-imports` read-only; `beforeChange` hook clearing `altPending` when `alt` becomes non-empty
- [X] T017 [P] Add `importMonthlyCapEur` (number, required, default `20`, min `0`, description "0 désactive les imports") and `importUsdToEurRate` (number, required, default `0.92`, min `0.01`) to `apps/cms/src/globals/Settings.ts`; also `importDefaultUserBudgetEur` (number, required, default `10`, min `0`, description "Budget mensuel des utilisateurs sans budget propre")
- [X] T018 [P] Add `importMonthlyBudgetEur` to `apps/cms/src/collections/Users.ts`: number, optional, min `0`, label "Budget IA mensuel (€)", description "Vide = budget par défaut des réglages. 0 = pas d'import.", `access: { update: adminFieldOnly }`, sidebar; extend `apps/cms/tests/access-editor.test.ts` (an editor cannot set their own or another user's budget, an admin can)
- [X] T019 Register `PageImports` in `apps/cms/src/payload.config.ts`, regenerate `apps/cms/src/payload-types.ts`, create migration `apps/cms/src/migrations/<timestamp>_page_imports.ts` (+ `.json`, `index.ts` entry) with a tested `down` (drop table/columns; backfill empty `media.alt` with the filename before restoring `NOT NULL`) — *migration `20260927_115510_page_imports`; down path tested up → down (with a pending-alt image and an import job row) → up on a copy of the dev DB*
- [X] T020 [P] Tests for T016 in `apps/cms/tests/media-alt-pending.test.ts`: manual upload without alt rejected; `altPending: true` with empty alt accepted; writing an alt clears `altPending`
- [X] T021 Implement `apps/cms/src/lib/import/url-guard.ts` (research R4): `assertPublicHttpUrl(url)` (scheme, no credentials, port 80/443/empty, `dns.lookup all:true`, every address public), `isPublicAddress(ip)` (reject loopback, RFC 1918, 100.64/10, 169.254/16, 0/8, multicast, reserved, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped IPv6 of all of these), `guardedAgent()` (undici `Agent` with `connect.lookup` applying the same check), honouring `IMPORT_ALLOW_PRIVATE_HOSTS` outside production — *`IMPORT_ALLOW_PRIVATE_HOSTS` is a comma-separated host-name list (`import-fixture`), not `true`, so tests still prove `cms`/metadata are blocked; `guardedAgent()` moves to T053 (only image downloads use it; undici becomes a direct dependency then)*
- [X] T022 [P] Tests for T021 in `apps/cms/tests/import-url-guard.test.ts`: every blocked range, IPv4-mapped IPv6, docker service names (`cms`, `db`), `javascript:`/`file:`/`ftp:`, credentials, port 8080, a host with one public and one private address (rejected), public host accepted
- [X] T023 [P] Extend `apps/web/src/lib/imgproxy.ts` to rewrite `url(...)` pointing at `ASSET_ORIGIN` inside `style` attributes and in page CSS (width 1920, `fit`, research R9); call it in `apps/web/src/components/page-shell.tsx` on HTML and `page.builder.css`; test in `apps/web/tests/imgproxy-background.test.ts`

**Checkpoint**: Foundation ready. Every app builds, migration up/down works, `docker compose up` healthy with `browser`.

---

## Phase 3: User Story 1 - Import a public page as an editable draft (Priority: P1) 🎯 MVP

**Goal**: URL in the wizard → draft page made only of library blocks, fully editable, with an import report. Images appear as the standard placeholder (real images: US2), source forms are omitted and reported (forms: US4).

**Independent Test**: With `IMPORT_AI_MODE=fixture`, import the e2e fixture page: a draft page is created, every top-level element is a library block, every text is editable in place, the preview shows nothing less than the canvas, the report lists omissions (quickstart §2 steps 1–2, 7–8).

### Tests for User Story 1

- [X] T024 [P] [US1] Serializer tests in `packages/grapesjs-page-import/tests/serialize.test.ts`: output uses only `@trefle/shared` allow-listed tags/attrs (property test over generated IRs); every output text byte-identical to an extract text; unknown refs dropped + reported; > 4 columns split into rows; invalid colours / out-of-range px dropped; source forms omitted with "add a lead-form block" action on subscription pages; device overrides emitted only as `#<id>` rules under `(max-width: 992px)` / `(max-width: 480px)` in both `projectData.styles` (`mediaText`, `atRuleType: "media"`) and `css`, `hidden` → `display:none`, overrides equal to the inherited value dropped, nothing for Mobile landscape
- [X] T025 [P] [US1] GrapesJS round-trip test in `packages/grapesjs-page-import/tests/roundtrip.test.ts` (vitest + jsdom): load serialized `projectData` with the plugin into a headless editor, assert `getHtml()` equals serializer `html` modulo whitespace and every text node is type `text` (editable); selecting the Tablet / Mobile portrait device in the headless editor shows the imported overrides on the component (the same place a manual device edit is stored) and none on Desktop
- [X] T026 [P] [US1] Accessibility check tests in `packages/grapesjs-page-import/tests/a11y.test.ts`: contrast pass/fail at 4.5:1 and large-text 3:1, background image → `contrast-unverifiable`, heading skip h1→h3, empty link text, missing alt
- [X] T027 [P] [US1] Budget tests in `apps/cms/tests/import-budget.test.ts`: month total in Europe/Paris across the 31→1 boundary at 23:30/00:30, `cap = 0` unavailable, `spent ≥ cap` unavailable, `resetsAt` = first day of next month 00:00 Paris; per-user total filters on `createdBy`; empty user budget falls back to `importDefaultUserBudgetEur`; user budget 0 → blocked by `user`; both reached → `blockedBy: "user"`; lowering a budget below current spending blocks new imports without touching past costs
- [X] T028 [P] [US1] Conversion tests in `apps/cms/tests/import-convert.test.ts` with an injected fake client: cost from `usage` (input, cache write, cache read, output) at Opus 5 rates, unknown model priced at the highest known rate, `refusal` → `ai-refused`, `max_tokens` / unparsable → `ai-invalid`, API/connection errors → `ai-unavailable`, fixture mode returns the canned IR without a client; the request sent to the fake client contains only the tiles, the page extract and the frozen system prompt — no Trefle data (leads, users, other pages, Media) (FR-026) — *slice 2: fixture part only (`apps/cms/tests/import-convert.test.ts`); the real-client cases land with T038's real mode in slice 3; slice 3 added them: the fake is the one SDK call (`CreateMessage`, injected through `makeConvert`); FR-026 is asserted as exact equality of the whole user message (labelled tiles + extract) plus the frozen system prompt, and the request's top-level keys are pinned; `import-job.test.ts` also checks that a refused or invalid answer still records its cost*
- [X] T029 [P] [US1] Job tests in `apps/cms/tests/import-job.test.ts` (fake render + fake convert): happy path creates a draft page with `importedFrom`, status `completed`, report stored; failure at each step → `failed`, correct `errorCode`/`errorMessage`, no page; `cancelRequested` → `cancelled`, no page; 4-minute deadline → `timeout`; an import whose cost pushes the user and the workspace past their limits still completes and records its full cost
- [X] T030 [P] [US1] Endpoint tests in `apps/cms/tests/import-endpoints.test.ts`: start → 202 + queued doc; `invalid-url`, `private-address`, `unresolvable`, `invalid-input` → 400; budget exhausted → 409; non-staff → 403; cancel by creator/admin ok, by another editor 403, terminal → 409; user budget exhausted → 409 `user-budget-exhausted` while another user can still start; budget endpoint returns `workspace` + `user` parts and `blockedBy`; feature not configured or global cap 0 → budget endpoint `enabled: false` and start → 409 `feature-disabled`
- [X] T031 [P] [US1] Device check tests in `apps/cms/tests/browser/import-device-check.test.ts`, run by a new `test:browser` script (`apps/cms/package.json`) against the running stack's browser container, excluded from the host `npm test` and **failing, not skipping, when `BROWSER_WS_URL` is unset**: crafted HTML with a 500 px fixed-width block, 12 px text, a 30 px-high CTA and an overflowing image produces exactly the expected `deviceChecks` per device; clean serializer output of the fixture produces none
- [X] T032 [US1] Browser SSRF test in `apps/cms/tests/browser/import-render-guard.test.ts`, same `test:browser` script and failure rule as T031, using the fixture service of T049 (add `redirect-internal.html` / a 302 route and `subresource-metadata.html` to it): a fixture page that redirects to `http://cms:3000/` fails with `private-address`; a fixture page loading a sub-resource from `http://169.254.169.254/` renders with that request aborted

### Implementation for User Story 1

- [X] T033 [P] [US1] Import IR zod schema in `packages/grapesjs-page-import/src/ir.ts` exactly as contracts/import-ir.md (non-recursive: sections → rows → columns → leaf blocks; refs only; whitelisted styles), exported types
- [X] T034 [US1] `serializeImport(ir, extract, options)` in `packages/grapesjs-page-import/src/serialize.ts` → `{ projectData, html, css, report parts }` using `layout.ts` and the existing six block shapes from `apps/cms/src/fields/grapesjs/blocks.ts` (pass block definitions in via `options` so the package stays Payload-free), explicit GrapesJS types (`text`, `image`, `link`, layout types), images → Image block placeholder SVG when no Media URL is provided, lead-form leaves omitted and reported (US4 enables them); stable component ids for styled elements and per-device rules per research R15 using `DEVICE_BREAKPOINTS`; `report.sourceHadMobileLayout` from the IR
- [X] T035 [P] [US1] Accessibility checks `packages/grapesjs-page-import/src/a11y.ts` (research R11), used by the serializer to fill `report.accessibility`
- [X] T036 [P] [US1] DOM extract function `apps/cms/src/lib/import/extract.browser.ts` (runs in the page via `page.evaluate`): visible text units with deterministic ids in DOM order, tag, box, whitelisted computed styles, inline markup filtered to `b strong i em u s br a[href]` with absolute hrefs; images (`img` + CSS backgrounds) with candidates/alt/box; forms with fields (label, type, required, options); unsupported elements (video, iframe, map, table, canvas) with kind/box; font families used; callable again after a viewport resize to return, for the same ids, box / hidden / computed styles that differ from the desktop pass
- [X] T037 [US1] Rendering session `apps/cms/src/lib/import/render.ts`: `chromium.connect(BROWSER_WS_URL)`, context starting at 1440×900, service workers + downloads blocked, `context.route("**/*")` applying `url-guard` per request host (cached), navigation 30 s, `not-html` / `login-required` (401/403) / `blocked` / `unreachable` detection, auto-scroll for lazy content, overlay removal (fixed/sticky covering elements, cookie/chat selectors), `finalUrl`, full-page screenshot cut into ≤ 6 tiles 1440 px wide ≤ 2576 px tall, extract via T036, always closes the context; after the desktop pass, resize the same page to 820×1180 then 390×844, re-scroll, re-extract device differences and take tiles (tablet ≤ 4 × 820 px wide, mobile ≤ 6 × 390 px wide), every tile labelled with its device (research R2); first install `playwright-core` pinned exactly `1.63.0` in `apps/cms/package.json` (moved from T002) and check server-external bundling (moved from T007) — *done; the page's requests are fetched without following redirects so each hop is re-checked (Playwright does not re-route redirects); WebSockets are closed; `next build` in the cms image bundles `playwright-core` fine*
- [X] T038 [US1] Conversion `apps/cms/src/lib/import/convert.ts`: `client.messages.parse` with `model` = `IMPORT_AI_MODEL`, `thinking: {type: "adaptive"}`, `output_config: { effort: IMPORT_AI_EFFORT, format: zodOutputFormat(ImportIR) }`, server-side fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), frozen system prompt (block library, rules: refs only, one level of columns, report what you omit/simplify) with prompt caching, tiles as image blocks labelled desktop / tablet / mobile + extract (with per-device differences) as JSON text, prompt rules for per-device overrides (only when the source differs, `hidden` for desktop-only decorations, readable text on phones), `AbortSignal` for cancel, stop-reason checks before reading output, cost computation + `aiModel` from the response; `IMPORT_AI_MODE=fixture` returns `apps/cms/tests/fixtures/import-ir.fixture.json`; verify SDK calls against the `claude-api` skill docs before writing; first install `@anthropic-ai/sdk` in `apps/cms/package.json` (moved from T002) — *slice 2: fixture mode only (`convertPage`, `conversionConfigured`); the Claude call is slice 3, and until then an API key alone does not enable the feature; slice 3: `@anthropic-ai/sdk` pinned `0.128.0`. Deviations: (1) `client.beta.messages.create` with `output_config.format = betaZodOutputFormat(ImportIR)` and the format's own `parse` after the `stop_reason` check, instead of `messages.parse` — `parse()` throws on a truncated/refused answer before `usage` can be read, and fallbacks need the beta namespace; (2) the SDK's zod helpers import `zod/v4`, so `ir.ts` now imports `zod/v4` (zod 3.25 ships it; same schema API); the SDK moves `enum`/`const` into descriptions and the client-side zod parse enforces them; (3) non-streaming with an explicit 4-minute timeout (the job's deadline), `max_tokens` 32 000 to bound the worst-case cost; (4) no `REAL_CONVERSION_AVAILABLE` flag left: an API key now enables the feature; (5) a failed answer (`ai-refused`/`ai-invalid`) carries its cost on `ImportError.spent` and the job records it (data-model `costUsd`); (6) tiles carry `width`/`top` for their labels; (7) cost uses `usage.iterations` when present (each fallback attempt at its own model's rate), cache writes 1.25×/2× by TTL, unknown model at the highest known rate per token kind*
- [X] T039 [P] [US1] Budget module `apps/cms/src/lib/import/budget.ts`: `monthBounds(now)` in Europe/Paris, `spentEur(payload)`, `userSpentEur(payload, userId)`, `userBudgetEur(user, settings)`, `featureEnabled(settings)` (key or fixture mode, and global cap > 0), and `budgetStatus(payload, user)` → `{ workspace, user, enabled, available, blockedBy, resetsAt }` exactly as contracts/import-api.md
- [X] T040 [US1] Device check `apps/cms/src/lib/import/device-check.ts` (research R16): `page.setContent(html + <style>css</style>)` with image requests fulfilled by same-size placeholders (Media width/height), measure at 1440 / 770 / 568 / 320 px: document wider than viewport (`horizontal-scroll`), visible text with computed `font-size` < 14px (`small-text`), CTA buttons and standalone links < 44px in either dimension (`small-target`), elements whose right edge exceeds the viewport (`overflow`); returns `report.deviceChecks` — *done; CTA library block padding raised to 14px 28px (46px tall) so a clean page passes the 44px target check*
- [X] T041 [US1] Payload task `apps/cms/src/jobs/pageImport.ts` (slug `page-import`, queue `imports`): steps render → convert → (images: US2) → build → check (device check, T040) → save, updating `step`/`progress`, checking `cancelRequested` and a 4-minute deadline between steps, saving `costUsd`/`costEur`/`aiModel` as soon as the AI step returns, creating the draft page with `payload.create({ collection: "pages", user: importer, overrideAccess: false })` (title, pageType, domain, path, language, builder from the serializer, `importedFrom`), then `completed` + `page` + `report`; on any failure: `failed` + `errorCode` + French `errorMessage` (contracts/import-api.md), errors to the `afterError` sink with the import id only; the job never reads budgets and never stops for budget reasons (FR-027c), and always records the full cost
- [X] T042 [US1] Register the task and an `autoRun` entry for queue `imports` (every minute, safety net) plus a sweep marking `running` imports older than 5 min as `failed`/`timeout`, in `apps/cms/src/payload.config.ts`
- [X] T043 [US1] `POST /api/page-imports/start` in `apps/cms/src/endpoints/pageImportStart.ts`: staff check, input validation, `assertPublicHttpUrl`, `budgetStatus(payload, user)` (409 `user-budget-exhausted` or `budget-exhausted`, user checked first), create doc (`queued`, `startedAt`, `createdBy`), `payload.jobs.queue` + non-awaited `payload.jobs.runByID`, 202 `{id, status}`; register in `payload.config.ts` (409 `feature-disabled` first when `enabled` is false)
- [X] T044 [P] [US1] `POST /api/page-imports/:id/cancel` in `apps/cms/src/endpoints/pageImportCancel.ts` (creator or admin, idempotent, 409 when terminal); register in `payload.config.ts`
- [X] T045 [P] [US1] `GET /api/page-imports/budget` in `apps/cms/src/endpoints/pageImportBudget.ts`; register in `payload.config.ts` returning `enabled` (C1: the feature flag of Principle III)
- [X] T046 [US1] Wizard branch in `apps/cms/src/components/PageCreateWizard.tsx`: "Point de départ" choice Modèle (preselected default, existing flow unchanged) / "Importer depuis une page web" (opt-in) (option not rendered at all when the budget endpoint says `enabled: false`; when enabled but not `available`, shown disabled with an explanatory notice and the reset date), URL field, existing conflict check, POST start, progress view polling `GET /api/page-imports/:id?depth=0` every 2 s (step labels in French, progress bar, "Annuler" button), on `completed` → `router.push` to the new page's edit view, on `failed`/`cancelled` → plain message + "Réessayer" keeping the inputs; unavailable notice distinguishes the personal budget ("Votre budget mensuel d'import est épuisé…") from the workspace one; the import option shows the editor's remaining personal budget; the progress view states in French that the editor may leave the page and that the import continues, with a link to the imports list (leaving never calls cancel; no `beforeunload` cancel)
- [X] T047 [P] [US1] Import report panel `apps/cms/src/components/ImportReportPanel.client.tsx` on the page edit view (shown when `importedFrom` is set and not dismissed): reproduced / simplified / omitted / failed images / font substitutions / accessibility / screen formats (device checks, "source sans version mobile") / actions before publishing, "Masquer le rapport" → `PATCH /api/page-imports/:id {reportDismissed: true}`; register in `apps/cms/src/collections/Pages.ts`; explicit loading, empty (no report data) and error (import not readable) states (Principle V)
- [X] T048 [P] [US1] Budget banner `apps/cms/src/components/ImportBudgetBanner.tsx` (`beforeListTable` of `page-imports`, admins only): month total vs cap, reset date; plus a per-user table for the current month (user, spent, budget, default or own) with a link to each user record to adjust the budget (FR-027f); explicit loading, empty (no imports this month) and error states (Principle V)
- [X] T049 [US1] e2e fixture: static source page `apps/web/tests/e2e/fixtures/import-source/index.html` (hero, 3-column features, testimonial, CTA, a form, a video, an image without alt, and responsive CSS that shrinks the hero heading and hides a decorative image below 480px), a static-file service for it attached to the `browser` network (so the browser container can reach it) and started by the same compose files CI uses for the stack (`infra/docker-compose.yml` + `infra/docker-compose.override.yml`, e.g. under a `e2e` profile enabled in CI), matching canned IR `apps/cms/tests/fixtures/import-ir.fixture.json`; e2e env sets `IMPORT_AI_MODE=fixture` and `IMPORT_ALLOW_PRIVATE_HOSTS=true`; also serves the SSRF fixtures used by T032; add a CI step in the e2e job of `.github/workflows/ci.yml`, after the stack is up, running `npm run --workspace @trefle/cms test:browser` inside the `cms` container (so it reaches `ws://browser:3100/` and the fixture service)
- [X] T050 [US1] e2e `apps/web/tests/e2e/us-import.spec.ts`: wizard → import fixture → progress → editor on draft; texts editable; report visible then dismissed (persists on reload); publish after adding a lead-form block, published page shows all imported sections; internal address refused with the French message; switching the editor to Mobile portrait shows the smaller hero heading and the hidden decorative image, Desktop does not; the report lists device check results; leaving the wizard mid-import then opening the imports list shows the import completed with a link to its draft — *done; the admin is driven with `Authorization: JWT` on page loads and API calls: Chromium sends no Sec-Fetch-Site to `http://host.docker.internal`, so Payload ignores the cookie there (also the real cause of the quarantined us5-roles spec)*

**Checkpoint**: US1 works end to end in fixture mode; with a real key it imports real pages (images as placeholders, forms reported).

---

## Phase 4: User Story 2 - Images arrive in the Media library (Priority: P2)

**Goal**: Every visible image (content + section backgrounds) becomes an ordinary Media item used by the page.

**Independent Test**: Import a page with several images: each appears once in Media with the source alt (or "À décrire"), the page references only Media URLs, nothing points at the source site (quickstart §2 step 6).

### Tests for User Story 2

- [X] T051 [P] [US2] Image pipeline tests in `apps/cms/tests/import-images.test.ts`: large JPEG/PNG → WebP ≤ 500 KB; SVG rasterised; animated GIF → first frame; impossible to fit → placeholder + `too-large`; non-image content-type → `not-an-image`; > 15 MB or > 20 s → `unreachable`; same bytes twice → one Media; private redirect blocked by `guardedAgent` — *`importImages` takes an injected `fetchImage` and `timeoutMs`; the guard cases run against a local HTTP server (`guardedAgent` refusing `localhost`, `guardedFetch` refusing an IP literal and redirects to 127.0.0.1 / 169.254.169.254, a privately redirected image reported `unreachable`); also a `data:` image and cancel*
- [X] T052 [P] [US2] Job cleanup tests in `apps/cms/tests/import-job.test.ts` (extend): media created then failure at build/save or cancel → all created Media deleted, none left; success → `page-imports.media` lists them, each `importedBy` set — *cleanup deletes by `media.importedBy = import id` rather than an in-memory list, so the stale-import sweep also removes Media left by a lost process; tests cover a failure at check, at save and a cancel after the images step*

### Implementation for User Story 2

- [X] T053 [US2] `apps/cms/src/lib/import/images.ts` (research R8): choose the largest candidate, guarded fetch (15 MB / 20 s / `image/*`), SHA-256 dedupe, `sharp` normalise (rasterise SVG/animated, strip EXIF, ≤ 2400 px, WebP quality 82→50, halve width once), `payload.create({ collection: "media", file, data: { alt, altPending, importedBy }, user: importer })`, concurrency 4, cancel-aware; returns `ref → media URL` + failures — *also: one download per distinct address and one Media per distinct content (SHA-256 of the downloaded bytes); `data:` images decoded without a request; SVG rasterised at twice its displayed width; any refused hop (`private-address`) is reported `unreachable`. `guardedAgent()` (undici `Agent`, `connect.lookup` check) and `guardedFetch()` (redirects followed by hand, each hop's host checked — IP literals never reach a lookup) live in `url-guard.ts`; `undici` 7.29.1 is now a direct dependency (same version Payload already installs)*
- [X] T054 [US2] Add the `images` step to `apps/cms/src/jobs/pageImport.ts` between convert and build (only refs the IR actually placed), pass Media URLs to `serializeImport`, record created Media on the import, delete them on `failed`/`cancelled` — *the refs come from `placedImageRefs(ir, extract)` (serializer package); the importer is loaded before the images step; progress 45 %*
- [X] T055 [US2] Serializer support for real images in `packages/grapesjs-page-import/src/serialize.ts`: Image block `src`/`alt` from Media (`alt=""` when pending), Section `background-image:url(<media URL>)`, failed background → background dropped + colour kept; `report.failedImages`, `actionsBeforePublish` "Décrire N images"; extend `packages/grapesjs-page-import/tests/serialize.test.ts` — *`media` entries carry `altPending` (page `alt=""`); action « Décrire N images marquées « À décrire » dans la médiathèque » counted per Media item; `failedImages` passed in by the job*
- [X] T056 [P] [US2] Show `altPending` ("À décrire") as a column and filter in the Media list in `apps/cms/src/collections/Media.ts` — *`defaultColumns` shows « À décrire »; filtering uses Payload's own list filter on that field (no custom component)*

**Checkpoint**: Imported pages carry their real images; failed/cancelled imports leave no Media behind.

---

## Phase 5: User Story 3 - Section and Columns blocks in the library (Priority: P2)

**Goal**: Editors can build side-by-side layouts by hand; the lead form works anywhere.

**Independent Test**: Without any import, build Section › Columns(3) › Image + Text + CTA per column, publish, check side by side at desktop and stacked at 360 px; put the lead-form block inside a column of a subscription page and publish (quickstart §2 steps 3–5).

### Tests for User Story 3

- [X] T057 [P] [US3] Renderer tests in `apps/web/tests/render-nested-form.test.tsx`: lead form rendered when nested in Section › Columns › Column, keeps its placeholder `id`/`class`/`style`; top-level form unchanged; no form → `hasForm` false; wrapper background still applied to `.trefle-page-shell`; existing render tests unchanged
- [X] T058 [P] [US3] Plugin tests in `packages/grapesjs-page-import/tests/plugin.test.ts` (jsdom editor): both blocks listed; Columns trait 2→3 adds an empty column, 3→2 appends the removed column's blocks to the last remaining column; dropping a Columns block into a Column is refused; any library block accepted inside Section/Column

### Implementation for User Story 3

- [X] T059 [US3] Add the "Section" and "Colonnes" blocks, the "Colonnes" (2/3/4) trait with content-preserving reduction and the "no Columns inside a Column" drop rule to `packages/grapesjs-page-import/src/plugin.ts` (verify APIs with `gjs-api.sh`)
- [X] T060 [US3] Replace the string split with a parsed tree in `apps/web/src/lib/render.ts`: `renderPage(html, renderForm)` using `html-react-parser` on the sanitised HTML, replacing the single `[data-block="lead-form"]` node by `renderForm({id, className, style})`, keeping wrapper extraction for the page background, `hasLeadForm(html)`; remove `splitAroundForm`/`wrapsWholeString` once unused
- [X] T061 [US3] Use it in `apps/web/src/components/page-shell.tsx`, `apps/web/src/app/[[...slug]]/page.tsx` and `apps/web/src/app/ab-variant/[pageId]/page.tsx` (read `node_modules/next/dist/docs/` for any Next API touched); `rewriteImageTags` applied to the parsed output or before parsing
- [X] T062 [US3] e2e `apps/web/tests/e2e/us-layout-blocks.spec.ts`: hand-built Section › Columns page publishes side by side at 1440 px and stacked at 360 px; subscription page with lead form inside a column submits a lead successfully (also without JavaScript); axe has no serious/critical violations

**Checkpoint**: Layout blocks usable by hand; lead form placement unrestricted; published site behaviour unchanged for existing pages.

---

## Phase 6: User Story 4 - Source form becomes the page's lead form (Priority: P3)

**Goal**: On subscription pages the source form becomes the lead-form block at its position, with the page's form settings pre-filled, using only the existing form tools (FR-016a).

**Independent Test**: Import, as a subscription page, a source with a form (email, name, phone): one lead-form block where the form was (even inside a column), form fields listed in the page's form settings; publishing works once the remaining settings are completed (quickstart §2 step 5).

**Depends on**: US3 (T060–T061) for forms placed inside columns.

### Tests for User Story 4

- [X] T063 [P] [US4] Serializer form tests in `packages/grapesjs-page-import/tests/serialize-forms.test.ts`: subscription + one form → exactly one lead-form placeholder identical to `GJS_BLOCKS` lead-form (`id="form"`, `droppable: false`); several forms → the first with an email field kept, others `extra-form`; free/confirmation → none, reported; no form on subscription → action "Ajouter un bloc Formulaire" — *also: a form the conversion didn't place is reported and the block is asked for; free/confirmation omissions say why (« une page libre ne peut pas porter de formulaire »); `prominentForm` tested on its own*
- [X] T064 [P] [US4] Form mapping tests in `apps/cms/tests/import-form-mapping.test.ts`: source input types → `email|text|textarea|select|checkbox|tel|radio|number|date`; `select`/`radio` options copied; unsupported (file, password, hidden) → `formFieldsUnmapped`; exactly one email field kept; Settings defaults (`defaultConsentPurposeText`, `defaultPrivacyNoticeUrl`, `defaultPrivacyNoticeVersion`) prefilled, missing ones listed in `actionsBeforePublish` — *also: radio buttons sharing a name → one `radio` field (label = fieldset legend); a source consent checkbox is dropped and reported under « Simplifié » (the page renders its own consent control); several checkboxes sharing a name, `time` etc. → unmapped; names made safe, unique and never `consent`/`pageId`/`formToken`/`hp_check`; submit label from the source button; « Rédiger le message affiché après l'envoi » is always listed (the source can't provide it)*

### Implementation for User Story 4

- [X] T065 [US4] Enable lead-form leaves in `packages/grapesjs-page-import/src/serialize.ts` per page type (contracts/import-ir.md "Lead form"), using the lead-form definition passed in from `apps/cms/src/fields/grapesjs/blocks.ts` — *the prominent form is chosen among the forms the IR places (first with an email field, else first); every other source form is reported (`extra-form`); `SerializeResult.leadForm` names the kept form; the block is the `lead-form` definition from `GJS_BLOCKS` (id `form`, `droppable`/`editable` false, its style as the `#form` rule)*
- [X] T066 [US4] `apps/cms/src/lib/import/form-mapping.ts`: extract form → `pages.form.fields` rows (name, label, type, required, options) + Settings defaults; call it from `apps/cms/src/jobs/pageImport.ts` when creating the page (subscription only) — *mapping runs after build, before the device check; when the conversion placed no lead form, the fields are still pre-filled from `prominentForm(extract.forms)` so adding the block is enough. The extract now also records each form's submit label, the fieldset legend of radios/checkboxes, and leaves out `<select>` placeholder choices (empty value); report panel gains « Champs du formulaire source non repris »*
- [X] T067 [US4] Extend the e2e fixture flow in `apps/web/tests/e2e/us-import.spec.ts`: imported subscription page has the lead form inside its column, form fields pre-filled; after completing success message, publishing succeeds and a lead can be submitted — *the fixture's form now sits in the right-hand column of its section, with a select (placeholder + 2 choices) and a consent checkbox; the e2e checks the lead form in its column, the pre-filled fields, publishes after writing only the success message, and signs a visitor up through it*

**Checkpoint**: All four stories work independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T068 [P] Update `infra/deploy/README.md` and `infra/deploy/README.fr.md`: `browser` service, `ANTHROPIC_API_KEY` and import variables, disabling imports (cap 0 / empty key), memory note for KVM 2 — *new « Step 6 / Étape 6 » in both files (the French README has no Step 5); variables table, §3.1 (`browser` without ports, test-only switches refused, every import address public). The committed `infra/.env` carries no import key, so releases never ask for one; the key is added on the VPS copy when imports are wanted. The memory note gives the 1 GB cap and a `docker stats` check rather than an unmeasured figure*
- [X] T069 [P] Check `infra/deploy/preflight.sh` knows the new required/optional variables — *all import variables are optional; preflight fails on `IMPORT_AI_MODE` or `IMPORT_ALLOW_PRIVATE_HOSTS` set, an unknown `IMPORT_AI_EFFORT`, or an `ANTHROPIC_API_KEY` not starting with `sk-ant-`; checked against good/bad env files under bash 3.2*
- [X] T070 Choose the 10 reference URLs and record them in `specs/012-url-page-import/quickstart.md` appendix; run quickstart §4 with the real model, record duration / verdict / touch-up minutes / cost per page; tune the system prompt or `IMPORT_AI_EFFORT` in `apps/cms/src/lib/import/convert.ts` until SC-001, SC-002 (desktop and 390 px), SC-006 and SC-009 are met — *done 2026-09-28 on the 7 reference pages that allow the importer (2 runs, ≈ €8 in total, reviewer verdict: accepted — quickstart « Evaluation log »). The run found and fixed: output grammar too large (wire format), banner photo lost, columns wrapping 3 + 1, text links held to the button target size, footer left out, card photos, whole-link titles, Media filename race, out-of-list values (repairWire). mariages.net, parisjetaime.com and eurofil/leroymerlin refuse the importer (anti-bot) and are evaluated through 013. Tooling: apps/cms/scripts/import-eval/ + skill trefle-import-eval*
- [X] T071 Run `/security-review` on the branch (focus: URL guard, browser isolation, endpoint access, prompt-injection from page content into the IR — output is schema-bound and refs-only) and fix findings — *no finding at or above the confidence threshold. The one gap it noted was then closed: the browser's requests are now performed by the CMS through `guardedRequest`/`guardedAgent` (the address checked is the one connected to), and redirects never reach the browser — while doing so it turned out Chromium doesn't route the target of a redirect handed back to it, so sub-resource redirects are followed by the CMS and a page redirect is re-navigated by `renderSource` (research R4; unit test for rebinding, test:browser for redirected pages and sub-resources)*
- [X] T072 Run the full quickstart (§1–§3) and record the manual verification steps for the PR bodies (Principle IV) — *§1–§2 done 2026-09-27 (quickstart « Verification log »; found and fixed the Columns 3 → 2 settings-panel bug); §3 (budget, real key) is run together with T070* — *§1–§2 done 2026-09-27/28 (quickstart « Verification log », 20/20); §3 (budget with a real key) moved to production with 013 T024 — the dev key has been revoked*
- [X] T073 Constitution check in each PR body: Principle II dependency table from plan.md, assumed package structure (Complexity Tracking), no temporary exceptions — *one PR for 012 + 013 (decided 2026-09-28, deviation from the several PRs planned); its body carries the dependency table, the assumed package structure and « no temporary exceptions »*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup, blocks every story.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1's job (T041) and serializer (T034) exist.
- **US3 (Phase 5)**: after Foundational only, can run in parallel with US1/US2.
- **US4 (Phase 6)**: after US1 and US3 (T060–T061).
- **Polish (Phase 7)**: after the stories being shipped.

### Within each story

- Schema/types before services; services before the job; job before endpoints; endpoints before UI; e2e last.
- Tests can be written first (encouraged for the URL guard, budget and serializer) or alongside.

### Delivery slices (plan.md) mapped to tasks

1. Layout blocks: Phase 1 (T001, T002, T007), T008–T013, T023, Phase 5.
2. Import pipeline, fixture mode: rest of Phase 1–2 + Phase 3 except the real-model evaluation (wizard option hidden in prod while `ANTHROPIC_API_KEY` is empty).
3. Real conversion + budget: T038 real mode, T039, T045, T048, T070.
4. Images: Phase 4.
5. Forms: Phase 6.

---

## Parallel Examples

**Phase 2**: T008, T009, T010, T011, T015, T016, T017, T018, T022, T023 touch different files and can run together; T012 → T013 and T014 → T019 are sequential.

**US1**: tests T024–T031 in parallel (T031 runs only via `test:browser`); T032 after T049; then T033, T035, T036, T039, T040 in parallel; T034 after T033; T037 after T036; T038 after T033; T041 after T034/T037/T038/T039/T040; T043–T045 after T041 (T044, T045 parallel); T046 after T043/T045; T047, T048 parallel; T049 → T050.

**US3** can be built by a second session in parallel with US1: T057, T058 in parallel; T059 and T060 in parallel; T061 after T060; T062 last.

---

## Implementation Strategy

### MVP first (US1)

1. Phase 1 + Phase 2.
2. Phase 3 in fixture mode, then with a real key on 2–3 pages.
3. **Stop and validate** with quickstart §2 (fixture) and §3 (budget).

### Incremental delivery

Ship slice 1 (Section/Columns + nested form) first: it's useful on its own and de-risks the one change to the live renderer. Then US1 → US2 → US4, each deployable with `release.sh`, the import option hidden in production until slice 3 has passed the reference-set evaluation.
