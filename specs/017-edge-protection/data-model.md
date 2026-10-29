# Data model: Edge protection & media caching (017, lot 1)

Only the media change touches the database. Everything else is
configuration held in the repository (`infra/cloudflare/`, Caddyfile) or in
existing collections.

## Media (`media` collection) — changed

| Field | Type | Notes |
|---|---|---|
| `filename` | text (existing, Payload upload) | From now on always `<base>-<hash8>.<ext>`; `hash8` = first 8 hex chars of the file's SHA-256. Existing documents keep their key. |
| `previousFilenames` | array of `{ filename: text }` — **new**, hidden in the admin, read-only, `access.update` system only | Every key this media item has had before its current one, oldest first. Appended by the `beforeChange` hook when `filename` changes on update. Never edited by people. |

**Validation / rules**
- A new upload's key MUST NOT equal any existing `filename` or any
  `previousFilenames[].filename` (guaranteed in practice by the hash suffix;
  Payload's own `getSafeFileName` still increments on a clash).
- Replacing the file appends the old `filename` once; replacing it again
  appends the intermediate key too (chain `a → b → c` stored as
  `previousFilenames = [a, b]`, `filename = c`).
- Deleting the media removes its aliases with it (they live on the document).

**State transitions**

```text
uploaded (filename = k1)
  └─ file replaced → filename = k2, previousFilenames = [k1]   (Payload deletes object k1)
       └─ file replaced → filename = k3, previousFilenames = [k1, k2]
  └─ deleted → document gone, aliases gone, object deleted        (only when unused — R22; take-down: + purge, R12)
```

**Migration**: `<timestamp>_media_previous_filenames` adds the array table;
down path drops it. Expand only; nothing reads it until the endpoint ships in
the same change.

## Fonts (`fonts` collection) — behaviour only

Same unique-key hook as media (keys under the `fonts/` prefix). No alias
field: fonts are referenced through the `domains.fonts[].files` relationship,
so the renderer always resolves the current URL.

## Media alias map — derived, not stored

`{ [oldKey: string]: currentKey: string }` built from every media document
with a non-empty `previousFilenames`, each old key mapped to the **current**
`filename`. Served by [contracts/media-aliases.md](contracts/media-aliases.md);
cached in the renderer under the tag `media-aliases`.

## Media usage — derived, not stored

For one media item: `{ pages: [{ id, title, domain, path, status, isVariant,
via: "content" | "shareImage", adminUrl }], domains: [{ id, hostname,
via: "defaultShareImage" | "favicon" }] }`. A page appears once even if it matches several
keys or both via content and share image (`via` lists the first match: content
wins). Computed on request (research R21); see
[contracts/media-usage.md](contracts/media-usage.md).

## Domain (`domains` collection) — data change, no schema change

The client domain served at the root changes hostname:
`client-site.example` → `www.client-site.example`
(operator action during the switch, R17). Its cache tags derive from the
hostname and follow automatically.

## Protected host — configuration entity (repository)

Declared in `infra/cloudflare/` and the Caddyfile, not in the database.

| Attribute | Values |
|---|---|
| hostname | Trefle hosts (`CMS_HOSTNAME`, `WEB_HOSTNAMES`, `IMG_HOSTNAME`, `ASSET_HOSTNAME`, GrowthBook ×2) and client `www.` custom hostnames |
| kind | `page` · `image` · `asset` · `internal` |
| proxied | always `true` after the switch |
| cache | `page`: bypass except `/_next/static/*` · `image`: eligible, origin TTL, Vary Accept (webp) · `asset`: eligible, origin TTL · `internal`: default (dynamic) |
| access | `internal`: edge IP list `trefle_admin` + Caddy `client_ip` check · others: public |
| certificate | origin: Caddy DNS-01 via `acme-delegate` · edge: Cloudflare (universal for our zone, SaaS HTTP DCV for clients) |

Full per-kind behaviour: [contracts/edge-config.md](contracts/edge-config.md).
