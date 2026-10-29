---

description: "Task list for 013-saved-page-import"
---

# Tasks: Import a page from a saved file

**Input**: Design documents from `/specs/013-saved-page-import/`

**Prerequisites**: plan.md, spec.md, research.md (S1–S7), data-model.md, contracts/start-file.md, quickstart.md

**Tests**: Included. The constitution (Principle IV) makes automated tests
mandatory for data transformations (the saved-file parser), custom
endpoints, access rules and job logic; spec SC-004 asks for crafted hostile
files.

**Organization**: by user story. 013 reuses the 012 pipeline end to end
(spec FR-006); every task below is a difference from an address import.
Paths are relative to the repo root. Branch: `012-url-page-import` (013
ships with 012).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 import after a `blocked` refusal (P1), US2 login-only pages and the discreet link (P2)

---

## Phase 1: Setup (test material)

- [X] T001 [P] Create the saved copies of the e2e fixture page in `apps/web/tests/e2e/fixtures/import-source/saved/`: `fixture.mhtml` produced by Chromium itself (a small script `apps/cms/scripts/import-eval/save-mhtml.ts`, run in the cms container, that opens `http://import-fixture/index.html` in the stack's browser and writes the CDP `Page.captureSnapshot({ format: "mhtml" })` result; the file carries `Snapshot-Content-Location: http://import-fixture/index.html`), and `fixture.singlefile.html`, a hand-built SingleFile-style save of the same page (images and background inlined as `data:` URLs, the `<!-- Page saved with SingleFile … url: http://import-fixture/index.html … -->` comment). Both must keep the page's text units in the same order as the live page so the canned IR (`apps/cms/tests/fixtures/import-ir.fixture.json`) applies. — *`fixture.mhtml` from `apps/cms/scripts/import-eval/save-mhtml.ts` (CDP snapshot in the stack's browser). Found: Chrome's MHTML references its stylesheet as `cid:…` from the HTML — `cid:` URLs never reach Playwright's route handler, so the parser rewrites `cid:` references to a synthetic same-origin address served from the file (research S4 amended); `fixture.singlefile.html` built from index.html with the three images inlined as data: URLs*
- [X] T002 [P] Create the hostile fixture `apps/web/tests/e2e/fixtures/import-source/saved/hostile.html` (spec SC-004): an inline `<script>` that rewrites the body and calls `fetch("http://169.254.169.254/latest/meta-data/")`, `<img src="http://cms:3000/logo.png">`, `<link rel="stylesheet" href="http://cms:3000/x.css">`, an `<iframe src="http://cms:3000/">`, a `<meta http-equiv="refresh" content="0;url=http://cms:3000/">`, a declared original address `<!-- saved from url=(0022)http://cms:3000/admin -->`, and one visible heading and paragraph.

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T003 Change `apps/cms/src/collections/PageImports.ts` (data-model.md): add `sourceKind` — select `url` | `file`, "default `url`, required, system-only", label « Source » (options « Adresse » / « Fichier enregistré »), list column; add `sourceFileName` — "text, optional, system-only. The uploaded file's name (sanitised, ≤ 200 chars). Set only when `sourceKind = file`"; make `sourceUrl` optional (`required: true` → removed); switch `admin.useAsTitle` from `sourceUrl` to `title` so file imports without an address still have a title in the list.
- [X] T004 Create the migration `apps/cms/src/migrations/<timestamp>_page_imports_file_source.ts` (+ `.json`, entry in `index.ts`) with `npm run cms -- payload migrate:create`: add `source_kind` (enum, default `'url'`, backfills existing rows), `source_file_name` (varchar), drop `NOT NULL` on `source_url`; down: `source_url = ''` where null, restore `NOT NULL`, drop the two columns and the enum. Regenerate `apps/cms/src/payload-types.ts`. Test up → down → up against the dev database, like 012's migration. — *`20260928_075516_page_imports_file_source`; tested up → down (with a file-import row whose `source_url` is null) → up*
- [X] T005 [P] Tests for the parser in `apps/cms/tests/import-saved-file.test.ts`: detect format by extension + sniff (HTML after optional BOM / whitespace / comments; MHTML = MIME multipart with a `text/html` part); MHTML parts with `base64`, `quoted-printable` (soft line breaks, `=3D`) and `binary`/`8bit`; resource map keyed by `Content-Location`; `cid:` parts ignored; original address from `Snapshot-Content-Location`, else the first HTML part's `Content-Location`, else the SingleFile `url:` comment, else `saved from url=(NNNN)…`; an internal / non-http / credentialed declared address is dropped (fake resolver); a PDF renamed `.html`, a ZIP, an empty file and an MHTML without an HTML part are refused; `T001`'s `fixture.mhtml` parses into its HTML + the fixture's image parts.
- [X] T006 Implement `apps/cms/src/lib/import/saved-file.ts` (research S3, S4): `readSavedFile(bytes: Buffer, fileName: string): Promise<SavedFile | "unsupported">` → `{ kind: "html" | "mhtml", html: string, resources: Map<string, { contentType: string; data: Buffer }>, originalUrl: string | null }`; MIME split and decoding in-house (no dependency, ~80 lines); `originalUrl` kept only if `assertPublicHttpUrl` accepts it (`apps/cms/src/lib/import/url-guard.ts`). — *also exports `SAVED_FILES_DIR` / `savedFilePath`; `cid:` references rewritten to `<origin>/__trefle-saved/cid/<id>` (research S4)*
- [X] T007 Embedded images in the extract (research S4) in `apps/cms/src/lib/import/extract.browser.ts`: accept `data:image/…` candidates for `<img>` and CSS backgrounds, but put a token `embedded:<n>` in `candidates` and collect the data URLs in a side list returned with the extract; in `apps/cms/src/lib/import/render.ts` add `embedded: Map<string, string>` (token → data URL) to `RenderResult` so the extract sent to Claude never carries base64.
- [X] T008 Render from a file in `apps/cms/src/lib/import/render.ts` (research S2): `renderSavedFile(browser, file: SavedFile, signal)` — `guardedContext` with `javaScriptEnabled: false`; navigate to `file.originalUrl ?? "https://saved-page.invalid/"`; the route handler answers that main document from `file.html` (never the network) and any request whose URL is a key of `file.resources` from the resource map; every other request goes through the existing guarded path unchanged; then the same scroll / overlay removal / extract / tiles / per-device steps as `renderSource` (factor the shared part, don't copy it). `finalUrl` is `file.originalUrl` or `""`. — *`guardedContext` gains `fromFile` and `javaScriptEnabled`; the shared post-navigation steps are `capture()`; address imports also get `embedded` (inlined images on live pages)*
- [X] T009 Images from the file in `apps/cms/src/lib/import/images.ts` (spec FR-007): before downloading a candidate, resolve `embedded:<n>` through `RenderResult.embedded` (then the existing `data:` path) and look an http(s) candidate up in the saved file's resource map (bytes from the file, content type from the part); only other candidates are fetched. Extend `apps/cms/tests/import-images.test.ts`: an embedded image and an MHTML part are stored without any fetch; a missing one becomes a failure. — *a failed embedded image is reported as « image intégrée au fichier enregistré »*
- [X] T010 Job support in `apps/cms/src/jobs/pageImport.ts`: when `sourceKind = file`, read `<os.tmpdir()>/trefle-page-imports/<importId>`, `readSavedFile`, then `renderSavedFile` instead of `renderSource` (an unreadable file fails as `not-html`); pass the resource map and `embedded` to the images step; delete the temp file in `finally` whatever the outcome (completed, failed, cancelled, timeout). In `sweepStaleImports`, delete the temp file of every import it fails, and remove any file in the temp directory whose import is terminal or missing (orphans). — *`removeOrphanSavedFiles` runs at the end of each sweep*
- [X] T011 [P] Tests in `apps/cms/tests/import-job.test.ts` (extend): a file import renders through `renderSavedFile` (fake), records `sourceKind`/`sourceFileName`, and its temp file is gone after completed / failed / cancelled / timeout; the sweep removes the file of a stale import and an orphan file.

**Checkpoint**: a `page-imports` document with `sourceKind = file` and a temp file runs end to end in tests.

---

## Phase 3: User Story 1 — Import a page the site refuses to serve (Priority: P1) 🎯 MVP

**Goal**: after `blocked`, the editor saves the page, drops the file, and gets the same draft and report as an address import.

**Independent Test**: import `fixture.mhtml` as a subscription page: the draft matches the address import of the fixture (same blocks, form in its column, images from the file), the report names `http://import-fixture/index.html`.

- [X] T012 [P] [US1] Endpoint tests in `apps/cms/tests/import-endpoints.test.ts` (extend) for the multipart variant (contracts/start-file.md): `Content-Length` over 25 MB + overhead → 413 `file-too-large` before the body is read; no file → 400 `missing-file`; `.pdf`, a PDF renamed `.html`, a ZIP → 400 `unsupported-file`; valid `.mhtml` / `.html` → 202, document created with `sourceKind: "file"`, `sourceFileName` (sanitised, ≤ 200 chars), `sourceUrl` = declared public address or empty, temp file written with mode 600; access and budget errors exactly as the JSON variant; the JSON variant unchanged.
- [X] T013 [US1] Implement the multipart branch of `POST /api/page-imports/start` in `apps/cms/src/endpoints/pageImportStart.ts`: `Content-Length` check first; `addDataAndFileToRequest(req)` (Payload) for `_payload` + `file`; same access / feature / fields / budget checks as the JSON path (one code path, not a copy); `readSavedFile` sniff; create the document, then write the temp file (`mkdir -p`, mode 600) before queueing; messages verbatim from contracts/start-file.md: « Ce fichier dépasse 25 Mo. Enregistrez la page sans ses vidéos, ou choisissez « Page web, un seul fichier ». », « Ce fichier n'est pas une page web enregistrée. Dans votre navigateur, utilisez « Enregistrer sous… › Page web, un seul fichier » (.mhtml), ou l'extension SingleFile (.html). », « Choisissez le fichier de la page enregistrée. ».
- [X] T014 [US1] Wizard fallback after `blocked` in `apps/cms/src/components/PageCreateWizard.tsx` (research S6, spec FR-010): when an address import ends `failed` with `errorCode: "blocked"`, show below the message the save help from contracts/start-file.md (« Vous pouvez importer la page depuis votre navigateur : ouvrez-la, puis « Fichier › Enregistrer sous… › Page web, un seul fichier » (Chrome, Edge), ou utilisez l'extension SingleFile (Firefox, Chrome). Déposez ensuite le fichier ici. ») and a button « Importer la page enregistrée » that swaps the address field for a file input (`accept=".html,.htm,.mhtml,.mht"`) keeping title, page type, domain, path and language; client-side size (25 MB) and extension checks with the same messages; submit as multipart; then the same progress / cancel / result flow as an address import; explicit loading and error states (Principle V). Other failure codes show no fallback.
- [X] T015 [P] [US1] Report and list: in `apps/cms/src/components/ImportReportPanel.client.tsx` show « Page importée depuis le fichier <sourceFileName> » when `report.finalUrl` is empty (fetch `sourceFileName` with the import), the address otherwise; `sourceKind` column in the imports list (T003).
- [X] T016 [P] [US1] Browser tests in `apps/cms/tests/browser/import-render-file.test.ts` (`test:browser`, spec SC-004): `fixture.mhtml` renders with `finalUrl` `http://import-fixture/index.html` and the fixture's text units, its images served from the file (import-fixture receives no request for them — count through a route spy or the nginx access log); `fixture.singlefile.html` yields `embedded:<n>` candidates and no base64 in the extract; `hostile.html`: its script does not run (body intact), the requests to `cms:3000` and `169.254.169.254` are refused, the declared `http://cms:3000/admin` address is not used (`finalUrl` empty), and the page still renders its heading. — *images-from-the-file is proven by rewriting the saved copy's host to an unresolvable one (any network request would fail) rather than counting nginx requests; the hostile file also carries a `meta refresh`, which is why the main frame is locked (research S2)*
- [X] T017 [US1] e2e in `apps/web/tests/e2e/us-import.spec.ts` (extend): address `http://import-fixture/blocked-waf` → « Le site a bloqué la visite automatique » with the save help → « Importer la page enregistrée » → fields still filled → upload `saved/fixture.mhtml` → draft opens with the lead form in its column, the report says « Page importée depuis http://import-fixture/index.html », 3 Media items for the import; uploading a PDF shows the unsupported-file message at once. Reuse `signIn` (Authorization: JWT header) and a per-test `X-Real-IP` as the other import specs. — *also a PDF refused client-side at once*

**Checkpoint**: US1 works on its own — a blocked page can be imported from a saved file.

---

## Phase 4: User Story 2 — Pages only the editor can see (Priority: P2)

**Goal**: the same fallback after `login-required`, and a discreet way in for editors who already have the file.

**Independent Test**: address `http://import-fixture/members` → the login message offers the file fallback; from the wizard's address step, « Vous avez déjà la page enregistrée ? » leads straight to the file input.

- [X] T018 [US2] In `apps/cms/src/components/PageCreateWizard.tsx`: offer the same fallback after `errorCode: "login-required"` (spec FR-010), and add under the address field a discreet link « Vous avez déjà la page enregistrée ? » (spec FR-001 (b)) that switches to the file input without a failed import first; a link back « Importer depuis une adresse » restores the address field.
- [X] T019 [US2] e2e in `apps/web/tests/e2e/us-import.spec.ts` (extend): `/members` → login message with the fallback; the discreet link → upload `saved/fixture.singlefile.html` → draft; the images come from the file (no request to import-fixture for them). — *the SingleFile save's inlined images become the 3 Media items*

**Checkpoint**: both entry points of spec FR-001 work; no other failure code offers the fallback.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T020 [P] Update the import sections of `infra/deploy/README.md` and `infra/deploy/README.fr.md` (Step 6 / Étape 6): sites behind anti-bot services can be imported from a page saved in the editor's browser; what the editor does; nothing to configure.
- [X] T021 [P] Update `.claude/skills/trefle-import-eval/SKILL.md` and `apps/cms/scripts/import-eval/run.ts` so an evaluation run can use saved files (`label=file:<path>` → multipart start), for the pages that refuse the importer. — *`label=file:<path>`; compare.ts shows the saved file as the source*
- [X] T022 Run `/security-review` on the 013 changes (focus: the upload endpoint, file parsing, rendering untrusted HTML with JavaScript off, the resource map never reaching the network, temp file lifecycle) and fix findings. — *2026-09-28, changes since 06c05cf: no finding at or above the confidence threshold (done without sub-agents, the Agent tool's permission check was failing); checked: temp-file paths and access, multipart, CSP + main-frame lock on untrusted HTML, fromFile never reaching the network, declared address validation, embedded images, wire CSS values, report panel rendering, logs*
- [X] T023 Run 013 quickstart §1–§2 and record the results in `specs/013-saved-page-import/quickstart.md` (verification log) for the PR body (Principle IV). — *2026-09-28, quickstart « Verification log »*
- [X] T024 ~~Evaluate the three pages that refuse the importer (mariages.net, parisjetaime.com, eurofil or leroymerlin) saved as single files by the user, with the real model (paid — ask first; skill `trefle-import-eval`); record in `specs/012-url-page-import/quickstart.md` « Evaluation log » against 013 SC-002. — *decided 2026-09-28: done by the user in production once 012 + 013 are deployed and the production key is set (the dev key has been revoked), through the wizard with pages saved in their browser; costs go to the production import budget; results recorded in the evaluation log afterwards*~~ — **cancelled 2026-10-11 by the user**: evaluation not run

---

## Dependencies & Execution Order

- **Phase 1** (T001, T002): no dependency, parallel.
- **Phase 2**: T003 → T004; T005 ∥ (T003/T004); T006 after T005; T007 → T008 (RenderResult shape); T009 after T006 + T007; T010 after T006 + T008 + T009 + T003; T011 after T010.
- **US1**: T012 ∥ T015 ∥ T016 (after Phase 2); T013 after T012 (and Phase 2); T014 after T013; T017 last.
- **US2**: after US1's T014 (same component). T018 → T019.
- **Polish**: T020, T021 any time after US1; T022–T024 after US2.

## Parallel Examples

- Phase 1: T001 ∥ T002.
- Phase 2: T005 (tests) ∥ T003 → T004.
- US1: T012 ∥ T015 ∥ T016 once Phase 2 is done.

## Implementation Strategy

### MVP first (US1)

1. Phase 1 + Phase 2 (parser, render from file, images from file, job, migration).
2. US1: endpoint + wizard fallback after `blocked` + report.
3. **Stop and validate**: import `fixture.mhtml` after a `blocked` refusal (quickstart §2 steps 1–3), `test:browser` hostile file.

### Incremental delivery

US2 adds the `login-required` fallback and the discreet link on the same
wizard; then Polish, with the paid evaluation of the three blocked reference
pages last. Everything ships with 012 on the same branch; in production the
import (both paths) stays hidden until `ANTHROPIC_API_KEY` is set on the VPS.
