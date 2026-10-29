# Contract: media alias map (CMS → renderer)

Lets published pages keep working when a media file is replaced, and makes
every rendered image/asset URL point at the media item's **current** key
(research R11).

## Endpoint

`GET /api/media/aliases` — Payload custom endpoint
(`apps/cms/src/endpoints/mediaAliases.ts`).

**Auth**: service caller or admin only (same check as
`endpoints/pageView.ts`: `user.isService === true || role === "admin"`);
otherwise `403`, empty body. The renderer calls it with its existing service
credentials (`authHeader()` in `apps/web/src/lib/payload-client`).

**Response `200`** — `application/json`:

```json
{
  "aliases": {
    "photo.jpg": "photo-3fa1c09b.jpg",
    "photo-1.jpg": "photo-3fa1c09b.jpg",
    "fonts/inter-400-latin.woff2": "fonts/inter-400-latin-9c2e11d0.woff2"
  },
  "generatedAt": "2026-10-09T15:00:00.000Z"
}
```

- Keys and values are **object keys relative to `ASSET_ORIGIN`** (exactly what
  `imgproxy.ts` extracts from a URL), including any prefix.
- Every old key maps to the **final** current key (chains resolved).
- A key that is some document's current `filename` never appears as an alias
  key (current keys win).
- Only media documents with a non-empty `previousFilenames` contribute; an
  empty map is `{ "aliases": {} }`.
- Deleted media contribute nothing (their old URLs 404, as today).

**Errors**: `5xx` → renderer treats as "no aliases" for that request and logs
a warning; it never fails a page render because of this endpoint.

## Renderer use

- Fetched through the payload client with `next: { tags: ["media-aliases"],
  revalidate: 60 }`, once per render (deduplicated by the fetch cache).
  60 s, not an hour: the CMS invalidates from `afterChange`, before its
  transaction commits, so a render in between can re-cache the old map;
  the cap keeps that within FR-014's minute.
- Applied before signing in `rewriteImageTags`, `rewriteBackgroundUrls`, and
  the new `rewriteAssetLinks` (`<a href>` under `ASSET_ORIGIN`, e.g. PDFs):
  `key = aliases[key] ?? key`.
- `ASSET_ORIGIN` URLs that are not rewritten to imgproxy (asset links) keep
  the asset host, with the aliased key.

## Invalidation

`media` `afterChange` (when `filename` changed) and `afterDelete` call
`revalidateTags({ reason: "media", tags: ["media-aliases"] })` through the
existing signed `/api/revalidate` path (`apps/cms/src/hooks/revalidate.ts`).
`/api/revalidate` expires the `media-aliases` tag with
`revalidateTag(tag, { expire: 0 })` (all other tags keep `"max"`): stale data
is never served, so the very next render after a replacement blocks on the
fresh map instead of rendering once more with the old key (whose object is
already deleted). The map is small, so the blocking fetch is cheap. Lot 1
renders every page request, so that request already shows the new image
(FR-014: ≤ 1 minute). Lot 3 adds the edge purge of the pages concerned.

## Tests (Principle IV)

- CMS: chain `a → b → c` ⇒ `{a: c, b: c}`; current key never aliased;
  deleted media ⇒ absent; non-service caller ⇒ 403.
- Renderer: `<img src>`, CSS `url()` (bare, quoted, `&quot;`) and `<a href>`
  under `ASSET_ORIGIN` are rewritten through the map; other URLs untouched;
  endpoint failure ⇒ unchanged output.
