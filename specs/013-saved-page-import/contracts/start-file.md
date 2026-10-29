# Contract: start an import from a saved file

Variant of `POST /api/page-imports/start`
([012 contract](../../012-url-page-import/contracts/import-api.md)). Same
endpoint, same access (active Admin/Editor), same budget checks and `202`
response; only the request body and the extra errors differ.

## Request

`Content-Type: multipart/form-data`

| Part | Content |
|---|---|
| `_payload` | JSON string: `{ "pageType", "title", "language", "domain"?, "path"? }` — as the JSON variant, **without** `url` |
| `file` | the saved page (`.html`, `.htm`, `.mhtml`, `.mht`), ≤ 25 MB |

A JSON body (no file) is the 012 address import, unchanged.

## Checks, in order

1. `Content-Length` > 25 MB + multipart overhead → **413** before the body is read.
2. Access, feature flag, wizard fields, budgets — exactly as the JSON variant.
3. File present, name extension in the list, size ≤ 25 MB.
4. Content sniff (first 64 KB): HTML (`<!doctype html` / `<html` after
   optional BOM, whitespace or comments) for `.html/.htm`; MIME multipart with
   a `text/html` part for `.mhtml/.mht`. Mismatch → `unsupported-file`.
5. Original address detected (research S3) and checked with the 012 guard;
   dropped silently if not public http(s).

## 202

```json
{ "id": 42, "status": "queued" }
```

## Errors (in addition to the JSON variant's)

| HTTP | `code` | When | Message (fr, shown as-is) |
|---|---|---|---|
| 413 | `file-too-large` | > 25 MB | « Ce fichier dépasse 25 Mo. Enregistrez la page sans ses vidéos, ou choisissez « Page web, un seul fichier ». » |
| 400 | `unsupported-file` | Wrong extension or content | « Ce fichier n'est pas une page web enregistrée. Dans votre navigateur, utilisez « Enregistrer sous… › Page web, un seul fichier » (.mhtml), ou l'extension SingleFile (.html). » |
| 400 | `missing-file` | No `file` part | « Choisissez le fichier de la page enregistrée. » |

## Job failure codes

No new code. An upload that cannot be displayed once the job starts (corrupt
MHTML, no HTML part) fails as `not-html`.

## Fallback messages (wizard, FR-010)

After an address import fails as `blocked` or `login-required`, the wizard
shows, below the 012 message:

> Vous pouvez importer la page depuis votre navigateur : ouvrez-la, puis
> « Fichier › Enregistrer sous… › Page web, un seul fichier » (Chrome, Edge),
> ou utilisez l'extension SingleFile (Firefox, Chrome). Déposez ensuite le
> fichier ici.

with a button « Importer la page enregistrée ». Other failure codes show no
fallback.
