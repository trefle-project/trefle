# Research: Import a page from a saved file (013)

Everything after "the page is displayed in the browser container" is the 012
import (specs/012-url-page-import/research.md R2–R16). Only the differences
are decided here.

## S1. Getting the file to the import

**Decision**: The existing `POST /api/page-imports/start` also accepts
`multipart/form-data` with the wizard fields in `_payload` (Payload's own
convention) and the file in `file`, parsed with Payload's
`addDataAndFileToRequest`. The endpoint checks `Content-Length` (> 25 MB →
413 before reading), then the file name extension and its first bytes
(FR-002), then does exactly what an address start does (budget, record,
queue). The file is written to the cms container's temporary directory as
`<tmpdir>/trefle-page-imports/<importId>` (mode 600) and deleted by the job
in `finally`, and by the stale-import sweep for a lost process (FR-009).

**Rationale**: One start endpoint, one validation/budget/queue path (no
second endpoint copying it). The job runs in the same cms process
(`JOBS_AUTORUN`, `runByID` right after start), so a local temporary file is
the simplest store that is never durable; no bucket, no database blob.

**Alternatives considered**:
- *Store the file in the object store / as a Media item*: durable by nature,
  contradicts FR-009, needs its own cleanup and access rules.
- *Store it in a `page-imports` column*: 25 MB rows, backups carry them.
- *Separate `/start-file` endpoint*: duplicates validation and budget logic.

## S2. Displaying the file without contacting the site

**Decision**: Same guarded browser context as 012, with three changes for a
file import: the main document request is fulfilled from the file with a
`Content-Security-Policy` (`script-src 'none'; worker-src 'none';
object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'`)
so none of the page's scripts, workers, plugins or frames run, and the main
frame is locked to that address (any other navigation, e.g. a
`<meta http-equiv="refresh">`, is cancelled with ERR_ABORTED, which leaves
the page in place). *(First version: `javaScriptEnabled: false` — it also
breaks the import's own extraction, whose TreeWalker callbacks the page then
refuses to run, and doesn't stop meta refresh. Found by test:browser,
2026-09-28.)* The page is navigated to its declared original
address (S3) when there is one, else to a synthetic `https://saved-page.invalid/`
address; the route handler answers that one request from the file and routes
every other request as in 012 (performed by the CMS through the guard, S5).

Checked in the stack's browser container (2026-09-27): with JavaScript
disabled the saved page's inline script does not run, Playwright's
`page.evaluate` (the extract) still works, `page.url()` is the original
address, and relative resources resolve against it and reach the route
handler.

**Rationale**: Navigating to the real address keeps relative links, the base
URL for resources and `finalUrl` right with no HTML rewriting; fulfilling
only that request guarantees the page itself never comes from the site
(FR-005). Disabling JavaScript satisfies FR-004 at the browser level instead
of sanitising HTML ourselves; a saved page is already the rendered DOM.

**Alternatives considered**:
- *`page.setContent`*: base URL `about:blank`, relative resources lost;
  a `<base>` injection would mean editing the untrusted HTML.
- *Load the file with `file://` in the browser container*: the file would
  have to be copied into another container; `file://` pages can read other
  local files.
- *Keep JavaScript and rely on the guard only*: scripts could rewrite the
  page, loop, or try other schemes; nothing needs them.

## S3. The page's original address

**Decision**: Read it from the file, first match wins:
1. MHTML: `Snapshot-Content-Location` header, else the first HTML part's
   `Content-Location`;
2. SingleFile: the `url:` line of its `<!-- Page saved with SingleFile … -->`
   comment;
3. Chrome/Edge "HTML only": the `<!-- saved from url=(NNNN)… -->` mark.

Kept only if it is an `http:`/`https:` URL whose host passes
`assertPublicHttpUrl` (no credentials, public addresses) — otherwise ignored
and the report shows the file name (FR-008).

**Rationale**: These are the markers the supported save methods write; a
forged or internal value is harmless because it is only used as the page's
address inside the isolated context and every request still goes through the
guard, but an internal one is not worth showing either.

## S4. Resources inside the file (embedded images)

**Decision**:
- **SingleFile HTML** inlines resources as `data:` URLs: styles and fonts
  just work. For images, the extract (`extract.browser.ts`) now accepts
  `data:image/…` candidates, but replaces each by a short token
  (`embedded:<n>`) in the extract and hands the bytes back separately
  (`RenderResult.embedded`), so the extract sent to Claude stays small.
  The images step resolves `embedded:<n>` from that map (its existing `data:`
  path already decodes and normalises).
- **MHTML**: parsed server-side into parts (Content-Location, Content-Type,
  base64 / quoted-printable / binary). The main HTML part fulfils the
  document; the route handler fulfils any request whose URL matches a part's
  Content-Location from the part (never the network); the images step looks
  a candidate up in the same map before downloading. Chrome's MHTML refers
  to some parts by `cid:` (its stylesheet: `<link href="cid:css-…">`), and
  `cid:` URLs never reach Playwright's route handler: the parser rewrites
  every `cid:<id>` reference in the HTML and CSS parts to
  `<page origin>/__trefle-saved/cid/<id>` and serves those from the file
  too (found building the test material, 2026-09-28).
- Parser: ~80 lines in `apps/cms/src/lib/import/saved-file.ts` (MIME
  multipart with those three encodings), unit-tested on real Chrome/Edge
  saves. No dependency.

**Rationale**: FR-007 (embedded images come from the file) without sending
megabytes of base64 to the model; MHTML is what Chrome/Edge save natively, so
supporting it avoids asking editors to install an extension.

**Alternatives considered**:
- *Keep `data:` URLs in the extract*: a SingleFile page is often 5–20 MB of
  base64 — prohibitive in tokens and cost.
- *An MHTML package (`mhtml2html`)*: pulls jsdom, a large dependency for a
  simple MIME split.
- *Let Chromium open MHTML itself*: Chromium renders MHTML only from
  `file://`, not from a network response.

## S5. Requests the saved page still makes

**Decision**: Unchanged from 012 (research R4 as amended by T071): every
request is performed by the CMS through `guardedRequest`/`guardedAgent`,
redirects never reach the browser. For a file import, requests answered from
the file (S2, S4) never leave the CMS. Requests to the original site are
allowed (they may fail if it blocks us — then the page renders without that
resource and the report says so for images).

**Rationale**: FR-004/FR-005 with no new guard code.

## S6. Wizard flow

**Decision**: In `PageCreateWizard.tsx`, the import step keeps the address
field. Under it, a discreet link « Vous avez déjà la page enregistrée ? »
swaps it for a file input (accept `.html,.htm,.mhtml,.mht`). When an address
import fails with `blocked` or `login-required`, the error panel shows the
French "how to save the page" help and a button « Importer la page
enregistrée » that switches to the file input with every other field kept.
Size and extension are checked in the browser too (instant message), and
again on the server.

## S7. Record and report

**Decision**: `page-imports` gains `sourceKind` (`url` | `file`, default
`url`) and `sourceFileName`; `sourceUrl` becomes optional (the declared
original address for a file import, empty when none). The report's
« Page importée depuis » shows the address, or « fichier <nom> » (FR-008).
Migration: add the two columns, drop `NOT NULL` on `source_url`; down path
restores it after setting empty values to `''`.
