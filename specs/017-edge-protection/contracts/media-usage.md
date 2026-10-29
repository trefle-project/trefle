# Contract: media usage (admin)

Where a media item is used, so an editor is warned before overwriting it
(spec FR-020, FR-021; research R21).

## Endpoint

`GET /api/media/:id/usage` — Payload custom endpoint on `media`
(`apps/cms/src/endpoints/mediaUsage.ts`, logic in `apps/cms/src/lib/media-usage.ts`).

**Auth**: admin or editor (same rule as `media.update`, `isAdminOrEditor`);
otherwise `403`. Unknown id → `404`.

**Response `200`**:

```json
{
  "pages": [
    {
      "id": 12,
      "title": "Accueil traiteur",
      "domain": "www.client-site.example",
      "path": "/",
      "status": "published",
      "isVariant": false,
      "via": "content",
      "adminUrl": "/admin/collections/pages/12"
    },
    {
      "id": 31,
      "title": "Mariage — variante B",
      "domain": "www.client-site.example",
      "path": null,
      "status": "draft",
      "isVariant": true,
      "via": "shareImage",
      "adminUrl": "/admin/collections/pages/31"
    }
  ],
  "domains": [
    { "id": 2, "hostname": "example.com", "via": "defaultShareImage", "adminUrl": "/admin/collections/domains/2" }
  ],
  "total": 3
}
```

**Matching rules**
- `via: "content"` — `builder.html` or `builder.css` contains `/<key>` for the
  media's current `filename` **or** any `previousFilenames[].filename`.
- `via: "shareImage"` — `seo.ogImage` equals the media id.
- `via: "defaultShareImage"` (domains) — `branding.defaultOgImage` equals the
  media id.
- `via: "favicon"` (domains) — `branding.faviconUrl` (free text) contains
  `/<key>` for the current or a previous key.
- A page appears once (content wins over share image). Pages of every status
  are included. `isVariant` is true when `experimentOf` is set.
- Ordered: published before draft, then by title.

**Empty**: `{ "pages": [], "domains": [], "total": 0 }`.

## Admin UI behaviour

**Panel « Utilisée dans »** (`MediaUsage.client.tsx`, `beforeDocumentControls`
on `media`):
- Loading: « Recherche des pages qui utilisent cette image… »
- Empty: « Cette image n'est utilisée dans aucune page. »
- Non-empty: « Utilisée dans N page(s) : » then one line per page — title
  (link to `adminUrl`), domain + path, « publiée » / « brouillon », « variante
  A/B » when relevant, « image de partage » when `via = shareImage`; domains as
  « Image de partage par défaut du domaine … » or « Favicon du domaine … ». First 20 lines, then « et N
  autres » (expands).
- Error: « Impossible de vérifier où cette image est utilisée. » — replacing
  then asks for confirmation as if used (fail safe).

**Confirmation before overwrite** (`MediaReplaceConfirm.client.tsx`):
- Triggered on save only when the upload field holds a **new file** and
  `total > 0` (or the usage lookup failed).
- Text: « Attention, l'image que vous voulez remplacer est utilisée dans ces
  pages : » + the same list (first 20 + « et N autres ») + « La nouvelle image
  apparaîtra dans toutes ces pages. Pour ne changer qu'une page, ajoutez plutôt
  une nouvelle image dans la médiathèque et choisissez-la dans cette page. »
- Buttons: « Remplacer partout » (proceeds with the normal save) and
  « Annuler » (closes; nothing saved; the chosen file stays selected so the
  editor can remove it).
- Saving other fields (e.g. `alt`) without a new file never asks.

**Deletion blocked** (`hooks/media-delete-guard.ts`, research R22):
- `beforeDelete` on `media`: if usage `total > 0` → `APIError` 409,
  « Impossible de supprimer cette image : elle est utilisée dans N page(s) :
  A, B, C… Retirez-la de ces pages ou remplacez son fichier, puis
  réessayez. » (first 5 titles, then « et N autres »).
- Applies to the document view, the list view (bulk: per item) and the API.
- Skipped only when `req.context.allowUsedMediaDelete === true` (import
  cleanups).
- The panel shows « La suppression est bloquée tant que l'image est
  utilisée. » when `total > 0`.

## Tests (Principle IV)

`apps/cms/tests/media-usage.test.ts`: content match on current key, on a
previous key, on CSS `url()`; share image; domain default share image; domain favicon URL; no
match for a different file whose name contains the key as a substring
(`/<key>` boundary); dedup; ordering; 403 for a non-editor.
`apps/cms/tests/media-delete-guard.test.ts`: used → 409 with page titles and
the object still present; unused → deleted; bulk delete mixed → only unused
deleted; `allowUsedMediaDelete` context → deleted.
