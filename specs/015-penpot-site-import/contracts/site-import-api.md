# Contract: Site import endpoints

Collection endpoints on `site-imports`, listed before Payload's own `/:id`
routes (same placement rule as `PageImports.ts`). Every route requires an
admin or editor session (else **403**, as in 012) and answers **404** when
`PENPOT_IMPORT` is not `on` (research P14). Errors use the 012 shape:
`{ "errors": [{ "code": "...", "message": "<French>" }] }`.

## POST `/api/site-imports/analyse?domain=<id>`

Multipart, one part: `file` (the `.penpot`). The domain is in the **query
string**, so it can be checked before the body is read: the wizard only
shows the drop zone once a domain is chosen (FR-001).

0. `domain` missing, unknown or inactive → 400 `invalid-input` (« Choisissez
   d'abord le domaine du site »). It is checked before the file is read.
1. `content-length` > 100 MB + 64 KB slack → 413 `file-too-large` before
   reading the body.
2. Read the zip's central directory → refuse `not-penpot`, `penpot-v1`,
   `file-too-complex` (research P1 limits). Then parse `manifest.json`, the
   file and its pages. Exactly one file in the manifest is supported (Penpot
   exports one file per `.penpot` unless « with libraries » is chosen;
   extra files → `penpot-libraries`).
3. Look up the paths of the domain's **published** pages, and mark each
   proposed path that matches one (`published: true`, information only).
4. Create the `site-imports` doc (`status: analysed`, `createdBy`, `domain`,
   `fileName`, `penpotFileName`, `penpotPages`) and write the file to
   `SITE_FILES_DIR/<id>`.

**201**
```json
{
  "id": 42,
  "domain": { "id": 3, "hostname": "client-site.example", "defaultLanguage": 1 },
  "publishedPaths": ["/", "/contact"],
  "penpotFileName": "The Journal",
  "pages": [
    {
      "id": "1ac1247f-…",
      "name": "Site",
      "boards": [
        { "id": "3f2428bc-…", "name": "Accueil", "width": 1440, "height": 1501,
          "proposedPath": "/", "published": true, "thumbnail": "data:image/png;base64,…" },
        { "id": "a227ce9d-…", "name": "Articles", "width": 1440, "height": 1271,
          "proposedPath": "/articles" }
      ]
    }
  ]
}
```
Pages with no top-level board are returned with `boards: []`. The wizard
shows « Cette page Penpot ne contient aucun board » for them. Boards come in
reading order (top→bottom, then left→right); `proposedPath` follows research
P13 **within each Penpot page**. `publishedPaths` lets the wizard keep the
« déjà publiée sur ce domaine » mark in sync while the editor edits the
addresses.

## POST `/api/site-imports/:id/start`

JSON:
```json
{
  "penpotPageId": "1ac1247f-…",
  "language": 1,
  "boards": [
    { "id": "3f2428bc-…", "path": "/" },
    { "id": "a227ce9d-…", "path": "/articles" }
  ]
}
```
Checks, in order: doc exists and is `analysed` and owned by the caller, or
caller is admin (else 404/409); file still on disk (else 410
`expired` « L'analyse a expiré, déposez le fichier de nouveau »);
`penpotPageId` is one of the analysed pages; `boards` has 1 to **10**
entries (else 400 `invalid-input`, « 10 pages au maximum par import :
importez les autres dans un second import »), every id a top-level board of
that page, no duplicates; every path passes
`validatePagePath` (the reserved `/confirmation`) and has no space, `?` or
`#` (« pas d'espace, de « ? » ni de « # » dans une adresse. »); paths pairwise distinct
(400 `invalid-input` with the offending board named); the domain recorded at
analysis is still active (else 409 `invalid-input`, « Ce domaine n'est plus
actif »); language exists and is active. There is no `domain` field: the
domain chosen before the analysis cannot change. Then it stores
`penpotPage`, `language` and `boards` (name copied from the analysis), sets
`status: queued`, queues task `site-import` on queue `imports` and calls
`runByID` without awaiting it (012 pattern).

**202** `{ "id": 42, "status": "queued" }`

## POST `/api/site-imports/:id/cancel`

Sets `cancelRequested: true` when the status is `queued` or `running`.
**202**, or 409 in any other state. The job notices it at its next
checkpoint (≤ 2 s) and cleans up (FR-019).

## GET `/api/site-imports/:id` (Payload default)

The wizard polls this every 2 s for `status`, `step`, `progress`,
`errorMessage` and `boards[].page`.

## Error codes

`errorCode` values on the document, and the codes returned by the endpoints:

| Code | Where | French message (shown as is) |
|---|---|---|
| `file-too-large` | analyse | « Ce fichier dépasse 100 Mo. Exportez-le depuis Penpot avec des images plus légères. » |
| `not-penpot` | analyse | « Ce fichier n'est pas un export Penpot. Dans Penpot : menu du fichier › Exporter › fichier .penpot. » |
| `penpot-v1` | analyse | « Ce fichier vient d'une ancienne version de Penpot. Ouvrez-le dans Penpot 2 puis exportez-le de nouveau. » |
| `penpot-libraries` | analyse | « Ce fichier contient plusieurs fichiers Penpot (bibliothèques incluses). Exportez seulement le fichier du site. » |
| `file-too-complex` | analyse | « Ce fichier est trop volumineux une fois décompressé (limite : 400 Mo, 30 000 éléments). » |
| `invalid-input` | start | names the field or board at fault |
| `expired` | start | see above |
| `page-too-large` | job | « La page « {board} » est trop détaillée pour l'éditeur. Simplifiez-la dans Penpot ou décochez-la. » |
| `fonts-unavailable` | job | see « Job side effects on the domain » |
| `timeout` | job | « L'import a pris trop de temps (6 minutes). Réessayez avec moins de boards. » |
| `internal` | job | « L'import a échoué de façon inattendue. Réessayez ; si le problème continue, prévenez un administrateur. » |

## GET `/api/domains/:id/font-usage`

Admin only (domain settings). For each family of the domain's `fonts`, the
number of the domain's pages whose `builder.css` names it:
**200** `{ "Inter Tight": 6, "EB Garamond": 0 }`. Used by the « Polices du
domaine » rows (FR-028). It is not flag-gated: domain fonts are useful
without the Penpot import.

## Job side effects on the domain

The job's `fonts` step adds the Google families (and weights/styles) the
ticked boards use to the domain's `fonts` (research P8). This is the only
change an import makes outside its own pages and Media, and it is listed in
each page's report. A family Google rejects is not added; it becomes a
substitution. A font download failure (network) fails the import with
`fonts-unavailable` (« Les polices Google n'ont pas pu être récupérées.
Réessayez dans quelques minutes. »), before anything is created.

## Admin UI entry

Two entry points, both rendered only when the flag is on and for admin and
editor users. Both open the same custom admin view,
`/admin/collections/pages/import-penpot` (the `views.wizard` pattern of
`Pages.ts`):
- **Pages list**: a « Importer un site Penpot » button above the list (a
  `beforeListTable` component). It opens the view without a domain, so the
  wizard starts at step 1.
- **Domain edit view**: the same button in the document controls
  (`edit.beforeDocumentControls` on `Domains`), shown for a saved, active
  domain. It opens the view with `?domain=<id>`, so step 1 is already filled
  and the wizard opens on step 2. An unknown or inactive `domain` in the URL
  is ignored: the wizard starts at step 1.

The view hosts the four-step wizard:
1. **Domaine**: select of active domains (label + hostname), required.
   Nothing else is shown until one is chosen. With a single active domain,
   it is pre-selected but still shown.
2. **Fichier**: drop zone, `.penpot` only, under a reminder of the chosen
   domain (« Site pour client-site.example », with « Changer de
   domaine », which goes back to step 1 and discards the analysis).
3. **Pages**: Penpot page selector, board table (checkbox, thumbnail or
   size, name, editable address with live validation and the « déjà publiée
   sur ce domaine » mark; at most 10 ticked, the first 10 by default, an
   11th tick refused with the same message as the endpoint), language select pre-filled from the domain,
   « Importer N pages ».
4. **Import**: step and progress, « Annuler », then the list of created
   drafts with links, or the French error.

Loading, empty, error and success states are all handled (constitution V).

## Report dismissal

« Supprimer le rapport » on a site-imported page PATCHes the import's
`dismissedReports` (a JSON list of page ids, the one field staff may write):
`PATCH /api/site-imports/:id` `{ "dismissedReports": ["101", "102"] }`.
The panel re-reads the list first and adds its page. « Masquer le rapport »
only folds the panel, remembered in the viewer's browser (as 012).
