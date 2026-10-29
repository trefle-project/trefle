# Data model: Import a page from a saved file (013)

Changes to the 012 model ([../012-url-page-import/data-model.md](../012-url-page-import/data-model.md)) only.

## Changed collection: `page-imports`

| Field | Change |
|---|---|
| `sourceKind` | **New** select `url` \| `file`, default `url`, required, system-only. Label « Source » (« Adresse » / « Fichier enregistré »). List column. |
| `sourceFileName` | **New** text, optional, system-only. The uploaded file's name (sanitised, ≤ 200 chars). Set only when `sourceKind = file`. |
| `sourceUrl` | `required: true` → optional. For `file`: the original address the file declares when it is a public http(s) address (research S3), else empty. For `url`: unchanged (required by the start endpoint). |

Validation (start endpoint): `sourceKind = url` ⇒ `sourceUrl` present;
`sourceKind = file` ⇒ `sourceFileName` present.

Migration `<timestamp>_page_imports_file_source`: add
`source_kind` (enum, default `'url'`, backfills existing rows),
`source_file_name` (varchar), drop `NOT NULL` on `source_url`. Down: set
`source_url = ''` where null, restore `NOT NULL`, drop the two columns and
the enum. Tested up → down → up like 012's migration.

## Transient: uploaded source file

Not a collection. Bytes written by the start endpoint to
`<os.tmpdir()>/trefle-page-imports/<importId>` (mode 600) after the record is
created; read by the job's render step; deleted by the job in `finally`
(completed, failed, cancelled, timeout) and by the stale-import sweep for
imports it fails. A file whose import no longer exists or is terminal is
also removed by the sweep (orphans from a crash between write and queue).

## Report

`report.finalUrl` is the declared original address, or empty for a file
without one; the report panel then shows « Page importée depuis le fichier
<sourceFileName> ». No other report change.

## State machine

Unchanged (queued → running → completed / failed / cancelled). A file import
can fail with the 012 codes plus none new: an unreadable file after upload
(corrupt MHTML, no HTML part) fails as `not-html`.
