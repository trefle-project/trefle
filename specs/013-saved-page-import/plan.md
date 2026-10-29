# Implementation Plan: Import a page from a saved file

**Branch**: `012-url-page-import` (013 ships with 012) | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-saved-page-import/spec.md`

## Summary

When a site refuses the importer (`blocked`) or needs a login
(`login-required`), the editor saves the page from their own browser (single
HTML file or MHTML) and imports the file. The file reaches the existing start
endpoint as multipart, is kept in the cms container's temp directory only
while the import runs, and is displayed in the same guarded browser context
as an address import — with JavaScript disabled and the main document
answered from the file under the page's original address. Embedded images
come from the file. Everything after rendering is the 012 pipeline unchanged.
See [research.md](research.md) S1–S7.

## Technical Context

**Language/Version**: TypeScript 5, Node 24 (as 012)

**Primary Dependencies**: Payload 3.88 (endpoint, multipart via
`addDataAndFileToRequest`, collection + migration), playwright-core 1.63
(guarded context from 012), sharp (images step from 012). No new dependency.

**Storage**: PostgreSQL — two new columns on `page_imports`, `source_url`
nullable. Temp file in the cms container's `os.tmpdir()`, deleted when the
import ends. Nothing in the object store.

**Testing**: Vitest (cms unit: MHTML/HTML parsing, original-address
detection, start endpoint multipart validation, job cleanup, images from the
embedded map); `test:browser` in the cms container (file render: scripts not
run, internal requests refused, embedded images extracted); Playwright e2e
(wizard: blocked fallback, discreet link, file import to draft).

**Target Platform**: Same stack as 012 (Docker Compose, Hostinger KVM 2).

**Project Type**: Web application (monorepo: apps/cms, apps/web,
packages/grapesjs-page-import).

**Performance Goals**: A file import takes no longer than an address import
of the same page (012 SC-001: < 2 min).

**Constraints**: 25 MB per file; scripts never run; no durable copy of the
file; every network request through the 012 guard.

**Scale/Scope**: Same as 012 (a few imports a day). One wizard change, one
endpoint branch, one parser module, render/extract/images adjustments.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| **I. Simplicity First** | Reuses the 012 endpoint, job, guard, serializer and report; the only new module is the saved-file parser. No second endpoint, no new storage. | ✅ |
| **II. Stack-Native, Minimal Additions** | Payload's own multipart parsing; Playwright's route fulfil and `javaScriptEnabled`; MHTML parsed in ~80 lines instead of a jsdom-based package. No new dependency. | ✅ |
| **III. Small, Reversible Changes** | One migration (add 2 columns, relax `NOT NULL`) with a tested down path. The fallback is reachable only from the import flow, which stays hidden in production until 012's T070. | ✅ |
| **IV. Working Software Over Ceremony** | Tests for the parser, address detection, endpoint validation, cleanup, and crafted hostile files (FR-004, SC-004); e2e for the wizard flows. | ✅ |
| **V. Quality the User Feels** | Clear French messages for wrong type / too large / how to save; loading and error states in the wizard's file step; fields kept on fallback. | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/013-saved-page-import/
├── plan.md              # This file
├── research.md          # S1–S7
├── data-model.md        # page-imports changes
├── quickstart.md        # Validation guide
├── contracts/
│   └── start-file.md    # multipart variant of POST /api/page-imports/start
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/cms/src/
├── lib/import/
│   ├── saved-file.ts          # NEW: detect format, parse MHTML, original address, resource map
│   ├── render.ts              # renderSavedFile(): JS off, main document + parts from the file
│   ├── extract.browser.ts     # data:image candidates → embedded:<n> tokens
│   └── images.ts              # resolve embedded:<n> / MHTML parts before downloading
├── endpoints/pageImportStart.ts   # multipart branch, size/type checks, temp file
├── jobs/pageImport.ts             # render from file when sourceKind=file; delete temp file (job + sweep)
├── collections/PageImports.ts     # sourceKind, sourceFileName; sourceUrl optional
├── components/PageCreateWizard.tsx      # discreet link, file input, blocked/login fallback
├── components/ImportReportPanel.client.tsx  # « fichier <nom> » when no original address
└── migrations/<timestamp>_page_imports_file_source.ts (+ .json, index.ts)

apps/cms/tests/
├── import-saved-file.test.ts        # NEW: parsing, detection, hostile files
├── import-endpoints.test.ts         # multipart cases
├── import-job.test.ts               # file source, temp file removed on every ending
└── browser/import-render-file.test.ts  # NEW (test:browser)

apps/web/tests/e2e/
├── fixtures/import-source/saved/    # NEW: a SingleFile HTML and an MHTML of the fixture page
└── us-import.spec.ts                # file import flows
```

**Structure Decision**: Everything lives in the 012 modules it extends; the
one new source file is the saved-file parser, kept apart because it is pure
and heavily unit-tested.

## Complexity Tracking

No violations.
