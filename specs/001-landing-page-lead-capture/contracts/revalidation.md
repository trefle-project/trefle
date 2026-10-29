# Contract: Cache revalidation

**Owner**: `apps/web` · **Path**: `POST /api/revalidate` · **Caller**: `apps/cms` Payload
hooks · **Auth**: HMAC signature header.

## Request

Headers:
- `X-Revalidate-Signature: <hex HMAC_SHA256(rawBody, REVALIDATE_SECRET)>`
- `Content-Type: application/json`

Body:

```json
{
  "reason": "page-published | page-unpublished | page-changed | domain-changed | domain-deleted",
  "tags": ["page:<id>", "domain:<id>", "page-list"],
  "at": "<ISO timestamp>"
}
```

## Behaviour

1. Recompute HMAC over the raw body; mismatch → `401`, nothing done.
2. `at` older than 5 min → `400` (replay guard).
3. For each tag, call `revalidateTag(tag)`. Unknown tags are ignored.
4. `200 { revalidated: string[] }`.

## Cache tag scheme (set by `web` when rendering)

| Rendered thing | Tags applied |
|---|---|
| A published page at `(host,path)` | `page:<pageId>`, `domain:<domainId>` |
| Host→domain resolution | `domain:<domainId>` |
| Any listing of published pages | `page-list` |

## Producer rules (`cms` hooks)

| Event | Emitted tags |
|---|---|
| page `status` draft→published or published content re-published | `page:<id>`, `domain:<domainId>`, `page-list` |
| page published→draft (unpublish) | `page:<id>`, `domain:<domainId>`, `page-list` |
| page `domain` or `path` changed while published | old + new `domain:<id>`, `page:<id>`, `page-list` |
| domain `isActive` / branding changed | `domain:<id>`, `page-list` |
| domain deleted | `domain:<id>`, `page-list` |

Draft-only saves emit nothing (FR: unpublished edits never affect the live cache).
